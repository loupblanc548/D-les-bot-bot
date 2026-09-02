/**
 * startup.ts — Logique de démarrage (ClientReady)
 *
 * Extrait de index.ts pour réduire sa complexité.
 * Contient : initSchedulers, sendStatusReport, attachStartupLogic
 */

import { Client, Events } from "discord.js";
import logger from "./utils/logger.js";
import { MEMORY_CONFIG } from "./utils/memoryConfig.js";
import { config } from "./config.js";
import { checkWishlistMatches, runWishlistRetrospective } from "./services/fortnite-api.js";
import { startTwitchMonitoring } from "./services/twitch.js";
import { startSocialFollowMonitoring } from "./services/socialFollow.js";
import { runStartupRetrospective } from "./services/feeds.js";
import {
  startMonitoring,
  startInactivityCheck,
  runDbSourcesRetrospective,
} from "./services/monitor.js";
import { sendHealthReport } from "./services/healthcheck.js";
import { validateChannels } from "./services/channel-validator.js";
import { validateModeratorRoles } from "./services/permissions.js";
import { startPatchNotesService } from "./services/patchNotes.js";
import { startBackupService } from "./services/backup.js";
import {
  startInstantGamingNewsCheck,
  checkInstantGamingNews,
} from "./services/instantgaming-news.js";
import { startWishlistCron } from "./cron/wishlistCron.js";
import { startHourlyMaintenance } from "./cron/hourlyMaintenance.js";
import { startBoutiqueCron } from "./cron/boutiqueCron.js";
import { checkTrackedGames } from "./cron/steamNewsCron.js";
import { checkFreeGames, startFreeGamesMonitoring } from "./cron/freeGamesCron.js";
import { startTwitterMonitoring, checkTwitterAccounts } from "./cron/twitterCron.js";
import { checkDeals } from "./cron/dealsCron.js";
import { startGlobalPatchNotesMonitoring, checkPatchNotes } from "./cron/globalPatchNotesCron.js";
import { enableSilentMode, disableSilentMode } from "./managers/ChannelRouter.js";
import { startDigestScheduler } from "./services/communityDigest.js";
import { startPersonalDigestScheduler } from "./services/proactiveAgent.js";
import { registerInterval } from "./shutdown.js";
import { safeInterval } from "./utils/safe-interval.js";
import prisma from "./prisma.js";
import { dedupCache } from "./utils/deduplicationCache.js";
import { startBotHealthCheck } from "./cron/botHealthCheck.js";
import { startNotificationCleanup } from "./cron/notificationCleanup.js";
import { startAlertDigest } from "./cron/alertDigest.js";
import { startDailyGamingContent } from "./cron/dailyGamingContent.js";
import { startSyncFreeForDev } from "./cron/syncFreeForDev.js";
import { startSyncTypeScriptSkills } from "./cron/syncTypeScriptSkills.js";
import { startKnowledgeCrons } from "./cron/knowledgeCrons.js";
import { startWazuhWatchdog } from "./cron/wazuhWatchdog.js";
import { startShodanWatchdog } from "./cron/shodanWatchdog.js";
import { startVpsBackupCron } from "./cron/vpsBackup.js";
import { startVpsStorageWatchdog } from "./cron/vpsStorageWatchdog.js";
import { setVpsMaintenanceClient } from "./services/vpsMaintenance.js";
import { generateHoneytokens } from "./services/honeytokenEngine.js";
import { setGitHealerClient } from "./services/gitAutoHealer.js";
import { setKaliClient, ensureKaliContainer } from "./services/agentToolsKali.js";
import { setWhitelistClient } from "./services/killWhitelist.js";
import { setDiscordClient as setSoarClient } from "./services/activeDefenseEngine.js";
import { setSoarGateClient } from "./services/agentSoarGate.js";
import { handleAllInteractions } from "./events/interactions.js";
import { handleAutoModeration } from "./events/autoModeration.js";
import { handleInviteTracker } from "./events/inviteTracker.js";
import { handleServerCloneDetect } from "./events/serverCloneDetect.js";
import { handleAutoEvents } from "./events/autoEvents.js";
import { startMiscCrons } from "./cron/miscCrons.js";
import { startCommandAutomation } from "./cron/commandAutomation.js";
import { startMemoryGrooming } from "./cron/memoryGrooming.js";
import { startLogRetention } from "./cron/logRetention.js";
import { startLogChannelCleanup } from "./cron/logChannelCleanup.js";
import { startSecurityIntegration } from "./services/securityIntegration.js";
import { initHoneypotMonitoring } from "./services/cyberDefense.js";
import { startPriceAlertsMonitoring } from "./services/price-alerts.js";
import { startGameUpdatesMonitoring } from "./services/game-updates.js";
import { initRetailerCron } from "./cron/retailerCron.js";
import { startDealFusion } from "./services/dealFusion.js";
import { startGitHubReleasesMonitor } from "./services/githubReleases.js";
import { startMultiSiteDealsMonitor } from "./services/multiSiteDeals.js";
import { startGameReleaseCountdown } from "./services/gameReleaseCountdown.js";
import { startSteamWishlistMonitor } from "./services/steamWishlist.js";
import { startMediaWorker } from "./infrastructure/processIsolator.js";
import { initLogQueue } from "./queues/logQueue.js";
import { waitForRedisWritable } from "./utils/redisClient.js";
import { initializeModules } from "./modules/index.js";

