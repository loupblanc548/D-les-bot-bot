/**
 * bot.ts — Orchestrateur du bot Discord
 *
 * Extrait de index.ts pour réduire sa complexité.
 * Contient : création du client, connexion DB, initialisation,
 * démarrage des services, point d'entrée main().
 */

import * as Sentry from "@sentry/node";
import { Client, GatewayIntentBits, Options } from "discord.js";
import prisma from "./prisma.js";
import { config, validateConfig } from "./config.js";
import logger from "./utils/logger.js";
import { startHealthServer } from "./services/health-http.js";
import { startMetricsServer } from "./services/metrics.js";
import { startControlServer } from "./control-server.js";
import { startDataPruning, pruneOldData } from "./services/data-pruning.js";
import { dedupCache } from "./utils/deduplicationCache.js";
import { runHealthCheck } from "./services/healthcheck.js";
import { buildCommandRouter, applyCommandMiddleware, registerCommands } from "./commandRouter.js";
import { attachInteractionHandlers } from "./interactionHandler.js";
import { attachStartupLogic } from "./startup.js";
import { attachShutdownHandlers, registerDestroyClient } from "./shutdown.js";
import { attachProcessHandlers } from "./processHandlers.js";
import {
  initProactiveAlerts,
  sendDeploymentNotification,
  sendStatusReport,
} from "./services/proactiveAlerts.js";
import { handleMemberEvents } from "./events/members.js";
import { handleRoleEvents } from "./events/roles.js";
import { handleChannelEvents } from "./events/channels.js";
import { handleMessageEvents, startMapCleanup } from "./events/messages.js";
import { handleEmojiEvents } from "./events/emojis.js";
import { handleModerationEvents } from "./events/moderation.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
  ],
  // Limite la croissance memoire des caches (bot 24/7). Les managers non listes
  // gardent leur comportement par defaut.
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    // --- Caches volumineux : plafonnés pour un bot 24/7 ---
    MessageManager: 50, // 50 messages max par salon en cache
    ThreadManager: 50, // 50 threads max en cache
    GuildMemberManager: 200, // 200 membres max par serveur (évite la croissance infinie)
    // --- Caches inutiles pour ce bot : désactivés (0 = pas de cache) ---
    PresenceManager: 0, // Pas de tracking de présence
    GuildInviteManager: 0, // Pas de cache d'invitations
    StageInstanceManager: 0, // Pas de cache de stages
    GuildBanManager: 0, // Bans gérés par événements, pas de cache
    AutoModerationRuleManager: 0, // Pas d'auto-mod sur ce bot
  }),
  // Purge periodique des entrees obsoletes pour eviter les fuites memoire.
  sweepers: {
    ...Options.DefaultSweeperSettings,
    messages: {
      interval: 3600, // toutes les heures
      lifetime: 1800, // supprime les messages caches inactifs depuis 30 min
    },
    threads: {
      interval: 3600,
      lifetime: 1800,
    },
  },
  presence: {
    status: "online",
    activities: [
      {
        name: "Surveille les Helldivers",
        type: 3, // Watching
      },
    ],
  },
});

let healthResults: import("./services/healthcheck.js").CheckResult[] = [];

