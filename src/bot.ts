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
import { startMemoryOptimizer } from "./utils/memoryOptimizer.js";
import { handleEmojiEvents } from "./events/emojis.js";
import { handleModerationEvents } from "./events/moderation.js";
import { handleVoiceStateUpdate as handleTempVoice } from "./services/tempVoiceService.js";
import { initDisTube } from "./services/musicService.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates,
  ],
  // Limite la croissance memoire des caches (bot 24/7). Les managers non listes
  // gardent leur comportement par defaut.
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    MessageManager: 25, // 25 messages max par salon (reduced from 50)
    ThreadManager: 25, // 25 threads max (reduced from 50)
    GuildMemberManager: 100, // 100 membres max (reduced from 200)
    // --- Caches inutiles : désactivés ---
    PresenceManager: 0,
    GuildInviteManager: 0,
    StageInstanceManager: 0,
    GuildBanManager: 0,
    AutoModerationRuleManager: 0,
    ReactionUserManager: 0, // Pas de cache des réactions utilisateurs
    GuildEmojiManager: 50, // Limite les emojis en cache
  }),
  // Purge plus agressive
  sweepers: {
    ...Options.DefaultSweeperSettings,
    messages: {
      interval: 1800, // toutes les 30 min (reduced from 3600)
      lifetime: 900, // supprime après 15 min d'inactivité (reduced from 1800)
    },
    threads: {
      interval: 1800,
      lifetime: 900,
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

  // Health check HTTP (Docker/monitoring)
  const railwayPort = parseInt(process.env.PORT || "0", 10);
  const metricsPort = parseInt(process.env.METRICS_PORT || "3005", 10);

  // On Railway: only one port is exposed. Start control server on PORT.
  // The control server already handles /metrics, /api/health, etc.
  if (railwayPort) {
    // Start control server on Railway's PORT (handles all traffic)
    startControlServer(railwayPort, client).catch(() =>
      logger.warn("[Startup] Control server failed to start on Railway PORT"),
    );
  } else {
    // Local dev: start all servers on their own ports
    try {
      startHealthServer(3000);
    } catch {
      logger.warn("Health server failed to start (port 3000 in use?)");
    }
    try {
      startMetricsServer(metricsPort);
    } catch {
      logger.warn(`Metrics server failed to start (port ${metricsPort} in use?)`);
    }
    startControlServer(config.controlPort || 3002, client).catch(() =>
      logger.warn("[Startup] Control server failed to start"),
    );
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
  const criticalFailed = healthResults.filter((r) => !r.passed && r.critical).length;
  const nonCriticalFailed = healthResults.filter((r) => !r.passed && !r.critical).length;
  if (criticalFailed > 0) {
    logger.error(`\n[HEALTHCHECK] LANCEMENT BLOQUE : ${criticalFailed} anomalie(s) critique(s).`);
    logger.error("[HEALTHCHECK] Corrigez les variables .env ou fichiers manquants.");
    process.exit(1);
  }
  if (nonCriticalFailed > 0) {
    logger.warn(`[HEALTHCHECK] ${nonCriticalFailed} anomalie(s) non-critique(s) — démarrage autorisé.`);
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
  startMemoryOptimizer();

  // Salons vocaux temporaires
  client.on("voiceStateUpdate", (oldState, newState) => {
    void handleTempVoice(client, oldState, newState);
  });

  // Initialiser DisTube (système de musique)
  initDisTube(client);
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
