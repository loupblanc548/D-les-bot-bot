import logger from "../utils/logger.js";
import { safeInterval } from "../utils/safe-interval.js";
import prisma from "../prisma.js";
import { Platform } from "@prisma/client";
import { cleanUrl } from "../utils/url-cleaner.js";
import { Client, TextChannel, EmbedBuilder, ChannelType } from "discord.js";
import {
  runGamingFeeds,
  sendToChannel,
  sendToChannelWithAttachment,
  logError,
  PLATFORM_COLORS,
  PLATFORM_ICONS,
  PLATFORM_LABELS,
} from "./feeds.js";
import {
  getYouTubeThumbnail,
  getOgImage,
  getTweetImage,
  extractMediaThumbnail,
} from "../utils/image-helpers.js";
import { fetchFreeGames } from "./epicgames.js";
import { embedEpicGames } from "../utils/gaming-embeds.js";
import {
  generateCardAttachment,
  getPlatformColor,
  getPlatformLabel,
} from "../utils/notificationCards.js";
import { alertApiFailure, alertCronFailure, alertCritical } from "../services/proactiveAlerts.js";
import { config } from "../config.js";
import {
  RSS_HEADERS,
  PLATFORM_NAMES,
  xmlParser,
  textOf,
  extractLink,
} from "../utils/rss-parser.js";
import { ensureConnected } from "../utils/redisClient.js";
import { isMonitoringEnabled } from "../modules/guild/guildConfig.js";

const CHECK_INTERVAL_MS = config.monitoringIntervalMs;
let intervalId: NodeJS.Timeout | null = null;
let isChecking = false;

type YouTubeRSSContent = { title: string; url: string; thumbnail?: string };
type TextRSSContent = { text: string; url: string };
type BlueskyRSSContent = { title: string; url: string };

let whitelistWarningShown = false;

// ============================================================
// CACHE INTELLIGENT REDIS
// ============================================================

interface CacheStats {
  hits: number;
  misses: number;
}

const cacheStats: CacheStats = { hits: 0, misses: 0 };

async function getCachedData<T>(key: string): Promise<T | null> {
  try {
    const redis = await ensureConnected();
    if (!redis) return null;
    const data = await redis.get(key);
    if (data) {
      cacheStats.hits++;
      return JSON.parse(data) as T;
    }
    cacheStats.misses++;
    return null;
  } catch (error) {
    logger.error("[Cache] Error getting data:", error);
    cacheStats.misses++;
    return null;
  }
}

async function setCachedData<T>(key: string, data: T, ttl: number = 300): Promise<void> {
  try {
    const redis = await ensureConnected();
    if (!redis) return;
    await redis.set(key, JSON.stringify(data), { EX: ttl });
  } catch (error) {
    logger.error("[Cache] Error setting data:", error);
  }
}

function getCacheStats(): string {
  const total = cacheStats.hits + cacheStats.misses;
  const hitRate = total > 0 ? ((cacheStats.hits / total) * 100).toFixed(1) : "0.0";
  return `Hits: ${cacheStats.hits} | Misses: ${cacheStats.misses} | Hit Rate: ${hitRate}%`;
}

// ============================================================
// FONCTIONS RSS (sources DB)
// ============================================================

async function checkYouTubeChannel(handle: string): Promise<{
  status: "new" | "none" | "error";
  content?: YouTubeRSSContent;
}> {
  const cacheKey = `youtube:${handle}`;
  const cached = await getCachedData<{ status: string; content?: YouTubeRSSContent }>(cacheKey);
  if (cached) {
    return cached as any;
  }

  const urls = [
    `https://www.youtube.com/feeds/videos.xml?user=${handle}`,
    `https://www.youtube.com/feeds/videos.xml?channel_id=${handle}`,
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const text = await response.text();
      const parsed = xmlParser.parse(text);
      const entries = parsed.feed?.entry;
      if (!entries) return { status: "none" };
      const firstEntry = Array.isArray(entries) ? entries[0] : entries;
      const title = textOf(firstEntry.title).trim();
      const link = extractLink(firstEntry.link);
      const thumbnail = extractMediaThumbnail(firstEntry);
      if (title && link) {
        const result = { status: "new" as const, content: { title, url: link, thumbnail } };
        await setCachedData(cacheKey, result, 300); // 5 minutes TTL
        return result;
      }
      return { status: "none" };
    } catch {
      // Ignore cache errors
    }
  }
  return { status: "error" };
}

