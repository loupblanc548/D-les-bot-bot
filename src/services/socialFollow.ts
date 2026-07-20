import { Client, EmbedBuilder, TextChannel, DMChannel } from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";
import { config } from "../config.js";
import { safeInterval } from "../utils/safe-interval.js";

let monitoringInterval: ReturnType<typeof setInterval> | null = null;

type Platform =
  | "twitch"
  | "youtube"
  | "twitter"
  | "instagram"
  | "tiktok"
  | "facebook"
  | "reddit"
  | "bluesky"
  | "mastodon"
  | "kick"
  | "telegram"
  | "snapchat"
  | "linkedin"
  | "pinterest"
  | "dailymotion"
  | "vimeo";

// ─── Twitch ──────────────────────────────────────────────────────────────────

let twitchToken: string | null = null;
let twitchTokenExpiry = 0;

async function getTwitchToken(): Promise<string> {
  if (twitchToken && Date.now() < twitchTokenExpiry - 60_000) return twitchToken;
  const res = await fetch(config.twitchOAuthUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.twitchClientId,
      client_secret: config.twitchClientSecret,
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`Twitch OAuth: ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  twitchToken = data.access_token;
  twitchTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return twitchToken;
}

async function checkTwitch(follows: typeof followsType): Promise<void> {
  const twitchFollows = follows.filter((f) => f.platform === "twitch");
  if (twitchFollows.length === 0) return;

  const logins = [...new Set(twitchFollows.map((f) => f.channelName.toLowerCase()))];
  let token: string;
  try {
    token = await getTwitchToken();
  } catch {
    logger.warn("[SocialFollow] Twitch token failed, skipping");
    return;
  }

  const params = logins.map((l) => `user_login=${encodeURIComponent(l)}`).join("&");
  const res = await fetch(`https://api.twitch.tv/helix/streams?${params}`, {
    headers: { "Client-ID": config.twitchClientId, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    logger.warn(`[SocialFollow] Twitch streams API: ${res.status}`);
    return;
  }

  const data = (await res.json()) as { data: Array<Record<string, unknown>> };
  const liveStreams = new Map(
    (data.data || []).map((s) => [(s.user_login as string)?.toLowerCase(), s]),
  );

  for (const follow of twitchFollows) {
    const stream = liveStreams.get(follow.channelName.toLowerCase());
    const isLive = !!stream;

    if (isLive && !follow.isLive) {
      await prisma.socialFollow.update({ where: { id: follow.id }, data: { isLive: true } });
      await sendNotification(follow, {
        title: `${stream.user_name as string} est en live sur Twitch !`,
        url: `https://twitch.tv/${follow.channelName}`,
        description:
          `**Jeu :** ${stream.game_name || "Inconnu"}\n` +
          `**Titre :** ${stream.title}\n` +
          `**Spectateurs :** ${(stream.viewer_count as number)?.toLocaleString() || "?"}`,
        thumbnail: (stream.thumbnail_url as string)
          ?.replace("{width}", "1280")
          .replace("{height}", "720"),
        color: 0x9146ff,
        footerText: "Twitch",
      });
    } else if (!isLive && follow.isLive) {
      await prisma.socialFollow.update({ where: { id: follow.id }, data: { isLive: false } });
    }
  }
}

// ─── YouTube ─────────────────────────────────────────────────────────────────

async function checkYouTube(follows: typeof followsType): Promise<void> {
  const ytFollows = follows.filter((f) => f.platform === "youtube");
  if (ytFollows.length === 0) return;

  if (!config.youtubeApiKey) {
    logger.debug("[SocialFollow] YouTube API key not configured, skipping");
    return;
  }

  for (const follow of ytFollows) {
    try {
      // Search for latest video from channel
      const searchUrl =
        `https://www.googleapis.com/youtube/v3/search?` +
        `key=${config.youtubeApiKey}&channelId=${follow.channelId}&` +
        `part=snippet&order=date&maxResults=1&type=video`;
      const res = await fetch(searchUrl, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) continue;
      const data = (await res.json()) as { items: Array<Record<string, unknown>> };
      const latestVideo = data.items?.[0];
      if (!latestVideo) continue;

      const videoId = (latestVideo.id as { videoId?: string })?.videoId;
      if (!videoId) continue;

      if (follow.lastVideoId && follow.lastVideoId === videoId) continue;

      const snippet = latestVideo.snippet as Record<string, unknown>;
      await prisma.socialFollow.update({
        where: { id: follow.id },
        data: { lastVideoId: videoId },
      });

      // Only notify if we had a previous video (skip first check to avoid spam)
      if (follow.lastVideoId) {
        await sendNotification(follow, {
          title: `Nouvelle vidéo: ${snippet.title as string}`,
          url: `https://youtube.com/watch?v=${videoId}`,
          description: `**Chaîne :** ${snippet.channelTitle as string}\n${(snippet.description as string)?.slice(0, 200) || ""}`,
          thumbnail: (snippet.thumbnails as { medium?: { url?: string } })?.medium?.url,
          color: 0xff0000,
          footerText: "YouTube",
        });
      }
    } catch (err) {
      logger.debug(`[SocialFollow] YouTube check failed for ${follow.channelName}: ${err}`);
    }
  }
}

// ─── Twitter / X ─────────────────────────────────────────────────────────────

async function checkTwitter(follows: typeof followsType): Promise<void> {
  const twFollows = follows.filter((f) => f.platform === "twitter");
  if (twFollows.length === 0) return;

  // Use Nitter RSS as fallback (no API key needed)
  const nitterInstances = ["https://nitter.privacydev.net", "https://nitter.poast.org"];

  for (const follow of twFollows) {
    let success = false;
    for (const instance of nitterInstances) {
      try {
        const res = await fetch(`${instance}/${follow.channelName}/rss`, {
          signal: AbortSignal.timeout(8_000),
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        if (!res.ok) continue;
        const xml = await res.text();
        const tweetIds = [...xml.matchAll(/<guid>https:\/\/[^/]+\/[^/]+\/status\/(\d+)/g)]
          .map((m) => m[1])
          .filter(Boolean);
        if (tweetIds.length === 0) continue;

        const latestTweetId = tweetIds[0];
        if (follow.lastTweetId && follow.lastTweetId === latestTweetId) {
          success = true;
          break;
        }

        await prisma.socialFollow.update({
          where: { id: follow.id },
          data: { lastTweetId: latestTweetId },
        });

        // Only notify if we had a previous tweet
        if (follow.lastTweetId) {
          const titleMatch = xml.match(/<title>([^<]+)<\/title>/);
          const tweetTitle = titleMatch?.[1] || follow.channelName;
          await sendNotification(follow, {
            title: `Nouveau tweet de @${follow.channelName}`,
            url: `https://x.com/${follow.channelName}/status/${latestTweetId}`,
            description: tweetTitle.slice(0, 300),
            thumbnail: null,
            color: 0x1da1f2,
            footerText: "Twitter / X",
          });
        }
        success = true;
        break;
      } catch {
        // Try next instance
      }
    }
    if (!success) {
      logger.debug(`[SocialFollow] Twitter check failed for @${follow.channelName}`);
    }
  }
}

// ─── RSS-based platforms (Instagram, TikTok, Reddit, Kick, etc.) ─────────────

const PLATFORM_CONFIG: Record<
  string,
  {
    color: number;
    emoji: string;
    rssBuilder: (name: string) => string | null;
    idExtractor: (xml: string) => string | null;
    titleExtractor: (xml: string) => string;
    urlBuilder: (name: string, id: string) => string;
  }
> = {
  instagram: {
    color: 0xe1306c,
    emoji: "📸",
    rssBuilder: (name) => `https://rsshub.app/instagram/user/${name}`,
    idExtractor: (xml) => {
      const m = xml.match(/\/p\/([A-Za-z0-9_-]+)/);
      return m?.[1] ?? null;
    },
    titleExtractor: (xml) => {
      const m = xml.match(/<title>([^<]+)<\/title>/);
      return m?.[1] ?? "Nouveau post Instagram";
    },
    urlBuilder: (name, id) => `https://instagram.com/p/${id}`,
  },
  tiktok: {
    color: 0x000000,
    emoji: "🎵",
    rssBuilder: (name) => `https://rsshub.app/tiktok/user/${name}`,
    idExtractor: (xml) => {
      const m = xml.match(/\/video\/(\d+)/);
      return m?.[1] ?? null;
    },
    titleExtractor: (xml) => {
      const m = xml.match(/<title>([^<]+)<\/title>/);
      return m?.[1] ?? "Nouvelle vidéo TikTok";
    },
    urlBuilder: (name, id) => `https://tiktok.com/@${name}/video/${id}`,
  },
  reddit: {
    color: 0xff4500,
    emoji: "🤖",
    rssBuilder: (name) => `https://www.reddit.com/user/${name}/.rss`,
    idExtractor: (xml) => {
      const m = xml.match(/<id>t3_([a-z0-9]+)<\/id>/i);
      return m?.[1] ?? null;
    },
    titleExtractor: (xml) => {
      const m = xml.match(/<title>([^<]+)<\/title>/);
      return m?.[1] ?? "Nouveau post Reddit";
    },
    urlBuilder: (name, id) => `https://reddit.com/comments/${id}`,
  },
  kick: {
    color: 0x53fc18,
    emoji: "🟢",
    rssBuilder: (name) => `https://rsshub.app/kick/user/${name}`,
    idExtractor: (xml) => {
      const m = xml.match(/<guid>[^<]*\/([^<]+)<\/guid>/);
      return m?.[1] ?? null;
    },
    titleExtractor: (xml) => {
      const m = xml.match(/<title>([^<]+)<\/title>/);
      return m?.[1] ?? "Nouveau live Kick";
    },
    urlBuilder: (name, _id) => `https://kick.com/${name}`,
  },
  bluesky: {
    color: 0x0085ff,
    emoji: "☁️",
    rssBuilder: (name) => `https://rsshub.app/bluesky/user/${name}`,
    idExtractor: (xml) => {
      const m = xml.match(/post\/([a-z0-9]+)/i);
      return m?.[1] ?? null;
    },
    titleExtractor: (xml) => {
      const m = xml.match(/<title>([^<]+)<\/title>/);
      return m?.[1] ?? "Nouveau post Bluesky";
    },
    urlBuilder: (name, id) => `https://bsky.app/profile/${name}/post/${id}`,
  },
  mastodon: {
    color: 0x6364ff,
    emoji: "🐘",
    rssBuilder: (name) => {
      // name format: user@instance
      const [user, instance] = name.split("@");
      if (!instance) return null;
      return `https://${instance}/@${user}.rss`;
    },
    idExtractor: (xml) => {
      const m = xml.match(/<guid>[^<]*\/([^\/<]+)<\/guid>/);
      return m?.[1] ?? null;
    },
    titleExtractor: (xml) => {
      const m = xml.match(/<title>([^<]+)<\/title>/);
      return m?.[1] ?? "Nouveau pouet Mastodon";
    },
    urlBuilder: (name, id) => {
      const [user, instance] = name.split("@");
      return `https://${instance}/@${user}/${id}`;
    },
  },
  dailymotion: {
    color: 0x0066dc,
    emoji: "🎥",
    rssBuilder: (name) => `https://www.dailymotion.com/rss/user/${name}/1`,
    idExtractor: (xml) => {
      const m = xml.match(/\/video\/([a-z0-9]+)/i);
      return m?.[1] ?? null;
    },
    titleExtractor: (xml) => {
      const m = xml.match(/<title>([^<]+)<\/title>/);
      return m?.[1] ?? "Nouvelle vidéo Dailymotion";
    },
    urlBuilder: (_name, id) => `https://dailymotion.com/video/${id}`,
  },
  vimeo: {
    color: 0x1ab7ea,
    emoji: "🎬",
    rssBuilder: (name) => `https://vimeo.com/${name}/videos/rss`,
    idExtractor: (xml) => {
      const m = xml.match(/\/(\d+)$/m);
      return m?.[1] ?? null;
    },
    titleExtractor: (xml) => {
      const m = xml.match(/<title>([^<]+)<\/title>/);
      return m?.[1] ?? "Nouvelle vidéo Vimeo";
    },
    urlBuilder: (_name, id) => `https://vimeo.com/${id}`,
  },
  facebook: {
    color: 0x1877f2,
    emoji: "👍",
    rssBuilder: (name) => `https://rsshub.app/facebook/page/${name}`,
    idExtractor: (xml) => {
      const m = xml.match(/\/posts\/(\d+)/);
      return m?.[1] ?? null;
    },
    titleExtractor: (xml) => {
      const m = xml.match(/<title>([^<]+)<\/title>/);
      return m?.[1] ?? "Nouveau post Facebook";
    },
    urlBuilder: (name, id) => `https://facebook.com/${name}/posts/${id}`,
  },
  telegram: {
    color: 0x0088cc,
    emoji: "✈️",
    rssBuilder: (name) => `https://rsshub.app/telegram/channel/${name}`,
    idExtractor: (xml) => {
      const m = xml.match(/\/(\d+)$/m);
      return m?.[1] ?? null;
    },
    titleExtractor: (xml) => {
      const m = xml.match(/<title>([^<]+)<\/title>/);
      return m?.[1] ?? "Nouveau message Telegram";
    },
    urlBuilder: (name, id) => `https://t.me/${name}/${id}`,
  },
  snapchat: {
    color: 0xfffc00,
    emoji: "👻",
    rssBuilder: (name) => `https://rsshub.app/snapchat/user/${name}`,
    idExtractor: (xml) => {
      const m = xml.match(/<guid>[^<]*\/([^<]+)<\/guid>/);
      return m?.[1] ?? null;
    },
    titleExtractor: (xml) => {
      const m = xml.match(/<title>([^<]+)<\/title>/);
      return m?.[1] ?? "Nouveau snap Snapchat";
    },
    urlBuilder: (name, _id) => `https://snapchat.com/add/${name}`,
  },
  linkedin: {
    color: 0x0a66c2,
    emoji: "💼",
    rssBuilder: (name) => `https://rsshub.app/linkin/company/${name}`,
    idExtractor: (xml) => {
      const m = xml.match(/<guid>[^<]*\/([^<]+)<\/guid>/);
      return m?.[1] ?? null;
    },
    titleExtractor: (xml) => {
      const m = xml.match(/<title>([^<]+)<\/title>/);
      return m?.[1] ?? "Nouveau post LinkedIn";
    },
    urlBuilder: (name, _id) => `https://linkedin.com/company/${name}`,
  },
  pinterest: {
    color: 0xe60023,
    emoji: "📌",
    rssBuilder: (name) => `https://rsshub.app/pinterest/user/${name}`,
    idExtractor: (xml) => {
      const m = xml.match(/\/pin\/(\d+)/);
      return m?.[1] ?? null;
    },
    titleExtractor: (xml) => {
      const m = xml.match(/<title>([^<]+)<\/title>/);
      return m?.[1] ?? "Nouveau pin Pinterest";
    },
    urlBuilder: (_name, id) => `https://pinterest.com/pin/${id}`,
  },
};

async function checkRSSPlatforms(follows: typeof followsType): Promise<void> {
  const rssPlatforms = Object.keys(PLATFORM_CONFIG);
  const rssFollows = follows.filter((f) => rssPlatforms.includes(f.platform));
  if (rssFollows.length === 0) return;

  for (const follow of rssFollows) {
    const cfg = PLATFORM_CONFIG[follow.platform];
    if (!cfg) continue;

    const rssUrl = cfg.rssBuilder(follow.channelName);
    if (!rssUrl) continue;

    try {
      const res = await fetch(rssUrl, {
        signal: AbortSignal.timeout(10_000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; DiscordBot/1.0)" },
      });
      if (!res.ok) continue;
      const xml = await res.text();

      const latestId = cfg.idExtractor(xml);
      if (!latestId) continue;

      const lastSeenKey = follow.lastVideoId || follow.lastTweetId;
      if (lastSeenKey && lastSeenKey === latestId) continue;

      // Update last seen ID
      const updateData: Record<string, string> = {};
      if (follow.platform === "twitter") {
        updateData.lastTweetId = latestId;
      } else {
        updateData.lastVideoId = latestId;
      }
      await prisma.socialFollow.update({
        where: { id: follow.id },
        data: updateData,
      });

      // Only notify if we had a previous entry
      if (lastSeenKey) {
        const title = cfg.titleExtractor(xml);
        await sendNotification(follow, {
          title: `${cfg.emoji} ${title}`,
          url: cfg.urlBuilder(follow.channelName, latestId),
          description: `**${follow.channelName}** sur ${follow.platform}\n${title.slice(0, 200)}`,
          thumbnail: null,
          color: cfg.color,
          footerText: follow.platform,
        });
      }
    } catch (err) {
      logger.debug(
        `[SocialFollow] ${follow.platform} check failed for ${follow.channelName}: ${err}`,
      );
    }
  }
}

// ─── Notification dispatch ───────────────────────────────────────────────────

interface NotificationPayload {
  title: string;
  url: string;
  description: string;
  thumbnail: string | null | undefined;
  color: number;
  footerText: string;
}

async function sendNotification(
  follow: {
    notifyMode: string;
    notifyChannel: string | null;
    notifyUserId: string | null;
    channelName: string;
    platform: string;
  },
  payload: NotificationPayload,
): Promise<void> {
  const embed = new EmbedBuilder()
    .setColor(payload.color)
    .setTitle(payload.title)
    .setURL(payload.url)
    .setDescription(payload.description)
    .setFooter({ text: `Social Follow • ${payload.footerText}` })
    .setTimestamp();

  if (payload.thumbnail) {
    embed.setImage(payload.thumbnail);
  }

  try {
    if (follow.notifyMode === "dm" && follow.notifyUserId) {
      // Send DM — need client ref
      const { getClient } = await import("./clientRef.js");
      const client = getClient();
      if (!client) return;
      const user = await client.users.fetch(follow.notifyUserId).catch(() => null);
      if (!user) return;
      await user.send({ embeds: [embed] }).catch(() => {});
      logger.info(
        `[SocialFollow] DM sent to ${follow.notifyUserId} for ${follow.platform}/${follow.channelName}`,
      );
    } else if (follow.notifyChannel) {
      const { getClient } = await import("./clientRef.js");
      const client = getClient();
      if (!client) return;
      const channel = await client.channels.fetch(follow.notifyChannel).catch(() => null);
      if (!channel?.isTextBased()) return;
      await (channel as TextChannel).send({ embeds: [embed] }).catch(() => {});
      logger.info(
        `[SocialFollow] Notification in #${(channel as TextChannel).name} for ${follow.platform}/${follow.channelName}`,
      );
    }
  } catch (err) {
    logger.warn(`[SocialFollow] Notification failed: ${err}`);
  }
}

// ─── Main monitoring loop ────────────────────────────────────────────────────

// Type helper for Prisma results
type FollowType = Awaited<ReturnType<typeof prisma.socialFollow.findMany>>;
const followsType: FollowType = [];

async function checkAllPlatforms(client: Client): Promise<void> {
  try {
    const follows = await prisma.socialFollow.findMany({ take: 500 });
    if (follows.length === 0) return;

    await Promise.allSettled([
      checkTwitch(follows),
      checkYouTube(follows),
      checkTwitter(follows),
      checkRSSPlatforms(follows),
    ]);
  } catch (err) {
    logger.error("[SocialFollow] Monitoring error:", err);
  }
}

export function startSocialFollowMonitoring(client: Client, intervalMs: number = 120_000): void {
  if (monitoringInterval) return;
  logger.info("[SocialFollow] Monitoring started (checking every 2 min)");
  checkAllPlatforms(client);
  monitoringInterval = safeInterval("SocialFollow", () => checkAllPlatforms(client), intervalMs);
}

export function stopSocialFollowMonitoring(): void {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
    logger.info("[SocialFollow] Monitoring stopped");
  }
}

// ─── Public API for agent tool & commands ────────────────────────────────────

export async function addSocialFollow(params: {
  guildId: string;
  platform: Platform;
  channelName: string;
  notifyMode: "channel" | "dm";
  notifyChannel?: string | null;
  notifyUserId?: string | null;
  addedBy: string;
}): Promise<{ success: boolean; message: string }> {
  const existing = await prisma.socialFollow.findFirst({
    where: {
      guildId: params.guildId,
      platform: params.platform,
      channelName: { equals: params.channelName, mode: "insensitive" },
    },
  });

  if (existing) {
    return {
      success: false,
      message: `${params.channelName} est déjà suivi sur ${params.platform}`,
    };
  }

  // Resolve platform ID
  let channelId = params.channelName.toLowerCase();
  if (params.platform === "twitch") {
    try {
      const { getStreamerByLogin } = await import("./twitch.js");
      const streamer = await getStreamerByLogin(params.channelName);
      if (streamer) channelId = streamer.id;
    } catch {
      // Fallback to name as ID
    }
  } else if (params.platform === "youtube") {
    // Try to resolve channel ID via search API
    if (config.youtubeApiKey) {
      try {
        const searchUrl =
          `https://www.googleapis.com/youtube/v3/search?` +
          `key=${config.youtubeApiKey}&q=${encodeURIComponent(params.channelName)}&` +
          `part=snippet&type=channel&maxResults=1`;
        const res = await fetch(searchUrl, { signal: AbortSignal.timeout(10_000) });
        if (res.ok) {
          const data = (await res.json()) as { items: Array<{ id: { channelId: string } }> };
          if (data.items?.[0]) channelId = data.items[0].id.channelId;
        }
      } catch {
        // Fallback to name
      }
    }
  }

  await prisma.socialFollow.create({
    data: {
      guildId: params.guildId,
      platform: params.platform,
      channelName: params.channelName.toLowerCase(),
      channelId,
      notifyMode: params.notifyMode,
      notifyChannel: params.notifyChannel ?? null,
      notifyUserId: params.notifyUserId ?? null,
      addedBy: params.addedBy,
    },
  });

  const dest = params.notifyMode === "dm" ? "en MP" : `dans <#${params.notifyChannel}>`;
  return {
    success: true,
    message: `✅ ${params.channelName} sur ${params.platform} est maintenant suivi. Notifications ${dest}.`,
  };
}

export async function removeSocialFollow(
  guildId: string,
  platform: Platform,
  channelName: string,
): Promise<{ success: boolean; message: string }> {
  const result = await prisma.socialFollow.deleteMany({
    where: {
      guildId,
      platform,
      channelName: { equals: channelName, mode: "insensitive" },
    },
  });

  if (result.count === 0) {
    return { success: false, message: `${channelName} n'est pas suivi sur ${platform}` };
  }
  return { success: true, message: `✅ ${channelName} retiré du suivi ${platform}` };
}

export async function listSocialFollows(guildId: string): Promise<
  Array<{
    platform: string;
    channelName: string;
    notifyMode: string;
    notifyChannel: string | null;
    isLive: boolean;
  }>
> {
  return prisma.socialFollow.findMany({
    where: { guildId },
    orderBy: { addedAt: "desc" },
    select: {
      platform: true,
      channelName: true,
      notifyMode: true,
      notifyChannel: true,
      isLive: true,
    },
  });
}
