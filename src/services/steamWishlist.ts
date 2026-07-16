/**
 * steamWishlist.ts — Surveille la wishlist Steam d'un utilisateur
 * et notifie quand un jeu est en promo ou sort.
 *
 * Configuration .env:
 * - STEAM_API_KEY : clé API Steam
 * - STEAM_WISHLIST_STEAM_ID : SteamID64 de l'utilisateur à surveiller
 * - STEAM_WISHLIST_CHANNEL_ID : salon Discord où notifier
 */

import { Client, EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";
import { safeInterval } from "../utils/safe-interval.js";

const STEAM_API_KEY = process.env.STEAM_API_KEY || "";
const STEAM_ID = process.env.STEAM_WISHLIST_STEAM_ID || "";
const CHANNEL_ID = process.env.STEAM_WISHLIST_CHANNEL_ID || "";
const CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6h

interface WishlistItem {
  appid: number;
  name: string;
  price: number | null;
  discount: number;
  releaseDate: number;
  comingSoon: boolean;
}

const notifiedApps = new Set<number>();
let interval: NodeJS.Timeout | null = null;

async function fetchWishlist(): Promise<WishlistItem[]> {
  if (!STEAM_ID) return [];
  try {
    const res = await fetch(
      `https://store.steampowered.com/api/appdetails?appids=${STEAM_ID}&l=french&cc=fr`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return [];
    // Steam wishlist endpoint is not public API, use profile wishlist
    const profileRes = await fetch(
      `https://api.steampowered.com/IWishlistService/GetWishlist/v1/?steamid=${STEAM_ID}&key=${STEAM_API_KEY}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!profileRes.ok) {
      logger.debug(`[SteamWishlist] API HTTP ${profileRes.status}`);
      return [];
    }
    const data = (await profileRes.json()) as { response?: { items?: WishlistItem[] } };
    return data.response?.items ?? [];
  } catch (err) {
    logger.debug(`[SteamWishlist] Erreur: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

async function checkWishlist(client: Client): Promise<void> {
  if (!CHANNEL_ID || !STEAM_ID) return;

  const items = await fetchWishlist();
  if (items.length === 0) return;

  const channel = client.channels.cache.get(CHANNEL_ID);
  if (!channel || !("send" in channel)) return;

  for (const item of items) {
    if (notifiedApps.has(item.appid)) continue;

    // Notify on discount or release
    if (item.discount > 0 || (!item.comingSoon && item.releaseDate > 0)) {
      notifiedApps.add(item.appid);

      const embed = new EmbedBuilder()
        .setTitle(`🎮 ${item.name}`)
        .setColor(item.discount > 0 ? 0x00d26a : 0x5865f2)
        .addFields({
          name: item.discount > 0 ? `💰 Promo -${item.discount}%` : "🎉 Disponible",
          value:
            item.price !== null
              ? `Prix: ${(item.price / 100).toFixed(2)}€`
              : "Gratuit ou prix non disponible",
          inline: true,
        })
        .setURL(`https://store.steampowered.com/app/${item.appid}`)
        .setFooter({ text: "Steam Wishlist Monitor" })
        .setTimestamp();

      if (item.discount > 0) {
        embed.setImage(
          `https://cdn.cloudflare.steamstatic.com/steam/apps/${item.appid}/header.jpg`,
        );
      }

      try {
        await channel.send({
          content: `🔔 **${item.name}** — ${item.discount > 0 ? `Promo -${item.discount}%` : "Disponible maintenant"} !`,
          embeds: [embed],
        });
        logger.info(`[SteamWishlist] Notif: ${item.name} (-${item.discount}%)`);
      } catch (err) {
        logger.error(
          `[SteamWishlist] Erreur envoi: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}

export function startSteamWishlistMonitor(client: Client): void {
  if (!STEAM_ID || !CHANNEL_ID) {
    logger.info(
      "[SteamWishlist] Désactivé — STEAM_WISHLIST_STEAM_ID ou STEAM_WISHLIST_CHANNEL_ID non configuré",
    );
    return;
  }

  if (interval) return;

  logger.info(`[SteamWishlist] Activé — SteamID: ${STEAM_ID}, salon: ${CHANNEL_ID}`);

  setTimeout(() => {
    void checkWishlist(client).catch(() => {});
  }, 15_000);

  interval = safeInterval(
    "SteamWishlist",
    () => {
      void checkWishlist(client).catch(() => {});
    },
    CHECK_INTERVAL,
  );
}
