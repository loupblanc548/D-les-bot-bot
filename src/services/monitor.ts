import logger from "../utils/logger.js";
import prisma from "../prisma.js";
import { Platform } from "@prisma/client";
import { cleanUrl } from "../utils/url-cleaner.js";
import { MessageFlags, Client, TextChannel, EmbedBuilder } from "discord.js";
import { runGamingFeeds, sendToChannel, logError, PLATFORM_COLORS, PLATFORM_ICONS, PLATFORM_LABELS } from "./feeds.js";
import { getYouTubeThumbnail, getOgImage, getTweetImage, extractMediaThumbnail } from "../utils/image-helpers.js";
import { fetchFreeGames } from "./epicgames.js";
import { embedEpicGames } from "../utils/gaming-embeds.js";
import { config } from "../config.js";
import { RSS_HEADERS, PLATFORM_NAMES, xmlParser, textOf, extractLink } from "../utils/rss-parser.js";

const CHECK_INTERVAL_MS = config.monitoringIntervalMs;
let intervalId: NodeJS.Timeout | null = null;
let isChecking = false;

type YouTubeRSSContent = { title: string; url: string; thumbnail?: string };
type TextRSSContent = { text: string; url: string };
type BlueskyRSSContent = { title: string; url: string };

let whitelistWarningShown = false;

// ============================================================
// FONCTIONS RSS (sources DB)
// ============================================================

async function checkYouTubeChannel(handle: string): Promise<{
  status: "new" | "none" | "error";
  content?: YouTubeRSSContent;
}> {
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
        return { status: "new", content: { title, url: link, thumbnail } };
      }
      return { status: "none" };
    } catch {}
  }
  return { status: "error" };
}

async function checkTwitterUser(handle: string): Promise<{
  status: "new" | "none" | "error";
  content?: TextRSSContent;
}> {
  const url = `https://xcancel.com/${handle}/rss`;

  try {
    const response = await fetch(url, { headers: RSS_HEADERS });
    if (!response.ok) {
      logger.warn(`[Monitor] Twitter RSS: HTTP ${response.status} pour @${handle}`);
      return { status: "error" };
    }
    const text = await response.text();

    if (text.includes("RSS reader not yet whitelisted")) {
      if (!whitelistWarningShown) {
        whitelistWarningShown = true;
        logger.warn(
          `[Monitor] ⚠️  xcancel.com exige une whitelist. ` +
          `Envoyez un email à rss@xcancel.com avec votre User-Agent (DiscordSurveillanceBot/1.0)`
        );
      }
      return { status: "error" };
    }

    const parsed = xmlParser.parse(text);
    const items = parsed.rss?.channel?.item;
    if (!items) return { status: "none" };
    const firstItem = Array.isArray(items) ? items[0] : items;
    const content = textOf(firstItem.title).trim();
    const link = extractLink(firstItem.link).trim();
    if (content && link) {
      return { status: "new", content: { text: content, url: link } };
    }
    return { status: "none" };
  } catch (error) {
    logger.error(`[Monitor] Erreur lors du check Twitter pour @${handle}:`, error);
    return { status: "error" };
  }
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

async function checkYouTubeChannelMulti(handle: string, limit: number = 3): Promise<YouTubeRSSContent[]> {
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
  const url = `https://xcancel.com/${handle}/rss`;
  try {
    const response = await fetch(url, { headers: RSS_HEADERS });
    if (!response.ok) return [];
    const text = await response.text();
    if (text.includes("RSS reader not yet whitelisted")) return [];
    const parsed = xmlParser.parse(text);
    const items = parsed.rss?.channel?.item;
    if (!items) return [];
    const list = Array.isArray(items) ? items : [items];
    const results: TextRSSContent[] = [];
    for (const item of list) {
      const content = textOf(item.title).trim();
      const link = extractLink(item.link).trim();
      if (content && link) results.push({ text: content, url: link });
    }
    return results.slice(0, limit);
  } catch (error) {
    logger.error(`[Monitor] Erreur lors du check:`, error);
    return [];
  }
}

async function checkBlueskyUserMulti(handle: string, limit: number = 3): Promise<BlueskyRSSContent[]> {
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
        await sendToChannel(client, steamEpicChannel, embed);
        logger.info(`[EpicGames] Notification: ${game.title}`);
      }
    }
  } catch (err) {
    const errMsg = String(err);
    logger.error("[EpicGames] Erreur:", errMsg);
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
    for (const source of sources) {
      try {
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
          const contentText = "title" in result.content ? result.content.title : result.content.text;
          
          const success = await ensureSourceAndInsertNotification(
            source.urlOrHandle,
            source.type,
            source.channelId,
            source.guildId,
            contentText,
            notifUrl,
            source.type as Platform
          );

          if (!success) continue;

          const channel = client.channels.cache.get(source.channelId) as TextChannel | undefined;
          if (channel?.isTextBased()) {
            // Titre enrichi par plateforme
            const icon = PLATFORM_ICONS[source.type.toLowerCase()] || "📢";
            const label = PLATFORM_LABELS[source.type.toLowerCase()] || "";
            const contentText = "title" in result.content ? result.content.title : result.content.text;
            const embedTitle = label
              ? icon + " " + contentText + " — " + label
              : icon + " " + contentText;

            const embed = new EmbedBuilder()
              .setTitle(embedTitle)
              .setDescription("title" in result.content ? result.content.title : result.content.text)
              .setColor(PLATFORM_COLORS[source.type.toLowerCase()] || 0x5865f2)
              .addFields({ name: "Plateforme", value: PLATFORM_NAMES[source.type.toLowerCase()] || source.type, inline: true })
              .setTimestamp();
            if (result.content.url) embed.setURL(result.content.url);

            try {
              if (source.type === "YOUTUBE" && result.content.url) {
                const ytContent = result.content as YouTubeRSSContent;
                const thumb = ytContent.thumbnail || await getYouTubeThumbnail(ytContent.url);
                if (thumb) embed.setImage(thumb);
              } else if (source.type === "TWITTER" && result.content.url) {
                const og = await getTweetImage(result.content.url);
                if (og) embed.setImage(og);
              } else if (source.type === "BLUESKY" && result.content.url) {
                const og = await getOgImage(result.content.url);
                if (og) embed.setImage(og);
              }
            } catch {}
            await channel.send({ embeds: [embed] });
            logger.info(`[Monitor] Notification envoyée pour @${source.urlOrHandle}`);
          }
        }
      } catch (err) {
        const errMsg = String(err);
        logger.error(`[Monitor] Erreur source ${source.urlOrHandle}:`, errMsg);
        await logError(client, `Monitor/DB/${source.urlOrHandle}`, errMsg);
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
    try { await logError(client, "Monitor/Global", errMsg); } catch {}
  } finally {
    isChecking = false;
  }
}

