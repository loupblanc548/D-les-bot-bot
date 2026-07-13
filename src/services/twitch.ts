import {
  TwitchTokenResponse,
  TwitchUsersResponse,
  TwitchStreamsResponse,
  TwitchStream,
} from "../types/api.js";
import logger from "../utils/logger.js";
import { safeInterval } from "../utils/safe-interval.js";
// Service de surveillance Twitch — notifie quand un streamer passe en live
import { Client, EmbedBuilder, TextChannel } from "discord.js";
import prisma from "../prisma.js";
import { config } from "../config.js";

let twitchAccessToken: string | null = null;
let tokenExpiresAt: number = 0;
let twitchInterval: ReturnType<typeof setInterval> | null = null;

// Obtention du token OAuth Twitch
async function getTwitchToken(): Promise<string> {
  if (twitchAccessToken && Date.now() < tokenExpiresAt - 60_000) {
    return twitchAccessToken;
  }

  const res = await fetch(config.twitchOAuthUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.twitchClientId,
      client_secret: config.twitchClientSecret,
      grant_type: "client_credentials",
    }),
  });

  if (!res.ok) {
    throw new Error(`Twitch OAuth error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as TwitchTokenResponse;
  twitchAccessToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return twitchAccessToken!;
}

// Récupère les infos d'un streamer via son login
export async function getStreamerByLogin(
  login: string,
): Promise<{ id: string; login: string; displayName: string; profileImageUrl: string } | null> {
  const token = await getTwitchToken();
  const res = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`, {
    headers: {
      "Client-ID": config.twitchClientId,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) return null;
  const data = (await res.json()) as TwitchUsersResponse;
  return (data.data?.[0] as any) || null;
}

// Vérifie quels streamers suivis sont en live
async function getLiveStreams(logins: string[]): Promise<TwitchStream[]> {
  if (logins.length === 0) return [];

  const token = await getTwitchToken();
  const params = logins.map((l) => `user_login=${encodeURIComponent(l)}`).join("&");
  const res = await fetch(`https://api.twitch.tv/helix/streams?${params}`, {
    headers: {
      "Client-ID": config.twitchClientId,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    logger.error("[TWITCH] API streams error:", res.status);
    return [];
  }

  const data = (await res.json()) as TwitchStreamsResponse;
  return data.data || [];
}

// Boucle principale de vérification
async function checkTwitchStreams(client: Client) {
  try {
    const follows = await prisma.twitchFollow.findMany({ take: 500 });

    if (follows.length === 0) return;

    const logins = [...new Set(follows.map((f) => f.streamerName.toLowerCase()))];
    const liveStreams = await getLiveStreams(logins);
    const liveLogins = new Set(liveStreams.map((s: TwitchStream) => s.user_login.toLowerCase()));

    for (const follow of follows) {
      const isNowLive = liveLogins.has(follow.streamerName.toLowerCase());
      const stream = liveStreams.find(
        (s: TwitchStream) => s.user_login.toLowerCase() === follow.streamerName.toLowerCase(),
      );
      if (!stream) continue;
      if (!stream) continue;

      if (isNowLive && !follow.isLive) {
        // Passage en live : notifier
        await prisma.twitchFollow.update({
          where: { id: follow.id },
          data: { isLive: true },
        });

        const channel = await client.channels.fetch(follow.channelId).catch(() => null);
        if (!channel?.isTextBased()) continue;

        const embed = new EmbedBuilder()
          .setColor(0x9146ff)
          .setTitle(`${stream.user_name} est en live sur Twitch !`)
          .setURL(`https://twitch.tv/${follow.streamerName}`)
          .setDescription(
            `**Jeu :** ${stream.game_name || "Inconnu"}\n` +
              `**Titre :** ${stream.title}\n` +
              `**Spectateurs :** ${stream.viewer_count.toLocaleString()}`,
          )
          .setImage(
            stream.thumbnail_url?.replace("{width}", "1280").replace("{height}", "720") ||
              "https://static-cdn.jtvnw.net/ttv-static/404_preview.jpg",
          )
          .setFooter({ text: "Surveillance System • Twitch" })
          .setTimestamp();

        await (channel as TextChannel).send({ embeds: [embed] }).catch(() => {});
        logger.info(
          `[TWITCH] ${follow.streamerName} est en live → notifié dans #${(channel as TextChannel).name}`,
        );
      } else if (!isNowLive && follow.isLive) {
        // Fin du live
        await prisma.twitchFollow.update({
          where: { id: follow.id },
          data: { isLive: false },
        });
      }
    }
  } catch (err) {
    logger.error("[TWITCH] Erreur boucle de vérification:", err);
  }
}

// Démarre la surveillance Twitch
export function startTwitchMonitoring(client: Client, intervalMs: number = 120_000) {
  if (twitchInterval) return;

  if (!config.twitchClientId || !config.twitchClientSecret) {
    logger.info("[TWITCH] Credentials manquants, surveillance desactivee.");
    return;
  }

  logger.info("[TWITCH] Surveillance démarrée (vérification toutes les 2 min)");
  checkTwitchStreams(client); // Premier check immédiat
  twitchInterval = safeInterval("Twitch", () => checkTwitchStreams(client), intervalMs);
}

// Arrête la surveillance
export function stopTwitchMonitoring() {
  if (twitchInterval) {
    clearInterval(twitchInterval);
    twitchInterval = null;
    logger.info("[TWITCH] Surveillance arrêtée");
  }
}
