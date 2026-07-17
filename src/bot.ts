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
import { initProactiveAlerts, sendConsolidatedStartupReport } from "./services/proactiveAlerts.js";
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
import { startAgentBrain, stopAgentBrain as _stopAgentBrain } from "./services/agentBrain.js";
import {
  startPersonalityEngine,
  stopPersonalityEngine as _stopPersonalityEngine,
} from "./services/personalityEngine.js";
import { initVoiceMonitoring } from "./services/voiceAgent.js";
import { initTelegramNotifications } from "./services/telegram-notifications.js";
import { setClient } from "./services/clientRef.js";
import { initNetworkResilience, savePresence } from "./services/networkResilience.js";
import { startInfraWatchdog, stopInfraWatchdog } from "./services/infraWatchdog.js";
import { startConfigCacheCleanup, stopConfigCache } from "./services/configCache.js";
import { registerAlertDispatcher } from "./services/circuitBreaker.js";
import { formatSecurityAlert } from "./services/loreAlertDispatcher.js";
import { loadMemoriesFromDb } from "./services/agentMemory.js";
import { startBridgeServer, stopBridgeServer } from "./infrastructure/bridge/bridgeServer.js";
import { startDmCleanup, stopDmCleanup } from "./services/dmCleanup.js";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

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
    MessageManager: 0, // No message cache — messages fetched on-demand
    PresenceManager: 0, // No presence cache — huge RAM saver
    ReactionManager: 0, // No reaction cache
    ReactionUserManager: 0, // No reaction user cache
    ThreadManager: 0, // No thread cache
    GuildInviteManager: 0, // No invite cache
    StageInstanceManager: 0, // No stage instance cache
    GuildBanManager: 0, // No ban cache
    AutoModerationRuleManager: 0,
    // ── TIGHT LIMITS (minimal cache) ──
    UserManager: 10, // Only 10 users cached globally
    GuildMemberManager: 10, // Only 10 members cached per guild
    GuildEmojiManager: 50, // 50 emojis (needed for commands)
    // ── DEFAULT (keep Discord.js defaults) ──
    // GuildManager, GuildTextChannelManager, etc. keep defaults
  }),
  // ─── AGGRESSIVE SWEEPERS ──────────────────────────────────────────────
  sweepers: {
    ...Options.DefaultSweeperSettings,
    messages: {
      interval: 300, // Every 5 minutes
      lifetime: 120, // Remove after 2 min of inactivity
    },
    threads: {
      interval: 300,
      lifetime: 120,
    },
    users: {
      interval: 600, // Every 10 minutes
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

// ─── Protection anti-redémarrage en boucle ──────────────────────────────────
// Si le bot redémarre trop rapidement (crash loop), on limite les notifications
// et on attend avant de continuer pour éviter de spammer Discord.
const RESTART_LOCK_FILE = join(process.cwd(), ".restart-lock");
const MIN_RESTART_INTERVAL_MS = 30_000; // 30s minimum entre 2 redémarrages
const MAX_RESTARTS_BEFORE_QUARANTINE = 5; // Après 5 redémarrages rapides, pause longue
const QUARANTINE_DURATION_MS = 5 * 60_000; // 5 min de pause si crash loop
const LOCK_EXPIRY_MS = 7 * 24 * 60 * 60_000; // 7 jours — le lock s'auto-réinitialise chaque semaine

function checkRestartLoop(): { isLoop: boolean; restartCount: number; waitMs: number } {
  try {
    const now = Date.now();

    if (!existsSync(RESTART_LOCK_FILE)) {
      writeFileSync(
        RESTART_LOCK_FILE,
        JSON.stringify({ count: 1, lastRestart: now, createdAt: now }),
      );
      return { isLoop: false, restartCount: 1, waitMs: 0 };
    }

    const data = JSON.parse(readFileSync(RESTART_LOCK_FILE, "utf-8")) as {
      count: number;
      lastRestart: number;
      createdAt?: number;
    };

    // ─── Expiration hebdomadaire : si le lock a plus de 7 jours, on repart à zéro ──
    const createdAt = data.createdAt ?? data.lastRestart;
    if (now - createdAt > LOCK_EXPIRY_MS) {
      logger.info("[AntiLoop] Lock expiré (>7 jours) — réinitialisation du compteur");
      writeFileSync(
        RESTART_LOCK_FILE,
        JSON.stringify({ count: 1, lastRestart: now, createdAt: now }),
      );
      return { isLoop: false, restartCount: 1, waitMs: 0 };
    }

    const elapsed = now - data.lastRestart;
    const newCount = elapsed < MIN_RESTART_INTERVAL_MS ? data.count + 1 : 1;

    writeFileSync(
      RESTART_LOCK_FILE,
      JSON.stringify({ count: newCount, lastRestart: now, createdAt }),
    );

    if (newCount >= MAX_RESTARTS_BEFORE_QUARANTINE) {
      logger.warn(
        `[AntiLoop] ${newCount} redémarrages rapides détectés — QUARANTINE de ${QUARANTINE_DURATION_MS / 1000}s`,
      );
      writeFileSync(
        RESTART_LOCK_FILE,
        JSON.stringify({ count: 0, lastRestart: now + QUARANTINE_DURATION_MS, createdAt }),
      );
      return { isLoop: true, restartCount: newCount, waitMs: QUARANTINE_DURATION_MS };
    }

    if (elapsed < MIN_RESTART_INTERVAL_MS) {
      const waitMs = MIN_RESTART_INTERVAL_MS - elapsed;
      logger.warn(
        `[AntiLoop] Redémarrage trop rapide (${elapsed}ms) — attente de ${waitMs / 1000}s (restart #${newCount})`,
      );
      return { isLoop: true, restartCount: newCount, waitMs };
    }

    return { isLoop: false, restartCount: newCount, waitMs: 0 };
  } catch {
    return { isLoop: false, restartCount: 0, waitMs: 0 };
  }
}

async function main(): Promise<void> {
  logger.info("=== Discord Surveillance Bot ===");

  // ─── Anti-boucle de redémarrage ───────────────────────────────────────
  const loopCheck = checkRestartLoop();
  if (loopCheck.waitMs > 0) {
    logger.warn(
      `[AntiLoop] Pause de ${loopCheck.waitMs / 1000}s avant de continuer (évite le spam Discord)`,
    );
    await new Promise((resolve) => setTimeout(resolve, loopCheck.waitMs));
  }

  // Mode --register seulement
  if (process.argv.includes("--register")) {
    logger.info("Mode enregistrement des commandes uniquement...");
    await registerCommands();
    logger.info("Enregistrement termine.");
    process.exit(0);
  }

  logger.info("[VERSION] Code build: webhook-fix-v3");
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
    setupAllWebhooks();
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
    logger.warn(
      `[HEALTHCHECK] ${nonCriticalFailed} anomalie(s) non-critique(s) — démarrage autorisé.`,
    );
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
      logger.error(
        `[Bot] Erreur investigation autonome: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  });
  logger.info("✓ Investigation OSINT autonome câblée au risk-engine");

  // ─── MODULE 6: Network Resilience — shard reconnect with backoff ───
  initNetworkResilience(client);
  savePresence({
    status: "online",
    activities: [{ name: "Surveille les Helldivers", type: 3 }],
  });
  logger.info("✓ Network resilience initialise (shard backoff, presence restore)");

  // ─── MODULE 5: Infrastructure Watchdog — memory monitor ───
  // Aligned with --max-old-space-size=4096 (4GB)
  startInfraWatchdog(client, process.env.ALERT_CHANNEL_ID);
  logger.info("✓ Infrastructure watchdog initialise (3.2/3.8/4.0GB thresholds)");

  // ─── MODULE 2: Config Cache — start background cleanup ───
  startConfigCacheCleanup();
  logger.info("✓ Config cache initialise (TTL 15min, max 500 guilds)");

  // ─── MODULE 3: Task Worker — register client ref ───
  setClient(client);
  logger.info("✓ Task worker client ref initialise");

  // ─── MODULE 1+4: Circuit Breaker → Lore Alert Dispatcher ───
  registerAlertDispatcher((alert) => {
    const formatted = formatSecurityAlert({
      type: "circuit-breaker",
      userId: alert.userId,
      guildId: alert.guildId,
      details: `Agent loop exceeded ${alert.loopCount} iterations. Tokens consumed: ${alert.tokensConsumed}. Error: ${alert.error}`,
      telemetry: {
        Interaction: alert.interactionId,
        Loops: alert.loopCount,
        Tokens: alert.tokensConsumed,
      },
    });
    logger.warn(`[CircuitBreaker] Alert dispatched: ${formatted.summary}`);
  });
  logger.info("✓ Circuit breaker alert dispatcher cable au lore alert");

  // ─── MODULE B: Load vector memories from database ───
  void loadMemoriesFromDb().catch((err) =>
    logger.warn(
      `[Bot] Failed to load agent memories: ${err instanceof Error ? err.message : String(err)}`,
    ),
  );

  // ─── HYBRID BRIDGE: Start WebSocket server for Worker offloading ───
  startBridgeServer();
  logger.info("✓ Bridge server initialized (waiting for worker connections)");

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
  registerDestroyClient(() => {
    stopInfraWatchdog();
    stopConfigCache();
    stopBridgeServer();
    stopDmCleanup();
    import("./services/networkResilience.js").then(({ shutdownNetworkResilience }) =>
      shutdownNetworkResilience(),
    );
    import("./services/circuitBreaker.js").then(({ cleanupAllStates }) => cleanupAllStates());
    import("./services/taskWorker.js").then(({ shutdownTaskWorker }) => shutdownTaskWorker());
    client.destroy();
  });
  attachShutdownHandlers();
  attachProcessHandlers();

  // Enregistrement des commandes — skip si redémarrage rapide (anti-spam Discord API)
  const shouldSkipRegister = loopCheck.isLoop && loopCheck.restartCount > 2;
  if (shouldSkipRegister) {
    logger.warn(
      "[AntiLoop] Skip registerCommands (redémarrage rapide — évite le spam API Discord)",
    );
  } else {
    await registerCommands();
  }
  try {
    await client.login(config.token);
  } catch (error) {
    logger.error(
      `❌ Erreur de connexion a Discord: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }

  // ─── Discord client error handlers ───
  client.on("error", (err) => {
    const code = (err as any)?.code;
    logger.error(`[Discord] Client error (code=${code}): ${err.message}`);
    // 2012 = DISALLOWED_BOT_USER — usually from selfbot, non-fatal
    if (code === 2012) {
      logger.warn("[Discord] Erreur 2012 (DISALLOWED_BOT_USER) — probablement le selfbot, non-fatal");
    }
  });

  client.on("warn", (msg) => {
    logger.warn(`[Discord] ${msg}`);
  });

  client.on("shardError", (err, shardId) => {
    logger.error(`[Discord] Shard ${shardId} error: ${err.message}`);
  });

  client.on("shardDisconnect", (event, shardId) => {
    logger.warn(`[Discord] Shard ${shardId} disconnected: code=${event.code}, reason=${event.reason}`);
  });

  client.on("shardReconnecting", (shardId) => {
    logger.info(`[Discord] Shard ${shardId} reconnecting...`);
  });

  // Initialiser le système d'alertes proactive (DM owner)
  initProactiveAlerts(client);

  // Purge auto des messages de statut en DM et log channel (>7 jours)
  startDmCleanup(client);

  // Fortnite Party Bot (fnbr.js) — connecte un compte Fortnite au bot
  try {
    const { startFortnitePartyBot } = await import("./services/fortnitePartyBot.js");
    void startFortnitePartyBot();
  } catch (err) {
    logger.warn(
      `[FortniteBot] Échec d'initialisation: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Notification de démarrage à l'owner — UNE SEULE FOIS par process, message consolidé
  // + skip si crash loop (évite 1200 messages pendant la nuit)
  const skipNotification = loopCheck.isLoop && loopCheck.restartCount > 2;
  if (!startupNotificationSent && !skipNotification) {
    startupNotificationSent = true;
    // Un seul embed consolidé au lieu de 3 messages séparés
    setTimeout(() => void sendConsolidatedStartupReport(), 5000);
  } else if (skipNotification) {
    logger.warn("[AntiLoop] Notification de démarrage skip (crash loop)");
  } else {
    logger.info("[Bot] Reconnexion — skip notification de démarrage (déjà envoyé)");
  }
}

// Point d'entrée : la fonction main est appelée depuis index.ts
export { main };