// ============================================================
// AUTO-CRÉATION DE SOURCES ET INSERTION DE NOTIFICATIONS
// ============================================================

async function ensureSourceAndInsertNotification(
  urlOrHandle: string,
  type: string,
  channelId: string,
  guildId: string,
  content: string,
  url: string,
  platform: Platform
): Promise<boolean> {
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

    // Étape 2 : Insertion de la notification avec le sourceId garanti
    await prisma.notification.upsert({
      where: { url: cleanUrl(url) || "" },
      update: {},
      create: {
        sourceId: String(source.id),
        platform,
        content,
        url: cleanUrl(url) || null,
      },
    });

    return true;
  } catch (error) {
    console.error(`⚠️ [AutoSource] Erreur pour ${urlOrHandle} :`, String(error));
    return false;
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
  const sources = await prisma.source.findMany();
  let totalPublished = 0;
  const MAX_RETRO_POSTS = config.maxRetroPosts;
dbRetroLoop:
  for (const source of sources) {
    try {
      let items: YouTubeRSSContent[] = [];
      if (source.type === "YOUTUBE") {
        items = await checkYouTubeChannelMulti(source.urlOrHandle, 3);
      } else if (source.type === "TWITTER") {
        const twItems = await checkTwitterUserMulti(source.urlOrHandle, 3);
        items = twItems.map(i => ({ title: i.text, url: i.url }));
      } else if (source.type === "BLUESKY") {
        items = await checkBlueskyUserMulti(source.urlOrHandle, 3);
      }
      let publishedForSource = 0;
      for (const item of items) {
        // Auto-création de source et insertion de notification sécurisée
        const success = await ensureSourceAndInsertNotification(
          source.urlOrHandle,
          source.type,
          source.channelId,
          source.guildId,
          item.title,
          item.url,
          source.type as Platform
        );

        if (!success) continue;

        const channel = client.channels.cache.get(source.channelId) as TextChannel | undefined;
        if (channel?.isTextBased()) {
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
              { name: "Plateforme", value: PLATFORM_NAMES[source.type.toLowerCase()] || source.type, inline: true },
              { name: "Note", value: "📌 Rattrapage (publié pendant l'arrêt du bot)", inline: true }
            )
            .setURL(item.url)
            .setTimestamp();

          try {
            if (source.type === "YOUTUBE") {
              const thumb = item.thumbnail || await getYouTubeThumbnail(item.url);
              if (thumb) embed.setImage(thumb);
            } else if (source.type === "TWITTER") {
              const og = await getTweetImage(item.url);
              if (og) embed.setImage(og);
            } else if (source.type === "BLUESKY") {
              const og = await getOgImage(item.url);
              if (og) embed.setImage(og);
            }
          } catch {}
          await channel.send({ embeds: [embed] });
          publishedForSource++;
          totalPublished++;
          if (totalPublished >= MAX_RETRO_POSTS) {
            logger.info("[RetroDB] Cap global atteint (" + MAX_RETRO_POSTS + " publications)");
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
      await logError(client, "RetroDB/" + source.urlOrHandle, errMsg);
    }
  }
  logger.info("=".repeat(50));
  logger.info(`  Rattrapage DB terminé : ${totalPublished} publication(s)${totalPublished >= MAX_RETRO_POSTS ? " (cap atteint)" : ""}`);
  logger.info("=".repeat(50));
  logger.info("");
}

export function startMonitoring(client: Client) {
  if (intervalId) return;
  logger.info("[Monitor] Surveillance activée (intervalle: " + (CHECK_INTERVAL_MS / 60000) + " min)");
  try {
    checkAndNotify(client);
  } catch (err) {
    logger.error("[Monitor] Crash au premier check:", String(err));
  }
  intervalId = setInterval(function() {
    try {
      checkAndNotify(client);
    } catch (err) {
      logger.error("[Monitor] Crash dans le setInterval:", String(err));
    }
  }, CHECK_INTERVAL_MS);
}

export function stopMonitoring() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info("[Monitor] Surveillance arrêtée");
  }
}
