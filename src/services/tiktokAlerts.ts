import { Client, TextChannel, EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";
import { safeInterval } from "../utils/safe-interval.js";
import { config } from "../config.js";
import { dedupCache } from "../utils/deduplicationCache.js";

// Service désactivé par défaut. Activer via TIKTOK_ENABLED=true dans .env
const TIKTOK_ENABLED = process.env.TIKTOK_ENABLED === "true";
const TIKTOK_CHANNEL = process.env.TIKTOK_CHANNEL_ID || config.twitterChannel || "";
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

interface TikTokVideo {
  videoId: string;
  username: string;
  description: string;
  url: string;
  thumbnail: string;
  createdAt: string;
}

const trackedAccounts: string[] = (process.env.TIKTOK_ACCOUNTS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

let checkInterval: NodeJS.Timeout | null = null;

async function checkTikTokAccount(username: string): Promise<TikTokVideo[]> {
  const videos: TikTokVideo[] = [];
  try {
    const res = await fetch(`https://www.tiktok.com/@${username}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return videos;
    const html = await res.text();

    const videoMatches = html.matchAll(/"videoId":"(\d+)".*?"text":"(.*?)".*?"createTime":(\d+)/g);
    for (const match of videoMatches) {
      const videoId = match[1];
      const description = match[2]?.replace(/\\n/g, " ").slice(0, 200) || "";
      const createTime = match[3];
      videos.push({
        videoId,
        username,
        description,
        url: `https://www.tiktok.com/@${username}/video/${videoId}`,
        thumbnail: `https://www.tiktok.com/@${username}/video/${videoId}`,
        createdAt: new Date(parseInt(createTime) * 1000).toISOString(),
      });
      if (videos.length >= 3) break;
    }
  } catch (err) {
    logger.debug(`[TikTok] Erreur fetch @${username}: ${err instanceof Error ? err.message : String(err)}`);
  }
  return videos;
}

async function checkTikTokVideos(client: Client): Promise<void> {
  if (!TIKTOK_CHANNEL) return;

  for (const username of trackedAccounts) {
    const videos = await checkTikTokAccount(username);
    for (const video of videos) {
      const dedupKey = `tiktok:${video.videoId}`;
      if (dedupCache.isAlreadyProcessed("tiktok", dedupKey)) continue;

      const channel = client.channels.cache.get(TIKTOK_CHANNEL) as TextChannel;
      if (!channel?.isTextBased()) continue;

      const embed = new EmbedBuilder()
        .setTitle(`🎵 Nouveau TikTok de @${username}`)
        .setDescription(video.description || "Nouvelle vidéo TikTok")
        .setColor(0x000000)
        .setURL(video.url)
        .addFields(
          { name: "Créateur", value: `@${username}`, inline: true },
          { name: "Publié le", value: new Date(video.createdAt).toLocaleString("fr-FR"), inline: true },
        )
        .setFooter({ text: "Surveillance System • TikTok Alerts" })
        .setTimestamp();

      try {
        await channel.send({ embeds: [embed] });
        await dedupCache.markAsProcessed("tiktok", dedupKey);
        logger.info(`[TikTok] Notification envoyée pour @${username} — vidéo ${video.videoId}`);
      } catch (err) {
        logger.error(`[TikTok] Erreur envoi: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
}

export function startTikTokMonitoring(client: Client): void {
  if (!TIKTOK_ENABLED) {
    logger.info("[TikTok] Service désactivé (TIKTOK_ENABLED != true)");
    return;
  }
  if (trackedAccounts.length === 0) {
    logger.warn("[TikTok] Aucun compte à surveiller (TIKTOK_ACCOUNTS vide)");
    return;
  }
  if (checkInterval) return;

  logger.info(`[TikTok] Surveillance activée — ${trackedAccounts.length} compte(s) — intervalle: 15min`);
  checkInterval = safeInterval("TikTokMonitor", () => checkTikTokVideos(client), CHECK_INTERVAL_MS);
}

export function stopTikTokMonitoring(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}