const NITTER_INSTANCES = [
  "https://xcancel.com",
  "https://nitter.poast.org",
  "https://nitter.privacydev.net",
  "https://nitter.woodland.cafe",
  "https://bird.trom.tf",
  "https://nitter.cz",
  "https://nitter.1d4.us",
];

async function checkTwitterUser(handle: string): Promise<{
  status: "new" | "none" | "error";
  content?: TextRSSContent;
}> {
  for (const instance of NITTER_INSTANCES) {
    const url = `${instance}/${handle}/rss`;
    try {
      const response = await fetch(url, { headers: RSS_HEADERS });
      if (!response.ok) continue;
      const text = await response.text();

      if (text.includes("RSS reader not yet whitelisted")) continue;

      const parsed = xmlParser.parse(text);
      const items = parsed.rss?.channel?.item;
      if (!items) continue;
      const firstItem = Array.isArray(items) ? items[0] : items;
      const content = textOf(firstItem.title).trim();
      const link = extractLink(firstItem.link).trim();
      if (content && link) {
        return { status: "new", content: { text: content, url: link } };
      }
    } catch {
      continue;
    }
  }

  if (!whitelistWarningShown) {
    whitelistWarningShown = true;
    logger.warn(
      `[Monitor] ⚠️ Toutes les instances Nitter ont échoué pour @${handle}. ` +
        `Les services RSS Twitter gratuits sont instables.`,
    );
  }
  return { status: "error" };
}

async function checkBlueskyUser(handle: string): Promise<{
  status: "new" | "none" | "error";
  content?: BlueskyRSSContent;
}> {
  const url = `https://bsky.app/profile/${handle}/rss`;

  try {
    const response = await fetch(url);
    if (!response.ok) return { status: "error" };
    const text = await response.text();
    const parsed = xmlParser.parse(text);
    const items = parsed.rss?.channel?.item;
    if (!items) return { status: "none" };
    const firstItem = Array.isArray(items) ? items[0] : items;
    const title = textOf(firstItem.title).trim();
    const link = extractLink(firstItem.link).trim();
    if (title && link) {
      return { status: "new", content: { title, url: link } };
    }
    return { status: "none" };
  } catch {
    return { status: "error" };
  }
}

// === Fonctions multi-items pour la retrospective de demarrage ===

async function checkYouTubeChannelMulti(
  handle: string,
  limit: number = 3,
): Promise<YouTubeRSSContent[]> {
  const urls = [
    `https://www.youtube.com/feeds/videos.xml?user=${handle}`,
    `https://www.youtube.com/feeds/videos.xml?channel_id=${handle}`,
  ];
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const text = await response.text();
      const parsed = xmlParser.parse(text);

      const entries = parsed.feed?.entry;
      if (!entries) return [];
      const list = Array.isArray(entries) ? entries : [entries];
      const results: YouTubeRSSContent[] = [];
      for (const entry of list) {
        const title = textOf(entry.title).trim();
        const link = extractLink(entry.link);
        const thumbnail = extractMediaThumbnail(entry);
        if (title && link) results.push({ title, url: link, thumbnail });
      }
      return results.slice(0, limit);
    } catch (error) {
      logger.error(`[Monitor] Erreur lors du check YouTube multi pour @${handle}:`, error);
    }
  }
  return [];
}

async function checkTwitterUserMulti(handle: string, limit: number = 3): Promise<TextRSSContent[]> {
  for (const instance of NITTER_INSTANCES) {
    const url = `${instance}/${handle}/rss`;
    try {
      const response = await fetch(url, { headers: RSS_HEADERS });
      if (!response.ok) continue;
      const text = await response.text();
      if (text.includes("RSS reader not yet whitelisted")) continue;
      const parsed = xmlParser.parse(text);
      const items = parsed.rss?.channel?.item;
      if (!items) continue;
      const list = Array.isArray(items) ? items : [items];
      const results: TextRSSContent[] = [];
      for (const item of list) {
        const content = textOf(item.title).trim();
        const link = extractLink(item.link).trim();
        if (content && link) results.push({ text: content, url: link });
      }
      return results.slice(0, limit);
    } catch {
      continue;
    }
  }
  return [];
}

async function checkBlueskyUserMulti(
  handle: string,
  limit: number = 3,
): Promise<BlueskyRSSContent[]> {
  const url = `https://bsky.app/profile/${handle}/rss`;
  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    const text = await response.text();
    const parsed = xmlParser.parse(text);
    const items = parsed.rss?.channel?.item;
    if (!items) return [];
    const list = Array.isArray(items) ? items : [items];
    const results: BlueskyRSSContent[] = [];
    for (const item of list) {
      const title = textOf(item.title).trim();
      const link = extractLink(item.link).trim();
      if (title && link) results.push({ title, url: link });
    }
    return results.slice(0, limit);
  } catch (error) {
    logger.error(`[Monitor] Erreur lors du check:`, error);
    return [];
  }
}

