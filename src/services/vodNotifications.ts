import { Client, TextChannel, EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";
import { safeInterval } from "../utils/safe-interval.js";
import { config } from "../config.js";
import prisma from "../prisma.js";

const CHECK_INTERVAL_MS = 60 * 1000;

let vodInterval: NodeJS.Timeout | null = null;
const notifiedVods = new Set<string>();

interface TwitchVod {
  streamerName: string;
  vodId: string;
  title: string;
  url: string;
  thumbnail: string;
  duration: string;
  createdAt: string;
}

async function fetchRecentVods(streamerName: string): Promise<TwitchVod[]> {
  const vods: TwitchVod[] = [];
  try {
    const clientId = config.twitchClientId;
    const clientSecret = config.twitchClientSecret;
    if (!clientId || !clientSecret) return vods;

    const tokenRes = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`, { method: "POST" });
    if (!tokenRes.ok) return vods;
    const tokenData = await tokenRes.json() as any;

    const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${streamerName}`, {
      headers: { "Client-ID": clientId, Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!userRes.ok) return vods;
    const userData = await userRes.json() as any;
    const userId = userData.data?.[0]?.id;
    if (!userId) return vods;

    const vodRes = await fetch(`https://api.twitch.tv/helix/videos?user_id=${userId}&type=archive&first=3`, {
      headers: { "Client-ID": clientId, Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!vodRes.ok) return vods;
    const vodData = await vodRes.json() as any;

    for (const vod of vodData.data ?? []) {
      vods.push({
        streamerName,
        vodId: vod.id,
        title: vod.title,
        url: vod.url,
        thumbnail: vod.thumbnail_url?.replace("%{width}", "1280").replace("%{height}", "720") || "",
        duration: vod.duration,
        createdAt: vod.created_at,
      });
    }
  } catch (err) {
    logger.debug(`[VODs] Erreur fetch ${streamerName}: ${err instanceof Error ? err.message : String(err)}`);
  }
  return vods;
}

async function checkVods(client: Client): Promise<void> {
  const channel = client.channels.cache.get(config.twitterChannel || "") as TextChannel;
  if (!channel?.isTextBased()) return;

  const streamers = (process.env.TWITCH_ACCOUNTS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const streamer of streamers) {
    const vods = await fetchRecentVods(streamer);
    for (const vod of vods) {
      if (notifiedVods.has(vod.vodId)) continue;
      notifiedVods.add(vod.vodId);
      if (notifiedVods.size > 200) {
        const first = notifiedVods.values().next().value;
        if (first) notifiedVods.delete(first);
      }

      const embed = new EmbedBuilder()
        .setTitle(`📺 VOD — ${streamer}`)
        .setDescription(`**${vod.title}**\nDurée: ${vod.duration}`)
        .setColor(0x9146ff)
        .setURL(vod.url)
        .addFields(
          { name: "Streameur", value: streamer, inline: true },
          { name: "Publié le", value: new Date(vod.createdAt).toLocaleString("fr-FR"), inline: true },
        )
        .setFooter({ text: "Surveillance System • VOD Notifications" })
        .setTimestamp();

      if (vod.thumbnail) embed.setImage(vod.thumbnail);

      try {
        await channel.send({ embeds: [embed] });
        logger.info(`[VODs] VOD notifié pour ${streamer}: ${vod.title}`);
      } catch (err) {
        logger.error(`[VODs] Erreur envoi: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
}

export function startVodMonitoring(client: Client): void {
  if (vodInterval) return;
  if (!config.twitchClientId || !config.twitchClientSecret) {
    logger.warn("[VODs] Credentials Twitch manquants — service désactivé");
    return;
  }
  logger.info("[VODs] Surveillance des VODs Twitch activée (intervalle: 1min)");
  vodInterval = safeInterval("VodMonitor", () => checkVods(client), CHECK_INTERVAL_MS);
}

export function stopVodMonitoring(): void {
  if (vodInterval) {
    clearInterval(vodInterval);
    vodInterval = null;
  }
}
