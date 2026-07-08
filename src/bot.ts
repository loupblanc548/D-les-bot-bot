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
import { startHealthServer, setDiscordClient } from "./services/health-http.js";
import { setupAllWebhooks } from "./services/webhookSetup.js";
import { startMetricsServer } from "./services/metrics.js";
import { startControlServer } from "./control-server.js";
import { startDataPruning, pruneOldData } from "./services/data-pruning.js";
import { dedupCache } from "./utils/deduplicationCache.js";
import { runHealthCheck } from "./services/healthcheck.js";
import { buildCommandRouter, applyCommandMiddleware, registerCommands } from "./commandRouter.js";
import { attachInteractionHandlers } from "./interactionHandler.js";
import { attachAutoThread } from "./commands/autoThread.js";
import { startProactiveHealthCheck, startAutoBackup } from "./services/proactiveHealthCheck.js";
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
// Phase 1: Removed DisTube init (music commands deleted — saves ~30MB RAM)
import { startYouTubeLiveChat } from "./services/youtubeLiveChat.js";
import { setRiskCallback } from "./services/risk-engine.js";
import { maybeTriggerInvestigation } from "./services/autonomousInvestigator.js";
import { startAgentBrain, stopAgentBrain } from "./services/agentBrain.js";
import { startPersonalityEngine, stopPersonalityEngine } from "./services/personalityEngine.js";
import { initVoiceMonitoring } from "./services/voiceAgent.js";
import { initTelegramNotifications } from "./services/telegram-notifications.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates,
    // REMOVED: GuildMessageReactions — saves ~15-20MB RAM on large guilds
  ],
  // ─── ULTRA-AGGRESSIVE MEMORY CONFIG ───────────────────────────────────
  // 512MB container: every KB counts. Zero-cache for non-essential managers.
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    // ── ZERO CACHE (completely disabled) ──
    MessageManager: 0,          // No message cache — messages fetched on-demand
    PresenceManager: 0,         // No presence cache — huge RAM saver
    ReactionManager: 0,         // No reaction cache
    ReactionUserManager: 0,     // No reaction user cache
    ThreadManager: 0,           // No thread cache
    GuildInviteManager: 0,      // No invite cache
    StageInstanceManager: 0,    // No stage instance cache
    GuildBanManager: 0,         // No ban cache
    AutoModerationRuleManager: 0,
    // ── TIGHT LIMITS (minimal cache) ──
    UserManager: 10,            // Only 10 users cached globally
    GuildMemberManager: 10,     // Only 10 members cached per guild
    GuildEmojiManager: 50,      // 50 emojis (needed for commands)
    // ── DEFAULT (keep Discord.js defaults) ──
    // GuildManager, GuildTextChannelManager, etc. keep defaults
  }),
  // ─── AGGRESSIVE SWEEPERS ──────────────────────────────────────────────
  sweepers: {
    ...Options.DefaultSweeperSettings,
    messages: {
      interval: 300,            // Every 5 minutes
      lifetime: 120,            // Remove after 2 min of inactivity
    },
    threads: {
      interval: 300,
      lifetime: 120,
    },
    users: {
      interval: 600,            // Every 10 minutes
      filter: () => () => true, // Sweep all cached users
    },
    guildMembers: {
      interval: 600,
      filter: () => () => true, // Sweep all cached members
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
let startupNotificationSent = false;

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
      setDiscordClient(client);
      startHealthServer(3000);
      setupAllWebhooks();
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

  // YouTube Live Chat Bot (détecte les demandes d'ajout dans le chat YouTube Live)
  startYouTubeLiveChat();

  // Investigation OSINT autonome : déclenchée automatiquement quand un utilisateur
  // atteint un niveau de risque CRITIQUE ou ELEVE avec 5+ sanctions
  setRiskCallback((profile) => {
    void maybeTriggerInvestigation(client, profile).catch((err) =>
      logger.error(`[Bot] Erreur investigation autonome: ${err instanceof Error ? err.message : String(err)}`),
    );
  });
  logger.info("✓ Investigation OSINT autonome câblée au risk-engine");

  // Agent IA autonome — scan de messages proactif + auto-résolution d'alertes
  startAgentBrain(client);

  // Moteur de personnalité — John Helldiver répond de façon autonome
  startPersonalityEngine(client);

  // Salons vocaux temporaires
  client.on("voiceStateUpdate", (oldState, newState) => {
    void handleTempVoice(client, oldState, newState);
  });

  // Détection de raids vocaux (5+ connexions en 30s)
  initVoiceMonitoring(client);

  // Phase 1: Removed DisTube init (music commands deleted — saves ~30MB RAM)
  logger.info("✓ Gestionnaires d'evenements initialises");

  // Handlers d'interactions (commandes, boutons, menus, autocomplete)
  attachInteractionHandlers(client);
  attachAutoThread(client);
  startProactiveHealthCheck(client);
  startAutoBackup(168);

  // Notifications Telegram (parallèle à Discord, si configuré)
  initTelegramNotifications();

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

  // Notification de démarrage à l'owner — UNE SEULE FOIS par process
  if (!startupNotificationSent) {
    startupNotificationSent = true;
    await sendDeploymentNotification(
      "Bot démarré avec succès",
      [
        "Connexion Discord établie",
        "Système d'alertes proactive actif",
        "Système de départ invisible (stealth leave) actif",
      ],
      0x43b581,
    );

    // Rapport de statut après 5 secondes (le temps que les guildes se chargent)
    setTimeout(() => void sendStatusReport(), 5000);
  } else {
    logger.info("[Bot] Reconnexion — skip notification de démarrage (déjà envoyé)");
  }
}

// Point d'entrée : la fonction main est appelée depuis index.ts
export { main };