// ─── Initialisation des schedulers (boot scan + cron) ──────────────────────

async function initSchedulers(client: Client): Promise<void> {
  // ═══════════════════════════════════════════════════════════════════════
  // Directive 3: Initialize Redis/BullMQ Log Queue before anything else
  // ═══════════════════════════════════════════════════════════════════════
  try {
    const redisReady = await waitForRedisWritable();
    if (redisReady) {
      initLogQueue();
    } else {
      logger.warn("[Startup] Redis not writable — LogQueue will use fallback direct writes");
      initLogQueue(); // still call — it has internal fallback
    }
  } catch (e) {
    logger.warn(`[Startup] LogQueue init failed (non-critical): ${e}`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 🔒 PHASE 0 : Prime silencieuse (cache uniquement, AUCUN envoi Discord)
  // Charge les posts des dernieres 24h dans le cache pour creer une
  // barriere de securite immediate et empecher le spam au demarrage.
  // ═══════════════════════════════════════════════════════════════════════
  logger.info("🔒 [PHASE 0] Prime silencieuse du cache (anti-spam demarrage)...");

  // 0a. Prime depuis Neon ProcessedCache (posts deja traites)
  try {
    await dedupCache.warmUpFromDatabase(async (platform) => {
      const entries = await prisma.processedCache.findMany({
        where: { platform: platform as any },
        select: { uniqueId: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return entries.map((e: { uniqueId: string }) => e.uniqueId);
    });
    logger.info("🔒 Cache prime depuis Neon (ProcessedCache) : OK");
  } catch (err) {
    logger.error(`🔒 Echec prime Neon: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 0b. Active le mode silencieux (routeArticle retourne un succes factice)
  enableSilentMode();

  // 0c. Scan silencieux depuis les sources (fetch -> cache, pas d'envoi Discord)
  logger.info("🔒 [PHASE 0] Scan silencieux depuis les sources (24h)...");
  try {
    await Promise.allSettled([
      checkTwitterAccounts(client),
      checkFreeGames(client),
      checkInstantGamingNews(client),
      checkTrackedGames(client),
      checkDeals(client),
      checkPatchNotes(client),
    ]);
    logger.info("🔒 [PHASE 0] Scan silencieux termine (cache prime, 0 message envoye)");
  } catch (err) {
    logger.error(
      `🔒 [PHASE 0] Erreur scan silencieux: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 0d. Desactive le mode silencieux
  disableSilentMode();
  logger.info("🔒 [PHASE 0] Mode silencieux desactive");

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 1 : Scan reel (les items deja en cache seront ignores)
  // ═══════════════════════════════════════════════════════════════════════
  logger.info("♻️ [PHASE 1] Scan reel de demarrage...");

  const results = await Promise.allSettled([
    checkTwitterAccounts(client),
    checkFreeGames(client),
    checkInstantGamingNews(client),
    checkTrackedGames(client),
    checkDeals(client),
    checkPatchNotes(client),
  ]);

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;
  logger.info(`♻️ [PHASE 1] Scan reel termine (${succeeded} OK, ${failed} echec(s))`);

  logger.info("⏱️ Planification Cron...");
  startTwitterMonitoring(client);
  startFreeGamesMonitoring(client);
  startInstantGamingNewsCheck(client);
  startGlobalPatchNotesMonitoring(client);
  startWishlistCron(client);
  startHourlyMaintenance(client);
  startBoutiqueCron(client);
  // Crons désactivés pour économiser de la RAM
  // startShadowBrokerCron(client);
  // startLogChannelCleanup(client);
  // startBrokenImageCleanup(client);
  // startShowcaseLinkCron(client);
  logger.info("⏱️ Tous les crons sont planifies");
}

// car elle est appelée indirectement via startGlobalPatchNotesMonitoring.

// L'import ci-dessus résout le problème.

// ─── Helper : Embed de statut (actuellement désactivé) ─────────────────────

export function attachStartupLogic(
  client: Client,
  healthResults: import("./services/healthcheck.js").CheckResult[],
): void {
  client.once(Events.ClientReady, async (readyClient) => {
    logger.info(`✓ ${readyClient.user.tag} est en ligne !`);
    logger.info(`📡 ${client.guilds.cache.size} serveurs`);

    // ─── Vérifier Ollama (LLM local) ──────────────────────────────────
    try {
      const { checkLocalLlmAvailability, startLocalLlmHealthCheck, preWarmLocalModel } =
        await import("./services/localLlm.js");
      void checkLocalLlmAvailability().then((ok) => {
        if (ok) {
          logger.info("[Startup] 🏠 LLM local (Ollama) disponible — utilisé en priorité");
          if (MEMORY_CONFIG.SKIP_LLM_PREWARM) {
            logger.info(
              "[Startup] Pre-warm Ollama sauté (VPS 8 Go) — le modèle se charge au 1er message",
            );
          } else {
            void preWarmLocalModel();
          }
        } else {
          logger.info(
            "[Startup] LLM local en standby (Qwen non chargé) — APIs cloud. Llama plus tard: LOCAL_LLM_ENABLED=true OLLAMA_STANDBY=false",
          );
        }
        startLocalLlmHealthCheck();
      });

      // ─── Vérifier Piper TTS (synthèse vocale locale) ──────────────────
      try {
        const { checkPiperAvailability } = await import("./services/localTts.js");
        void checkPiperAvailability().then((piperOk) => {
          if (piperOk)
            logger.info("[Startup] 🔊 TTS local (Piper) disponible — voix française locale");
        });
      } catch {
        logger.error("[Silent catch]");
      }

      // ─── Démarrer l'endpoint /health (monitoring externe) ─────────────
      // DÉSACTIVÉ — health-http.ts tourne déjà sur port 3000, ce endpoint sur 7890 cause EADDRINUSE
      // try {
      //   const { startHealthEndpoint } = await import("./services/healthEndpoint.js");
      //   startHealthEndpoint(parseInt(process.env.HEALTH_PORT || "7890", 10));
      // } catch {
      //   // healthEndpoint.ts non disponible — ignorer
      // }
    } catch {
      logger.error("[Silent catch]");
    }

    // ─── DM owner de démarrage SUPPRIMÉ ──────────────────────────────────
    // Un seul embed consolidé est envoyé depuis bot.ts via sendConsolidatedStartupReport
    // qui combine démarrage + statut en un message au lieu de 3 séparés.

    // Wishlist Fortnite (startup + interval)
    logger.info("[Startup] Verification wishlist Fortnite...");
    try {
      const matches = await checkWishlistMatches(client);
      if (matches > 0)
        logger.info(`[FortniteAPI/Wishlist] ${matches} DM(s) envoye(s) au demarrage`);
    } catch (e) {
      logger.error(
        `[Startup] Erreur wishlist check: ${e instanceof Error ? e.message : String(e)}`,
        { stack: e instanceof Error ? e.stack : undefined },
      );
    }
    const wishlistInterval = safeInterval(
      "WishlistMatcher",
      () =>
        checkWishlistMatches(client)
          .then((matches) => {
            if (matches > 0)
              logger.info(`[FortniteAPI/Wishlist] ${matches} DM(s) envoye(s) (check cyclique)`);
          })
          .catch((e) =>
            logger.error(
              `[FortniteAPI/Wishlist] Erreur cyclique: ${e instanceof Error ? e.message : String(e)}`,
              { stack: e instanceof Error ? e.stack : undefined },
            ),
          ),
      24 * 60 * 60 * 1000,
    );
    registerInterval(wishlistInterval);

    // Rattrapage startup (skippable via SKIP_RETROSPECTIVE=true)
    // Also skip if bot was only down < 5 min (normal restart, not a real outage)
    const SHUTDOWN_FILE = "/opt/bot/.last_shutdown";
    let wasRealOutage = true;
    try {
      const { readFile: rf } = await import("node:fs/promises");
      const lastShutdownStr = (await rf(SHUTDOWN_FILE, "utf-8")).trim();
      const lastShutdown = parseInt(lastShutdownStr, 10);
      const downtimeMs = Date.now() - lastShutdown;
      if (downtimeMs < 5 * 60 * 1000) {
        wasRealOutage = false;
        logger.info(
          `[Startup] Bot arrêté seulement ${Math.round(downtimeMs / 1000)}s — rattrapage ignoré (restart normal)`,
        );
      }
    } catch {
      logger.error("[Silent catch]");
    }

    if (process.env.SKIP_RETROSPECTIVE === "true" || !wasRealOutage) {
      logger.info("[Startup] Rattrapage ignoré");
    } else {
      logger.info("[Startup] Rattrapage des actualites manquees...");
      try {
        await runStartupRetrospective(client);
        await runDbSourcesRetrospective(client);
        await runWishlistRetrospective(client);
      } catch (e) {
        logger.error(
          `[Startup] Erreur lors du rattrapage: ${e instanceof Error ? e.message : String(e)}`,
          { stack: e instanceof Error ? e.stack : undefined },
        );
      }
    }

    // Validation des salons
    logger.info("[Startup] Validation des salons Discord...");
    const channelsReport = await validateChannels(client);
    if (channelsReport.errors > 0) {
      logger.warn(`[Startup] ${channelsReport.errors} salon(s) inaccessible(s)`);
    }

    // ─── Topic du salon d'alertes revendeurs ─────────────────────────────
    try {
      const retailerChannel = config.retailerChannel
        ? await client.channels.fetch(config.retailerChannel).catch(() => null)
        : null;
      if (retailerChannel?.isTextBased()) {
        const topic =
          "**Suivi de Produits Revendeurs**\n" +
          "Bienvenue ! Demande à Quent de tracker des produits sur les boutiques en ligne. Tout en langage naturel.\n\n" +
          "**Utilisation** — @mentionne le bot :\n" +
          '• @Quent Track-moi "RTX 4070" sur Amazon\n' +
          "• @Quent Suis ce produit sur Fnac\n" +
          "• @Quent Y'a une promo ?\n" +
          "• @Quent Compare le prix partout\n" +
          "• @Quent Trouve ça sur eBay en Allemagne\n\n" +
          "**Avec une image** — capture + @mention :\n" +
          "• @Quent Scan mon panier → tracke tout\n" +
          "• @Quent Track ça avec l'image\n\n" +
          "**Boutiques** : Amazon · eBay · Fnac · Cdiscount · Darty · LDLC · Rakuten · Decathlon · IKEA · Zalando · Back Market · Vinted · Leboncoin · Alternate · Newegg · Best Buy · Walmart · Etsy · Dealabs · et plus\n\n" +
          "**Pays** : 🇫🇷 FR · 🇩🇪 DE · 🇧🇪 BE · 🇳🇱 NL · 🇪🇸 ES · 🇮🇹 IT · 🇨🇭 CH · 🇬🇧 UK · 🇺🇸 US\n\n" +
          "**Alertes** : 📉 Baisse de prix · ✅ Restock · 🔥 Promo — ici ET en DM\n\n" +
          "🎫 Problème ? Ouvre un ticket dans le salon dédié.";
        await (retailerChannel as import("discord.js").TextChannel).setTopic(topic);
        logger.info("[Startup] ✅ Topic du salon revendeurs défini");
      }
    } catch (e) {
      logger.warn(`[Startup] Impossible de définir le topic du salon revendeurs: ${e}`);
    }

    // Validation des rôles modérateurs
    logger.info("[Startup] Validation des rôles modérateurs...");
    for (const guild of client.guilds.cache.values()) {
      try {
        await validateModeratorRoles(guild);
      } catch (e) {
        logger.warn(
          `[Startup] Erreur validation rôles sur ${guild.id}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    // Démarrage de tous les services
    logger.info("[Startup] Demarrage des services...");
    const botRole = process.env.BOT_ROLE || "primary"; // "primary" (VPS) or "stream-only" (PC local)
    const isPrimary = botRole === "primary";
    if (!isPrimary) {
      logger.info(
        "[Startup] Mode STREAM-ONLY — crons de notification désactivés (le VPS gère les notifications)",
      );
    }

    const services: (() => void)[] = isPrimary
      ? [
          () => startMonitoring(client),
          () => initializeModules(client),
          () => startInactivityCheck(client),
          () => startTwitchMonitoring(client),
          () => startSocialFollowMonitoring(client),
          () => startPatchNotesService(client),
          () => startBackupService(client),
          () => startLogChannelCleanup(client),
          () => startBotHealthCheck(client),
          () => startNotificationCleanup(client),
          () => startAlertDigest(client),
          () => startDailyGamingContent(client),
          () => handleAutoModeration(client),
          () => handleInviteTracker(client),
          () => handleServerCloneDetect(client),
          () => handleAutoEvents(client),
          () => startMiscCrons(client),
          () => startCommandAutomation(client),
          () => startMemoryGrooming(client),
          () => startLogRetention(),
          () => startSecurityIntegration(client),
          () => initHoneypotMonitoring(client),
          () => startPriceAlertsMonitoring(client),
          () => startGameUpdatesMonitoring(client),
          () => initRetailerCron(client),
          () => startDealFusion(client),
          () => startGitHubReleasesMonitor(client),
          () => startMultiSiteDealsMonitor(client),
          () => startGameReleaseCountdown(client),
          () => startSteamWishlistMonitor(client),
          () => startMediaWorker(),
          () => startSyncFreeForDev(),
          () => startSyncTypeScriptSkills(),
          () => startKnowledgeCrons(),
          () => {
            setSoarClient(client);
            setSoarGateClient(client);
            return startWazuhWatchdog();
          },
          () => {
            handleAllInteractions(client);
          },
          () => {
            generateHoneytokens();
          },
          () => {
            setGitHealerClient(client);
          },
          () => {
            setKaliClient(client);
            setWhitelistClient(client);
            return ensureKaliContainer().catch(() => {});
          },
          () => {
            setVpsMaintenanceClient(client);
          },
          () => startShodanWatchdog(),
          () => startVpsBackupCron(),
          () => startVpsStorageWatchdog(),
        ]
      : [
          // Stream-only mode: Go Live stream + watchdog + release data for showcase
          () => startGameReleaseCountdown(client),
          () => startMediaWorker(),
          () => startSyncFreeForDev(),
          () => startSyncTypeScriptSkills(),
          () => startKnowledgeCrons(),
          () => {
            setSoarClient(client);
            setSoarGateClient(client);
            return startWazuhWatchdog();
          },
          () => {
            handleAllInteractions(client);
          },
        ];
    for (const start of services) {
      try {
        start();
      } catch (e) {
        logger.error(`[Startup] Erreur démarrage service: ${e}`);
      }
    }

    await initSchedulers(client);
    startDigestScheduler(client);
    startPersonalDigestScheduler(client);
    await sendHealthReport(client, healthResults);

    logger.info("");
    logger.info("=".repeat(55));
    logger.info("  ✅ BOT DEMARRE AVEC SUCCES");
    logger.info(`  📡 Surveillance active (${client.guilds.cache.size} serveurs)`);
    logger.info("  🟢 Tous les modules sont operationnels");
    logger.info("=".repeat(55));
  });
}