async function checkTwitchChannelMulti(
  handle: string,
  limit: number = 3,
): Promise<YouTubeRSSContent[]> {
  const url = `https://www.twitch.tv/${handle}`;
  try {
    const response = await fetch(url, { headers: { "User-Agent": "JohnHelldiver/1.0" } });
    if (!response.ok) return [];
    const text = await response.text();
    const videoMatch = text.match(/"video_id":"(\w+)"/g);
    if (!videoMatch) return [];
    const results: YouTubeRSSContent[] = [];
    for (const match of videoMatch.slice(0, limit)) {
      const videoId = match.match(/"video_id":"(\w+)"/)?.[1];
      if (videoId) {
        results.push({
          title: `Stream de ${handle}`,
          url: `https://www.twitch.tv/videos/${videoId}`,
          thumbnail: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${handle}-440x248.jpg`,
        });
      }
    }
    return results;
  } catch (error) {
    logger.error("[Monitor] Erreur lors du check Twitch pour @${handle}:", error);
    return [];
  }
}

async function checkRedditSubredditMulti(
  subreddit: string,
  limit: number = 3,
): Promise<YouTubeRSSContent[]> {
  const url = `https://www.reddit.com/r/${subreddit}/hot/.rss`;
  try {
    const response = await fetch(url, { headers: { "User-Agent": "JohnHelldiver/1.0" } });
    if (!response.ok) return [];
    const text = await response.text();
    const parsed = xmlParser.parse(text);
    const items = parsed.rss?.channel?.item;
    if (!items) return [];
    const list = Array.isArray(items) ? items : [items];
    const results: YouTubeRSSContent[] = [];
    for (const item of list) {
      const title = textOf(item.title).trim();
      const link = extractLink(item.link).trim();
      if (title && link) results.push({ title, url: link });
    }
    return results.slice(0, limit);
  } catch (error) {
    logger.error("[Monitor] Erreur lors du check Reddit pour r/${subreddit}:", error);
    return [];
  }
}

async function checkInstagramUserMulti(
  handle: string,
  limit: number = 3,
): Promise<YouTubeRSSContent[]> {
  const url = `https://www.instagram.com/${handle}/`;
  try {
    const response = await fetch(url, { headers: { "User-Agent": "JohnHelldiver/1.0" } });
    if (!response.ok) return [];
    const text = await response.text();
    const imageMatch = text.match(/https:\/\/instagram\.f[\w-]+\.fbcdn\.net\/[^"]+\.(jpg|png)/g);
    if (!imageMatch) return [];
    const results: YouTubeRSSContent[] = [];
    for (const match of imageMatch.slice(0, limit)) {
      results.push({
        title: `Post de @${handle}`,
        url: `https://www.instagram.com/${handle}/`,
        thumbnail: match,
      });
    }
    return results;
  } catch (error) {
    logger.error("[Monitor] Erreur lors du check Instagram pour @${handle}:", error);
    return [];
  }
}

// ============================================================
// EPIC GAMES - Jeux gratuits
// ============================================================

async function checkEpicGames(client: Client) {
  try {
    const games = await fetchFreeGames(client);
    for (const game of games) {
      const embed = embedEpicGames({
        name: game.title,
        originalPrice: game.originalPrice || "Gratuit",
        endDate: game.freeEndDate
          ? new Date(game.freeEndDate).toLocaleDateString("fr-FR")
          : "Limitée",
        description: game.description || undefined,
        imageUrl: game.imageUrl || undefined,
      });
      embed.setURL(game.url);

      const steamEpicChannel = config.steamEpicChannel;
      if (steamEpicChannel) {
        // Générer la carte visuelle
        const cardAttachment = await generateCardAttachment(
          {
            type: "freegame",
            title: game.title,
            subtitle: "Epic Games Store",
            imageUrl: game.imageUrl || undefined,
            originalPrice: game.originalPrice || "Gratuit",
            endDate: game.freeEndDate
              ? new Date(game.freeEndDate).toLocaleDateString("fr-FR")
              : "Limitée",
            platformName: "EPIC GAMES",
            platformColor: getPlatformColor("epic"),
            url: game.url,
          },
          `epic-free-${game.title.slice(0, 20).replace(/[^a-zA-Z0-9]/g, "-")}`,
        );

        if (cardAttachment) {
          embed.setImage(`attachment://${cardAttachment.name}`);
          await sendToChannelWithAttachment(client, steamEpicChannel, embed, cardAttachment);
        } else {
          await sendToChannel(client, steamEpicChannel, embed);
        }
        logger.info(`[EpicGames] Notification: ${game.title}`);
      }
    }
  } catch (err) {
    const errMsg = String(err);
    logger.error("[EpicGames] Erreur:", errMsg);
    void alertApiFailure("Epic Games", errMsg);
    await logError(client, "EpicGames", errMsg);
  }
}

// ============================================================
// BOUCLE PRINCIPALE
// ============================================================

async function checkAndNotify(client: Client) {
  if (isChecking) return;
  isChecking = true;

  try {
    logger.info("[Monitor] Vérification des sources...");

    // 1. Sources de la DB (utilisateur)
    const sources = await prisma.source.findMany();

    // Batch: fetch all guild configs in one query to avoid N+1
    const guildIds = [...new Set(sources.map((s) => s.guildId))];
    const guildConfigs = await prisma.guildConfig.findMany({
      where: { guildId: { in: guildIds } },
      select: { guildId: true, monitoringEnabled: true },
    });
    const monitoringMap = new Map(
      guildConfigs.map((g) => [g.guildId, g.monitoringEnabled ?? true]),
    );

    for (const source of sources) {
      try {
        // Check if monitoring is enabled for this guild (from batch cache)
        if (!monitoringMap.get(source.guildId)) {
          continue;
        }

        let result = null;
        if (source.type === "YOUTUBE") {
          result = await checkYouTubeChannel(source.urlOrHandle);
        } else if (source.type === "TWITTER") {
          result = await checkTwitterUser(source.urlOrHandle);
        } else if (source.type === "BLUESKY") {
          result = await checkBlueskyUser(source.urlOrHandle);
        }

        if (result?.status === "new" && result.content) {
          // Auto-création de source et insertion de notification sécurisée
          const notifUrl = result.content.url || "";
          const contentText =
            "title" in result.content ? result.content.title : result.content.text;

          const resultAuto = await ensureSourceAndInsertNotification(
            source.urlOrHandle,
            source.type,
            source.channelId,
            source.guildId,
            contentText,
            notifUrl,
            source.type.toLowerCase() as Platform,
          );

          if (!resultAuto.success) {
            if (resultAuto.error) {
              logger.error(
                `[Monitor] Notification echouee pour @${source.urlOrHandle} : ${resultAuto.error}`,
              );
            }
            continue;
          }

          const channel = client.channels.cache.get(source.channelId) as TextChannel | undefined;
          if (channel && channel.type === ChannelType.GuildText) {
            // Titre enrichi par plateforme
            const icon = PLATFORM_ICONS[source.type.toLowerCase()] || "📢";
            const label = PLATFORM_LABELS[source.type.toLowerCase()] || "";
            const contentText =
              "title" in result.content ? result.content.title : result.content.text;
            const embedTitle = label
              ? icon + " " + contentText + " — " + label
              : icon + " " + contentText;

            const embed = new EmbedBuilder()
              .setTitle(embedTitle)
              .setDescription(
                "title" in result.content ? result.content.title : result.content.text,
              )
              .setColor(PLATFORM_COLORS[source.type.toLowerCase()] || 0x5865f2)
              .addFields({
                name: "Plateforme",
                value: PLATFORM_NAMES[source.type.toLowerCase()] || source.type,
                inline: true,
              })
              .setTimestamp();
            if (result.content.url) embed.setURL(result.content.url);

            try {
              if (source.type === "YOUTUBE" && result.content.url) {
                const ytContent = result.content as YouTubeRSSContent;
                const thumb = ytContent.thumbnail || (await getYouTubeThumbnail(ytContent.url));
                if (thumb) embed.setImage(thumb);
              } else if (source.type === "TWITTER" && result.content.url) {
                const og = await getTweetImage(result.content.url);
                if (og) embed.setImage(og);
              } else if (source.type === "TWITCH" && result.content.url) {
                const twContent = result.content as YouTubeRSSContent;
                if (twContent.thumbnail) embed.setImage(twContent.thumbnail);
              } else if (source.type === "BLUESKY" && result.content.url) {
                const og = await getOgImage(result.content.url);
                if (og) embed.setImage(og);
              } else if (source.type === "REDDIT" && result.content.url) {
                // Reddit : extraire og:image depuis la page du post
                const og = await getOgImage(result.content.url);
                if (og) embed.setImage(og);
              }
            } catch {
              // Ignore image fetch errors
            }
            // Générer la carte visuelle
            const cardType = source.type === "YOUTUBE" ? "youtube" : "blog";
            const cardAttachment = await generateCardAttachment(
              {
                type: cardType,
                title: contentText,
                subtitle: `@${source.urlOrHandle}`,
                imageUrl:
                  source.type === "YOUTUBE"
                    ? (result.content as YouTubeRSSContent).thumbnail
                    : undefined,
                platformName: getPlatformLabel(source.type.toLowerCase()),
                platformColor: getPlatformColor(source.type.toLowerCase()),
                url: result.content.url,
              },
              `notif-${source.type.toLowerCase()}-${Date.now()}`,
            );

            if (cardAttachment) {
              embed.setImage(`attachment://${cardAttachment.name}`);
              try {
                await channel.send({ embeds: [embed], files: [cardAttachment] });
              } catch (sendErr) {
                // Retry sans la carte si Discord rejette l'embed
                embed.setImage(null);
                try { embed.setThumbnail(null); } catch {}
                await channel.send({ embeds: [embed] });
                logger.warn(`[Monitor] Carte rejetée, envoi sans carte pour @${source.urlOrHandle}`);
              }
            } else {
              try {
                await channel.send({ embeds: [embed] });
              } catch (sendErr) {
                // Retry sans image si Discord rejette l'embed
                const sendMsg = sendErr instanceof Error ? sendErr.message : String(sendErr);
                if (sendMsg.includes("Received one or more errors") || sendMsg.includes("embed")) {
                  embed.setImage(null);
                  try { embed.setThumbnail(null); } catch {}
                  await channel.send({ embeds: [embed] });
                  logger.warn(`[Monitor] Embed sans image pour @${source.urlOrHandle}`);
                } else {
                  throw sendErr;
                }
              }
            }
            logger.info(`[Monitor] Notification envoyée pour @${source.urlOrHandle}`);
          }
        }
      } catch (err) {
        const errMsg = String(err instanceof Error ? err.message : String(err));
        const isTransient = errMsg.includes("fetch") ||
          errMsg.includes("timeout") ||
          errMsg.includes("socket") ||
          errMsg.includes("ECONNREFUSED") ||
          errMsg.includes("ETIMEDOUT") ||
          errMsg.includes("ENOTFOUND") ||
          errMsg.includes("aborted");
        if (isTransient) {
          logger.warn(`[Monitor] Transitoire source ${source.urlOrHandle}: ${errMsg}`);
        } else {
          logger.error(`[Monitor] Erreur source ${source.urlOrHandle}:`, errMsg);
          await logError(client, `Monitor/DB/${source.urlOrHandle}`, errMsg);
        }
      }
    }

    // 2. Comptes gaming pré-configurés (feeds.ts)
    try {
      await runGamingFeeds(client);
    } catch (err) {
      const errMsg = String(err);
      logger.error("[Monitor] Erreur gaming feeds:", errMsg);
      await logError(client, "Monitor/GamingFeeds", errMsg);
    }

    // 3. Epic Games gratuits
    try {
      await checkEpicGames(client);
    } catch (err) {
      const errMsg = String(err);
      logger.error("[Monitor] Erreur Epic Games:", errMsg);
      await logError(client, "Monitor/EpicGames", errMsg);
    }

    logger.info(`[Monitor] Vérification terminée (${sources.length} sources DB)`);
  } catch (err) {
    const errMsg = String(err);
    logger.error("[Monitor] Erreur globale:", errMsg);
    void alertCritical("Erreur monitor globale", errMsg.slice(0, 500));
    try {
      await logError(client, "Monitor/Global", errMsg);
    } catch {
      // Ignore log errors
    }
  } finally {
    isChecking = false;
  }
}

// ============================================================
// AUTO-CRÉATION DE SOURCES ET INSERTION DE NOTIFICATIONS
// ============================================================

interface AutoSourceResult {
  success: boolean;
  sourceCreated: boolean;
  notificationInserted: boolean;
  // Message d'erreur si !success. Omis pour P2002 (skip intentionnel).
  error?: string;
  // Notification deja existante (contrainte d'unicite) — skip silencieux
  // sans spam de salons Discord, sans increment de error counter.
  skipped?: boolean;
}

async function ensureSourceAndInsertNotification(
  urlOrHandle: string,
  type: string,
  channelId: string,
  guildId: string,
  content: string,
  url: string,
  platform: Platform,
): Promise<AutoSourceResult> {
  try {
    // Étape 1 : Auto-création de la source si elle n'existe pas
    const source = await prisma.source.upsert({
      where: {
        urlOrHandle_type_channelId: {
          urlOrHandle,
          type,
          channelId,
        },
      },
      update: {},
      create: {
        guildId,
        channelId,
        type,
        urlOrHandle,
      },
    });

    const sourceCreated =
      source.createdAt.getTime() === Date.now() - (source.createdAt.getTime() % 1000);

    // Étape 2 : Insertion de la notification avec le sourceId garanti.
    // On utilise `upsert` pour éviter l'erreur P2002 (unique constraint) que
    // Prisma log même quand on la catch. Si l'URL existe déjà, l'upsert ne
    // fait rien (update vide) et on détecte le doublon via le count.
    const cleanedUrl = cleanUrl(url);
    if (!cleanedUrl) {
      return {
        success: false,
        sourceCreated: false,
        notificationInserted: false,
        error: "URL invalide",
      };
    }
    const existingNotif = await prisma.notification.findUnique({
      where: { url: cleanedUrl },
      select: { id: true },
    });
    if (existingNotif) {
      return {
        success: false,
        sourceCreated: false,
        notificationInserted: false,
        skipped: true,
      };
    }
    await prisma.notification.create({
      data: {
        sourceId: String(source.id),
        platform,
        content,
        url: cleanedUrl,
      },
    });

    return {
      success: true,
      sourceCreated,
      notificationInserted: true,
    };
  } catch (error) {
    // P2002 = notification deja existante. Skip silencieux (pas de spam).
    // Tout autre erreur : Bubble-up au caller via `error` pour logging +
    // comptage (ce qui distingue un skip reel d'un crash a investiguer).
    const prismaCode = (error as { code?: string })?.code;
    if (prismaCode === "P2002") {
      return {
        success: false,
        sourceCreated: false,
        notificationInserted: false,
        skipped: true,
      };
    }
    logger.error(`⚠️ [AutoSource] Erreur pour ${urlOrHandle} :`, String(error));
    return {
      success: false,
      sourceCreated: false,
      notificationInserted: false,
      error: String(error),
    };
  }
}

// ============================================================
// RETROSPECTIVE DE DEMARRAGE - Rattrapage sources DB
// ============================================================

export async function runDbSourcesRetrospective(client: Client) {
  logger.info("");
  logger.info("=".repeat(50));
  logger.info("  RETROSPECTIVE DB - Rattrapage sources personnalisées");
  logger.info("=".repeat(50));

  const startTime = Date.now();
  const sources = await prisma.source.findMany();
  let totalPublished = 0;
  let sourcesCreated = 0;
  let notificationsInserted = 0;
  let errorsEncountered = 0;
  // Cap global lu depuis la config (modifiable via env MAX_RETRO_POSTS).
  // Ce cap est bot-wide : la valeur est constante pendant toute la
  // retrospective (et non recalculee par source), ce qui evite une
  // requete guildConfig par iteration.
  const maxRetroPosts = config.maxRetroPosts;
  dbRetroLoop: for (const source of sources) {
    try {
      let items: YouTubeRSSContent[] = [];
      if (source.type === "YOUTUBE") {
        items = await checkYouTubeChannelMulti(source.urlOrHandle, maxRetroPosts);
      } else if (source.type === "TWITTER") {
        const twItems = await checkTwitterUserMulti(source.urlOrHandle, 3);
        items = twItems.map((i) => ({ title: i.text, url: i.url }));
      } else if (source.type === "BLUESKY") {
        items = await checkBlueskyUserMulti(source.urlOrHandle, 3);
      } else if (source.type === "TWITCH") {
        items = await checkTwitchChannelMulti(source.urlOrHandle, 3);
      } else if (source.type === "REDDIT") {
        items = await checkRedditSubredditMulti(source.urlOrHandle, 3);
      } else if (source.type === "INSTAGRAM") {
        items = await checkInstagramUserMulti(source.urlOrHandle, 3);
      }
      let publishedForSource = 0;
      for (const item of items) {
        // Auto-création de source et insertion de notification sécurisée
        const resultAuto = await ensureSourceAndInsertNotification(
          source.urlOrHandle,
          source.type,
          source.channelId,
          source.guildId,
          item.title,
          item.url,
          source.type.toLowerCase() as Platform,
        );

        if (!resultAuto.success) {
          errorsEncountered++;
          // P2002 = skip silencieux (pas un crash a investiguer).
          // Tout autre erreur = log explicite pour diagnostic.
          if (resultAuto.error) {
            logger.error(
              `[RetroDB] Notification echouee pour ${source.urlOrHandle} : ${resultAuto.error}`,
            );
          }
          continue;
        }

        if (resultAuto.sourceCreated) sourcesCreated++;
        if (resultAuto.notificationInserted) notificationsInserted++;

        const channel = client.channels.cache.get(source.channelId) as TextChannel | undefined;
        if (channel && channel.type === ChannelType.GuildText) {
          // Titre enrichi par plateforme
          const icon = PLATFORM_ICONS[source.type.toLowerCase()] || "📢";
          const label = PLATFORM_LABELS[source.type.toLowerCase()] || "";
          const embedTitle = label
            ? icon + " " + item.title + " — " + label
            : icon + " " + item.title;

          const embed = new EmbedBuilder()
            .setTitle(embedTitle)
            .setDescription(item.title)
            .setColor(PLATFORM_COLORS[source.type.toLowerCase()] || 0x5865f2)
            .addFields(
              {
                name: "Plateforme",
                value: PLATFORM_NAMES[source.type.toLowerCase()] || source.type,
                inline: true,
              },
              {
                name: "Note",
                value: "📌 Rattrapage (publié pendant l'arrêt du bot)",
                inline: true,
              },
            )
            .setURL(item.url)
            .setTimestamp();

          try {
            if (source.type === "YOUTUBE") {
              const thumb = item.thumbnail || (await getYouTubeThumbnail(item.url));
              if (thumb) embed.setImage(thumb);
            } else if (source.type === "TWITTER") {
              const og = await getTweetImage(item.url);
              if (og) embed.setImage(og);
            } else if (source.type === "TWITCH") {
              if (item.thumbnail) embed.setImage(item.thumbnail);
            } else if (source.type === "BLUESKY") {
              const og = await getOgImage(item.url);
              if (og) embed.setImage(og);
            } else if (source.type === "REDDIT") {
              const og = await getOgImage(item.url);
              if (og) embed.setImage(og);
            }
          } catch {
            // Ignore image fetch errors
          }
          await channel.send({ embeds: [embed] });
          publishedForSource++;
          totalPublished++;
          if (totalPublished >= maxRetroPosts) {
            logger.info("[RetroDB] Cap global atteint (" + maxRetroPosts + " publications)");
            break dbRetroLoop;
          }
        }
      }
      if (publishedForSource > 0) {
        logger.info(`[RetroDB] @${source.urlOrHandle}: ${publishedForSource} rattrapage(s)`);
      }
    } catch (err) {
      const errMsg = String(err);
      logger.error(`[RetroDB] Erreur source ${source.urlOrHandle}:`, errMsg);
      errorsEncountered++;
      await logError(client, "RetroDB/" + source.urlOrHandle, errMsg);
    }
  }

  const executionTime = Date.now() - startTime;

  logger.info("=".repeat(50));
  logger.info(
    `  Rattrapage DB terminé : ${totalPublished} publication(s)${totalPublished >= maxRetroPosts ? " (cap atteint)" : ""}`,
  );
  logger.info("=".repeat(50));
  logger.info("");

  // Envoi de l'alerte de santé
  await sendHealthAlert(
    client,
    sourcesCreated,
    notificationsInserted,
    totalPublished,
    errorsEncountered,
    executionTime,
  );
}

async function sendHealthAlert(
  client: Client,
  sourcesCreated: number,
  notificationsInserted: number,
  totalPublished: number,
  errorsEncountered: number,
  executionTime: number,
): Promise<void> {
  try {
    const logChannelId = process.env.LOG_CHANNEL_ID;
    if (!logChannelId) {
      logger.error("[HealthAlert] LOG_CHANNEL_ID not defined");
      return;
    }

    const channel = await client.channels.fetch(logChannelId);
    if (!channel || !(channel instanceof TextChannel)) {
      logger.error(`[HealthAlert] Invalid log channel: ${logChannelId}`);
      return;
    }

    const executionTimeFormatted = (executionTime / 1000).toFixed(2);
    const statusColor = errorsEncountered === 0 ? "32" : "33";
    const statusText = errorsEncountered === 0 ? "SUCCÈS" : "AVERTISSEMENT";

    const healthOutput = `\`\`\`ansi
[1;32mOPÉRATIONNEL[0m === RAPPORT DE SANTÉ RÉTROSPECTIVE ===
> Version Core : f35eede
> Identité     : John_Helldiver.aic

--- STATISTIQUES CYCLE ---
[1;36mSOURCES CRÉÉES[0m] [▓▓▓▓▓▒▒▒▒▒▒▒] ${sourcesCreated}
[1;36mNOTIFICATIONS[0m] [▓▓▓▓▓▒▒▒▒▒▒▒] ${notificationsInserted}
[1;36mPUBLIÉES[0m]      [▓▓▓▓▓▒▒▒▒▒▒▒] ${totalPublished}
[1;36mERREURS[0m]       [▓▓▓▓▓▒▒▒▒▒▒▒] ${errorsEncountered}

--- MÉTRIQUES EXÉCUTION ---
TEMPS       -> [1;36m ${executionTimeFormatted}s [0m]
STATUT      -> [1;${statusColor}m ${statusText} [0m]

--- CACHE REDIS ---
[1;36mPERFORMANCE[0m] ${getCacheStats()}

=======================================================
[1;30m// Cycle de rattrapage terminé. Système opérationnel.[0m\`\`\``;

    await channel.send({ content: healthOutput });
    logger.info("[HealthAlert] Health report sent");
  } catch (error) {
    logger.error("[HealthAlert] Error:", error);
  }
}

async function checkSourceInactivity(client: Client): Promise<void> {
  try {
    const sources = await prisma.source.findMany();
    const inactiveThreshold = 7 * 24 * 60 * 60 * 1000; // 7 jours
    const now = Date.now();

    for (const source of sources) {
      const lastNotification = await prisma.notification.findFirst({
        where: { sourceId: String(source.id) },
        orderBy: { sentAt: "desc" },
      });

      if (!lastNotification) {
        const sourceAge = now - source.createdAt.getTime();
        if (sourceAge > inactiveThreshold) {
          await sendInactivityAlert(client, source, "Jamais notifiée");
        }
      } else {
        const timeSinceLastNotification = now - lastNotification.sentAt.getTime();
        if (timeSinceLastNotification > inactiveThreshold) {
          await sendInactivityAlert(
            client,
            source,
            `Dernière notification: ${lastNotification.sentAt.toLocaleDateString("fr-FR")}`,
          );
        }
      }
    }
  } catch (error) {
    logger.error("[SourceInactivity] Error:", error);
  }
}

async function sendInactivityAlert(client: Client, source: any, reason: string): Promise<void> {
  try {
    const logChannelId = process.env.LOG_CHANNEL_ID;
    if (!logChannelId) return;

    const channel = await client.channels.fetch(logChannelId);
    if (!channel || !(channel instanceof TextChannel)) return;

    const alertOutput = `\`\`\`ansi
[1;33mALERTE INACTIVITÉ[0m === SOURCE SANS ACTIVITÉ ===
> Type     : ${source.type}
> Handle   : ${source.urlOrHandle}
> Salon    : <#${source.channelId}>
> Raison   : ${reason}

=======================================================
[1;30m// Source inactive depuis plus de 7 jours.[0m\`\`\``;

    await channel.send({ content: alertOutput });
    logger.info(`[SourceInactivity] Alert sent for ${source.urlOrHandle}`);
  } catch (error) {
    logger.error("[SourceInactivity] Error sending alert:", error);
  }
}

export function startMonitoring(client: Client) {
  if (intervalId) return;
  logger.info("[Monitor] Surveillance activée (intervalle: " + CHECK_INTERVAL_MS / 60000 + " min)");
  try {
    checkAndNotify(client);
  } catch (err) {
    logger.error("[Monitor] Crash au premier check:", String(err));
  }
  intervalId = safeInterval("Monitor", () => checkAndNotify(client), CHECK_INTERVAL_MS);
}

export function stopMonitoring() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info("[Monitor] Surveillance arrêtée");
  }
}

// Intervalle hebdomadaire — initialisé séparément depuis startup.ts
// afin de respecter une SRP : chaque fonction exportée ne gère qu'un
// seul setInterval (le test startMonitoring exige exactement 1 appel).
let inactivityIntervalId: NodeJS.Timeout | null = null;

export function startInactivityCheck(client: Client) {
  if (inactivityIntervalId) return;
  logger.info("[Monitor] Vérification d'inactivité activée (intervalle: 7 jours)");
  inactivityIntervalId = safeInterval(
    "InactivityCheck",
    () => checkSourceInactivity(client),
    7 * 24 * 60 * 60 * 1000,
  );
}

export function stopInactivityCheck() {
  if (inactivityIntervalId) {
    clearInterval(inactivityIntervalId);
    inactivityIntervalId = null;
    logger.info("[Monitor] Vérification d'inactivité arrêtée");
  }
}
