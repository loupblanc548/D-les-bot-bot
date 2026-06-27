/**
 * startup.ts — Logique de démarrage (ClientReady)
 *
 * Extrait de index.ts pour réduire sa complexité.
 * Contient : initSchedulers, sendStatusReport, attachStartupLogic
 */

import { Client, Events } from "discord.js";
import { config } from "./config.js";
import logger from "./utils/logger.js";
import { checkWishlistMatches, runWishlistRetrospective } from "./services/fortnite-api.js";
import { startTwitchMonitoring } from "./services/twitch.js";
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
import { startInstantGamingCheck } from "./services/instantgaming.js";
import { startSteamNewsMonitoring, checkTrackedGames } from "./cron/steamNewsCron.js";
import { checkFreeGames } from "./cron/freeGamesCron.js";
import { startTwitterMonitoring, checkTwitterAccounts } from "./cron/twitterCron.js";
import { startDealsMonitoring, checkDeals } from "./cron/dealsCron.js";
import { startGlobalPatchNotesMonitoring, checkPatchNotes } from "./cron/globalPatchNotesCron.js";
import { enableSilentMode, disableSilentMode } from "./managers/ChannelRouter.js";
import { startFreeGamesMonitoring } from "./cron/freeGamesCron.js";
import { startMonthlyMaintenance } from "./cron/monthlyMaintenance.js";
import { registerInterval } from "./shutdown.js";
import { safeInterval } from "./utils/safe-interval.js";
import prisma from "./prisma.js";
import { dedupCache } from "./utils/deduplicationCache.js";
import { startAutoCleanup } from "./services/auto-cleanup.js";
import { startBotHealthCheck } from "./cron/botHealthCheck.js";
import { startNotificationCleanup } from "./cron/notificationCleanup.js";
import { startAlertDigest } from "./cron/alertDigest.js";
import { startDailyGamingContent } from "./cron/dailyGamingContent.js";
import { handleAutoModeration } from "./events/autoModeration.js";
import { handleInviteTracker } from "./events/inviteTracker.js";
import { handleServerCloneDetect } from "./events/serverCloneDetect.js";
import { handleAutoEvents } from "./events/autoEvents.js";
import { startAutoEscalation } from "./cron/autoEscalation.js";
import { startMiscCrons } from "./cron/miscCrons.js";
import { startCommandAutomation } from "./cron/commandAutomation.js";
import { startMemoryGrooming } from "./cron/memoryGrooming.js";
import { startRadioGamingCron } from "./cron/radioGaming.js";
import { attachDramaPrediction } from "./services/dramaPrediction.js";
import { startToxicityScanCron } from "./cron/toxicityScan.js";

// ─── Initialisation des schedulers (boot scan + cron) ──────────────────────

async function initSchedulers(client: Client): Promise<void> {
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
        where: { platform },
        select: { uniqueId: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return entries.map((e) => e.uniqueId);
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

    // Notification propriétaire — DÉSACTIVÉ (spam en cas de crash loop)
    // Le redémarrage est loggé en interne uniquement
    logger.info(`[Startup] ${readyClient.user.tag} démarré — notification Discord désactivée`);

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

    // Rattrapage startup
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

    // Validation des salons
    logger.info("[Startup] Validation des salons Discord...");
    const channelsReport = await validateChannels(client);
    if (channelsReport.errors > 0) {
      logger.warn(`[Startup] ${channelsReport.errors} salon(s) inaccessible(s)`);
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
    const services = [
      () => startMonitoring(client),
      () => startInactivityCheck(client),
      () => startTwitchMonitoring(client),
      () => startPatchNotesService(client),
      () => startBackupService(client),
      () => startInstantGamingCheck(client),
      () => startSteamNewsMonitoring(client),
      () => startDealsMonitoring(client),
      () => startMonthlyMaintenance(client),
      () => startGlobalPatchNotesMonitoring(client),
      () => startAutoCleanup(client),
      () => startBotHealthCheck(client),
      () => startNotificationCleanup(client),
      () => startAlertDigest(client),
      () => startDailyGamingContent(client),
      () => handleAutoModeration(client),
      () => handleInviteTracker(client),
      () => handleServerCloneDetect(client),
      () => handleAutoEvents(client),
      () => startAutoEscalation(client),
      () => startMiscCrons(client),
      () => startCommandAutomation(client),
      () => startMemoryGrooming(client),
      () => startRadioGamingCron(client),
      () => attachDramaPrediction(client),
      () => startToxicityScanCron(client),
    ];
    for (const start of services) {
      try {
        start();
      } catch (e) {
        logger.error(`[Startup] Erreur démarrage service: ${e}`);
      }
    }

    await initSchedulers(client);
    await sendHealthReport(client, healthResults);

    logger.info("");
    logger.info("=".repeat(55));
    logger.info("  ✅ BOT DEMARRE AVEC SUCCES");
    logger.info(`  📡 Surveillance active (${client.guilds.cache.size} serveurs)`);
    logger.info("  🟢 Tous les modules sont operationnels");
    logger.info("=".repeat(55));
  });
}
