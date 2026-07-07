import { Client, TextChannel, EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";
import { sanitizeForLog } from "../utils/stripHtml.js";
import { safeInterval } from "../utils/safe-interval.js";
import { config } from "../config.js";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
let clipInterval: NodeJS.Timeout | null = null;
const notifiedClips = new Set<string>();

interface TwitchClip {
  clipId: string;
  streamerName: string;
  title: string;
  url: string;
  thumbnail: string;
  duration: number;
  creatorName: string;
}

async function fetchRecentClips(streamerName: string): Promise<TwitchClip[]> {
  const clips: TwitchClip[] = [];
  try {
    const clientId = config.twitchClientId;
    const clientSecret = config.twitchClientSecret;
    if (!clientId || !clientSecret) return clips;

    const tokenRes = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`, { method: "POST" });
    if (!tokenRes.ok) return clips;
    const tokenData = await tokenRes.json() as any;

    const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${streamerName}`, {
      headers: { "Client-ID": clientId, Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!userRes.ok) return clips;
    const userData = await userRes.json() as any;
    const userId = userData.data?.[0]?.id;
    if (!userId) return clips;

    const startedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const clipRes = await fetch(`https://api.twitch.tv/helix/clips?broadcaster_id=${userId}&started_at=${startedAt}&first=5`, {
      headers: { "Client-ID": clientId, Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!clipRes.ok) return clips;
    const clipData = await clipRes.json() as any;

    for (const clip of clipData.data ?? []) {
      clips.push({
        clipId: clip.id,
        streamerName,
        title: clip.title,
        url: clip.url,
        thumbnail: clip.thumbnail_url,
        duration: clip.duration,
        creatorName: clip.creator_name,
      });
    }
  } catch (err) {
    logger.debug(`[Clips] Erreur fetch: ${sanitizeForLog(err instanceof Error ? err.message : String(err))}`);
  }
  return clips;
}

async function checkClips(client: Client): Promise<void> {
  const channel = client.channels.cache.get(config.twitterChannel || "") as TextChannel;
  if (!channel?.isTextBased()) return;

  const streamers = (process.env.TWITCH_ACCOUNTS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const streamer of streamers) {
    const clips = await fetchRecentClips(streamer);
    for (const clip of clips) {
      if (notifiedClips.has(clip.clipId)) continue;
      notifiedClips.add(clip.clipId);
      if (notifiedClips.size > 200) {
        const first = notifiedClips.values().next().value;
        if (first) notifiedClips.delete(first);
      }

      const embed = new EmbedBuilder()
        .setTitle(`🎬 Clip — ${streamer}`)
        .setDescription(`**${clip.title}**\nCréé par ${clip.creatorName} • ${clip.duration}s`)
        .setColor(0x9146ff)
        .setURL(clip.url)
        .addFields(
          { name: "Streameur", value: streamer, inline: true },
          { name: "Créateur du clip", value: clip.creatorName, inline: true },
        )
        .setFooter({ text: "Surveillance System • Clip Forwarding" })
        .setTimestamp();

      if (clip.thumbnail) embed.setImage(clip.thumbnail);

      try {
        await channel.send({ embeds: [embed] });
        logger.info(`[Clips] Clip notifié: ${sanitizeForLog(clip.title)}`);
      } catch (err) {
        logger.error(`[Clips] Erreur envoi: ${sanitizeForLog(err instanceof Error ? err.message : String(err))}`);
      }
    }
  }
}

export function startClipForwarding(client: Client): void {
  if (clipInterval) return;
  if (!config.twitchClientId || !config.twitchClientSecret) {
    logger.warn("[Clips] Credentials Twitch manquants — service désactivé");
    return;
  }
  logger.info("[Clips] Clip forwarding Twitch activé (intervalle: 5min)");
  clipInterval = safeInterval("ClipForwarding", () => checkClips(client), CHECK_INTERVAL_MS);
}

export function stopClipForwarding(): void {
  if (clipInterval) {
    clearInterval(clipInterval);
    clipInterval = null;
  }
}
