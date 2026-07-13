import { Client, TextChannel, EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";
import { safeInterval } from "../utils/safe-interval.js";
import { config } from "../config.js";
import { dedupCache } from "../utils/deduplicationCache.js";
import { isValidEmbedImageUrl } from "../utils/image-helpers.js";

// Service désactivé par défaut. Activer via KICK_ENABLED=true dans .env
const KICK_ENABLED = process.env.KICK_ENABLED === "true";
const KICK_CHANNEL = process.env.KICK_CHANNEL_ID || config.twitterChannel || "";
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

const trackedStreamers: string[] = (process.env.KICK_STREAMERS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

let checkInterval: NodeJS.Timeout | null = null;
const liveStatus = new Map<string, boolean>();

interface KickStream {
  username: string;
  isLive: boolean;
  title: string;
  viewerCount: number;
  thumbnail: string;
  url: string;
}

async function checkKickStreamer(username: string): Promise<KickStream | null> {
  try {
    const res = await fetch(`https://kick.com/api/v2/channels/${username}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    return {
      username,
      isLive: data.livestream?.is_live ?? false,
      title: data.livestream?.session_title || data.user?.bio || "Live en cours",
      viewerCount: data.livestream?.viewer_count ?? 0,
      thumbnail: data.livestream?.thumbnail?.src || "",
      url: `https://kick.com/${username}`,
    };
  } catch {
    return null;
  }
}

async function checkKickStreams(client: Client): Promise<void> {
  if (!KICK_CHANNEL) return;

  for (const streamer of trackedStreamers) {
    const stream = await checkKickStreamer(streamer);
    if (!stream) continue;

    const wasLive = liveStatus.get(streamer) ?? false;
    if (stream.isLive && !wasLive) {
      liveStatus.set(streamer, true);
      const dedupKey = `kick:live:${streamer}:${Date.now()}`;
      if (dedupCache.isAlreadyProcessed("kick", dedupKey)) continue;

      const channel = client.channels.cache.get(KICK_CHANNEL) as TextChannel;
      if (!channel?.isTextBased()) continue;

      const embed = new EmbedBuilder()
        .setTitle(`🟣 ${stream.username} est en live sur Kick !`)
        .setDescription(
          `**Titre :** ${stream.title}\n**Spectateurs :** ${stream.viewerCount.toLocaleString()}`,
        )
        .setColor(0x53fc18)
        .setURL(stream.url)
        .setFooter({ text: "Surveillance System • Kick Alerts" })
        .setTimestamp();

      if (stream.thumbnail && isValidEmbedImageUrl(stream.thumbnail))
        embed.setImage(stream.thumbnail);

      try {
        await channel.send({ embeds: [embed] });
        await dedupCache.markAsProcessed("kick", dedupKey);
        logger.info(`[Kick] ${streamer} est en live → notifié`);
      } catch (err) {
        logger.error(`[Kick] Erreur envoi: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else if (!stream.isLive && wasLive) {
      liveStatus.set(streamer, false);
      logger.info(`[Kick] ${streamer} n'est plus en live`);
    }
  }
}

export function startKickMonitoring(client: Client): void {
  if (!KICK_ENABLED) {
    logger.info("[Kick] Service désactivé (KICK_ENABLED != true)");
    return;
  }
  if (trackedStreamers.length === 0) {
    logger.warn("[Kick] Aucun streamer à surveiller (KICK_STREAMERS vide)");
    return;
  }
  if (checkInterval) return;

  logger.info(
    `[Kick] Surveillance activée — ${trackedStreamers.length} streamer(s) — intervalle: 5min`,
  );
  checkInterval = safeInterval("KickMonitor", () => checkKickStreams(client), CHECK_INTERVAL_MS);
}

export function stopKickMonitoring(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}