async function main(): Promise<void> {
  logger.info("=== Discord Surveillance Bot ===");

  // Mode --register seulement
  if (process.argv.includes("--register")) {
    logger.info("Mode enregistrement des commandes uniquement...");
    await registerCommands();
    logger.info("Enregistrement termine.");
    process.exit(0);
  }

  logger.info("Demarrage...");

  // Health check HTTP (Docker/monitoring) — only if control server won't handle it
  const railwayPort = parseInt(process.env.PORT || "0", 10);
  const metricsPort = parseInt(process.env.METRICS_PORT || "3005", 10);

  // Start control server on Railway's PORT (primary) or controlPort (fallback)
  const controlPort = railwayPort || config.controlPort || 3002;
  startControlServer(controlPort, client).catch(() =>
    logger.warn("[Startup] Control server failed to start"),
  );

  // Start metrics server only if its port differs from the control server port
  // (metrics endpoint /metrics is also served by the control server)
  if (metricsPort !== controlPort) {
    try {
      startMetricsServer(metricsPort);
    } catch {
      logger.warn(`Metrics server failed to start (port ${metricsPort} in use?)`);
    }
  }

  // Health server on port 3000 only if different from control server
  if (3000 !== controlPort) {
    try {
      startHealthServer(3000);
    } catch {
      logger.warn("Health server failed to start (port 3000 in use?)");
    }
  }
  try {
    const { startBullBoard } = await import("./utils/bull-board.js");
    startBullBoard();
  } catch {
    logger.warn("Bull Board failed to start (port 3006 in use?)");
  }
  try {
    const { sendRestartAlert } = await import("./utils/crash-webhook.js");
    void sendRestartAlert();
  } catch {
    // Ignore if crash webhook not configured
  }

  // Nettoyage initial + automatique
  pruneOldData().catch((err) =>
    logger.error(
      `[Pruning] Erreur nettoyage initial: ${err instanceof Error ? err.message : String(err)}`,
    ),
  );
  startDataPruning();

  // Auto-seed des sources YouTube/Twitter depuis le .env
  try {
    const { autoSeedSources } = await import("./utils/auto-seed.js");
    void autoSeedSources();
  } catch (err) {
    logger.warn(`[AutoSeed] Erreur: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Validation de la configuration
  const { errors, warnings } = validateConfig();
  if (warnings.length > 0) {
    logger.warn("⚠️ Avertissements de configuration :");
    warnings.forEach((w) => logger.warn(`  - ${w}`));
  }
  if (errors.length > 0) {
    logger.error("❌ Erreurs de configuration :");
    errors.forEach((e) => logger.error(`  - ${e}`));
    process.exit(1);
  }
  logger.info("✓ Configuration valide");

  // Initialiser Sentry
  if (config.sentryDsn) {
    Sentry.init({
      dsn: config.sentryDsn,
      tracesSampleRate: 0.3,
      environment: process.env.NODE_ENV || "production",
    });
    logger.info("✓ Sentry initialise");
  } else {
    logger.warn("⚠️ SENTRY_DSN non defini — monitoring des erreurs desactive");
  }

  // Connexion base de données + cache anti-doublon
  try {
    await prisma.$connect();
    logger.info("✓ Base de donnees connectee (Neon)");

    try {
      await dedupCache.init();
      try {
        await dedupCache.warmUpFromDatabase(async (platform) => {
          const entries = await prisma.processedCache.findMany({
            where: { platform },
            select: { uniqueId: true },
            orderBy: { createdAt: "desc" },
            take: 100,
          });
          return entries.map((e) => e.uniqueId);
        });
        logger.info("Warm-up du cache anti-doublon termine");
      } catch (warmupError) {
        logger.warn(
          "Warm-up cache: " +
            (warmupError instanceof Error ? warmupError.message : String(warmupError)),
        );
      }
      const stats = dedupCache.getStats();
      const total = Object.values(stats).reduce((a: number, b: number) => a + b, 0);
      logger.info(`✓ Cache anti-doublon initialise (${total} IDs dans ProcessedCache Neon)`);
    } catch (dedupError) {
      logger.warn(
        `⚠ Cache anti-doublon: ${dedupError instanceof Error ? dedupError.message : String(dedupError)}`,
      );
    }
  } catch (error) {
    logger.error(
      `❌ Erreur de connexion a la base de donnees: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }

  // Health check
  healthResults = await runHealthCheck();
  const healthFailed = healthResults.filter((r) => !r.passed).length;
  if (healthFailed > 0) {
    logger.error(`\n[HEALTHCHECK] LANCEMENT BLOQUE : ${healthFailed} anomalie(s).`);
    logger.error("[HEALTHCHECK] Corrigez les variables .env ou fichiers manquants.");
    process.exit(1);
  }

  // Construction du routeur de commandes
  buildCommandRouter();
  applyCommandMiddleware();

  // Handlers d'événements Discord
  handleMemberEvents(client);
  handleRoleEvents(client);
  handleChannelEvents(client);
  handleMessageEvents(client);
  handleEmojiEvents(client);
  handleModerationEvents(client);
  startMapCleanup();
  logger.info("✓ Gestionnaires d'evenements initialises");

  // Handlers d'interactions (commandes, boutons, menus, autocomplete)
  attachInteractionHandlers(client);

  // Logique de démarrage (ClientReady)
  attachStartupLogic(client, healthResults);

  // Handlers d'arrêt gracieux et d'erreurs process
  registerDestroyClient(() => client.destroy());
  attachShutdownHandlers();
  attachProcessHandlers();

  // Enregistrement et connexion
  await registerCommands();
  try {
    await client.login(config.token);
  } catch (error) {
    logger.error(
      `❌ Erreur de connexion a Discord: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }

  // Initialiser le système d'alertes proactive (DM owner)
  initProactiveAlerts(client);

  // Notification de démarrage à l'owner
  await sendDeploymentNotification(
    "Bot démarré avec succès",
    [
      "Connexion Discord établie",
      "Commandes slash enregistrées",
      "Système d'alertes proactive actif",
      "Système de départ invisible (stealth leave) actif",
      "18 sous-commandes /shadow opérationnelles",
      "Outils OSINT Python intégrés (Sherlock, Maigret, Holehe, PhoneInfoga, h8mail, instaloader, Photon, Sublist3r, socialscan, theHarvester, WhatsMyName, CMSeeK, exifread)",
      "24 repos OSINT clonés dans D:\\osint-tools\\",
      "README avec liens API disponible",
    ],
    0x43b581,
  );

  // Rapport de statut après 5 secondes (le temps que les guildes se chargent)
  setTimeout(() => void sendStatusReport(), 5000);
}

// Point d'entrée : la fonction main est appelée depuis index.ts
export { main };
