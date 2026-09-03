import cron from "node-cron";
import { Client, TextChannel, ChannelType } from "discord.js";
import logger from "../utils/logger.js";
import { config } from "../config.js";
import {
  fetchBoutique,
  buildBoutiqueEmbeds,
  invalidateBoutiqueCache,
} from "../commands/fun/boutique.js";
import { invalidateShopCache } from "../services/fortnite-api.js";
import { getLastPostedShopDate, saveLastPostedShopDate } from "../services/fortniteShopState.js";

const TZ = "Europe/Paris";
const POLL_MS = 2 * 60 * 1000;
const POLL_WINDOW_MS = 24 * 60 * 1000;

let isRunning = false;
let watchTimer: ReturnType<typeof setInterval> | null = null;

function utcShopDay(raw?: string): string {
  if (raw && raw.length >= 10) return raw.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

export async function postBoutiqueToChannel(client: Client): Promise<boolean> {
  if (isRunning) {
    logger.warn("[BoutiqueCron] Déjà en cours, skip");
    return false;
  }
  isRunning = true;

  try {
    invalidateBoutiqueCache();
    invalidateShopCache();
    const data = await fetchBoutique();
    if (!data) {
      logger.warn("[BoutiqueCron] API indisponible, skip");
      return false;
    }

    const shopDay = utcShopDay(data.date);
    if (getLastPostedShopDate() === shopDay) {
      logger.info(`[BoutiqueCron] Boutique ${shopDay} déjà postée, skip`);
      return true;
    }

    const todayUtc = new Date().toISOString().slice(0, 10);
    if (shopDay < todayUtc) {
      logger.info(`[BoutiqueCron] API encore sur ${shopDay}, reset ${todayUtc} pas sorti`);
      return false;
    }

    const embeds = buildBoutiqueEmbeds(data);
    if (embeds.length === 0) {
      logger.warn("[BoutiqueCron] Aucun embed à poster");
      return false;
    }

    const channelId = config.boutiqueChannel;
    if (!channelId) {
      logger.warn("[BoutiqueCron] Aucun salon configuré");
      return false;
    }

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (
      !channel ||
      (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)
    ) {
      logger.warn(`[BoutiqueCron] Salon ${channelId} inaccessible (type=${channel?.type ?? "?"})`);
      return false;
    }

    await (channel as TextChannel).send({
      content: "🛒 **Nouvelle boutique Fortnite**",
      embeds,
    });

    saveLastPostedShopDate(shopDay);
    logger.info(`[BoutiqueCron] Boutique ${shopDay} postée dans ${channelId}`);
    return true;
  } catch (err) {
    logger.error("[BoutiqueCron] Erreur:", String(err));
    return false;
  } finally {
    isRunning = false;
  }
}

function stopWatch(): void {
  if (watchTimer) {
    clearInterval(watchTimer);
    watchTimer = null;
  }
}

function startShopWatch(client: Client): void {
  stopWatch();
  const startedAt = Date.now();
  logger.info("[BoutiqueCron] Fenêtre reset 02h00 Paris — poll toutes les 2 min");

  const tick = async (): Promise<void> => {
    const posted = await postBoutiqueToChannel(client);
    if (posted || Date.now() - startedAt >= POLL_WINDOW_MS) {
      stopWatch();
      if (posted) {
        try {
          const { checkFortniteShop } = await import("./wishlistCron.js");
          await checkFortniteShop(client);
        } catch {
          // wishlist optionnelle
        }
      }
    }
  };

  void tick();
  watchTimer = setInterval(() => {
    void tick();
  }, POLL_MS);
  if (watchTimer.unref) watchTimer.unref();
}

export function startBoutiqueCron(client: Client): void {
  // Reset officiel Fortnite = 00:00 UTC = 02:00 Europe/Paris (été)
  cron.schedule(
    "0 2 * * *",
    () => {
      startShopWatch(client);
    },
    { timezone: TZ },
  );

  // Filet si le poll de 2h a raté (API très en retard)
  cron.schedule(
    "30 2 * * *",
    () => {
      if (getLastPostedShopDate() !== new Date().toISOString().slice(0, 10)) {
        logger.info("[BoutiqueCron] Filet 02h30 — nouvel essai");
        startShopWatch(client);
      }
    },
    { timezone: TZ },
  );

  logger.info("[BoutiqueCron] Reset 02:00 Europe/Paris + filet 02:30 (poll 2 min)");

  // Si le bot redémarre pendant la fenêtre du reset, poster tout de suite
  try {
    const paris = new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
    const mins = paris.getHours() * 60 + paris.getMinutes();
    const todayUtc = new Date().toISOString().slice(0, 10);
    if (mins >= 2 * 60 && mins < 3 * 60 && getLastPostedShopDate() !== todayUtc) {
      logger.info("[BoutiqueCron] Rattrapage au démarrage — fenêtre 02h Paris");
      startShopWatch(client);
    }
  } catch {
    // ignore
  }
}
