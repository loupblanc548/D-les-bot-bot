import logger from "../utils/logger.js";
import { Client, EmbedBuilder, TextChannel } from "discord.js";
import {
  getYouTubeThumbnail,
  getTweetImage,
  getBlogImage,
  extractMediaThumbnail,
} from "../utils/image-helpers.js";
import prisma from "../prisma.js";
import { Platform } from "@prisma/client";
import { cleanUrl } from "../utils/url-cleaner.js";
import { config } from "../config.js";
import { getYouTubeRssUrl } from "./youtube.js";
import { fetchFreeGames } from "./epicgames.js";
import { embedEpicGames } from "../utils/gaming-embeds.js";
import {
  generateCardAttachment,
  getPlatformColor,
  getPlatformLabel,
} from "../utils/notificationCards.js";
import { alertApiFailure, alertNotificationFailure } from "../services/proactiveAlerts.js";
import { fetchRetry } from "../utils/fetchRetry.js";
import {
  RSS_HEADERS,
  PLATFORM_COLORS,
  PLATFORM_ICONS,
  PLATFORM_LABELS,
  xmlParser,
  textOf,
  extractLink,
} from "../utils/rss-parser.js";

interface SourceConfig {
  platform: "youtube" | "twitter" | "blogs";
  handle: string;
  blogUrl?: string;
}

interface ChannelFeed {
  channelId: string;
  channelName: string;
  sources: SourceConfig[];
}

const FEEDS: ChannelFeed[] = [
  {
    channelId: config.fortniteChannel,
    channelName: "Fortnite",
    sources: [
      { platform: "twitter", handle: "FortniteFR" },
      { platform: "twitter", handle: "FortniteGame" },
      { platform: "youtube", handle: "Fortnite" },
      { platform: "twitter", handle: "HYPEX" },
      { platform: "twitter", handle: "ShiinaBR" },
      { platform: "youtube", handle: "ShiinaBR" },
    ],
  },
  {
    channelId: config.nintendoChannel,
    channelName: "Nintendo",
    sources: [
      { platform: "twitter", handle: "NintendoFrance" },
      { platform: "youtube", handle: "NintendoFR" },
    ],
  },
  {
    channelId: config.playstationChannel,
    channelName: "PlayStation",
    sources: [
      { platform: "twitter", handle: "PlayStationFR" },
      { platform: "youtube", handle: "PlayStationFrance" },
      {
        platform: "blogs",
        handle: "PlayStationBlog",
        blogUrl: "https://blog.fr.playstation.com/feed/",
      },
    ],
  },
  {
    channelId: config.xboxChannel,
    channelName: "Xbox",
    sources: [
      { platform: "twitter", handle: "XboxFR" },
      { platform: "youtube", handle: "XboxFR" },
    ],
  },
  {
    channelId: config.robloxChannel,
    channelName: "Roblox",
    sources: [
      { platform: "twitter", handle: "Roblox" },
      { platform: "youtube", handle: "Roblox" },
      { platform: "blogs", handle: "RobloxBlog", blogUrl: "https://blog.roblox.com/feed/" },
    ],
  },
  {
    channelId: "1524219631047540826",
    channelName: "Créateurs",
    sources: [
      { platform: "youtube", handle: "LaupokBazar" },
      { platform: "youtube", handle: "Conkerax" },
      { platform: "youtube", handle: "Lusty_Luxure" },
    ],
  },
];

const FETCH_RSS_TTL_MS = config.rssCacheTtlMs;
const rssCache = new Map<string, { data: string | null; ts: number }>();

let rssLastSweep = 0;
const RSS_SWEEP_COOLDOWN_MS = 60_000;

function sweepRssCache() {
  const now = Date.now();
  if (now - rssLastSweep < RSS_SWEEP_COOLDOWN_MS) return;
  rssLastSweep = now;
  for (const [key, { ts }] of rssCache) {
    if (now - ts >= FETCH_RSS_TTL_MS) rssCache.delete(key);
  }
}

async function cachedFetchRss(url: string, needHeaders: boolean): Promise<string | null> {
  const key = (needHeaders ? "h:" : "") + url;
  const cached = rssCache.get(key);
  if (cached && Date.now() - cached.ts < FETCH_RSS_TTL_MS) {
    return Promise.resolve(cached.data);
  }
  try {
    const response = await fetchRetry(url, {
      headers: needHeaders ? RSS_HEADERS : undefined,
      retries: 2,
      retryDelayMs: 1500,
      timeoutMs: 12_000,
    });
    if (!response.ok) {
      rssCache.set(key, { data: null, ts: Date.now() });
      return null;
    }
    const data = await response.text();
    sweepRssCache();
    rssCache.set(key, { data, ts: Date.now() });
    return data;
  } catch {
    sweepRssCache();
    rssCache.set(key, { data: null, ts: Date.now() });
    return null;
  }
}

async function fetchRss(url: string, needHeaders = false): Promise<string | null> {
  return cachedFetchRss(url, needHeaders);
}

export function parseRssItems(xml: string): { title: string; url: string; thumbnail?: string }[] {
  try {
    const parsed = xmlParser.parse(xml);
    const rawItems = parsed.rss?.channel?.item || parsed.feed?.entry;
    if (!rawItems) return [];
    const list = Array.isArray(rawItems) ? rawItems : [rawItems];
    return list
      .map((item: any) => ({
        title: textOf(item.title).trim(),
        url: extractLink(item.link).trim(),
        thumbnail: extractMediaThumbnail(item),
      }))
      .filter((i) => i.title && i.url);
  } catch (error) {
    logger.error("[Feeds] Erreur lors du parsing RSS:", error);
    void alertApiFailure(
      "RSS Feed",
      String(error instanceof Error ? error.message : String(error)),
    );
    return [];
  }
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

async function checkTwitterSource(
  handle: string,
): Promise<{ title: string; url: string; thumbnail?: string } | null> {
  for (const instance of NITTER_INSTANCES) {
    const url = `${instance}/${handle}/rss`;
    const xml = await fetchRss(url, true);
    if (!xml || xml.includes("RSS reader not yet whitelisted")) continue;
    const items = parseRssItems(xml);
    if (items.length > 0) return items[0];
  }
  return null;
}

async function checkYouTubeSource(
  handle: string,
): Promise<{ title: string; url: string; thumbnail?: string } | null> {
  const rssUrl = await getYouTubeRssUrl(handle);
  if (!rssUrl) {
    const fallbackXml = await fetchRss("https://www.youtube.com/feeds/videos.xml?user=" + handle);
    if (fallbackXml) {
      const items = parseRssItems(fallbackXml);
      return items[0] || null;
    }
    return null;
  }
  const xml = await fetchRss(rssUrl);
  if (!xml) return null;
  const items = parseRssItems(xml);
  return items[0] || null;
}

async function checkBlogSource(
  blogUrl: string,
): Promise<{ title: string; url: string; thumbnail?: string } | null> {
  const xml = await fetchRss(blogUrl);
  if (!xml) return null;
  const items = parseRssItems(xml);
  return items[0] || null;
}

async function checkTwitterSourceMulti(
  handle: string,
  limit: number = 3,
): Promise<{ title: string; url: string; thumbnail?: string }[]> {
  for (const instance of NITTER_INSTANCES) {
    const url = `${instance}/${handle}/rss`;
    const xml = await fetchRss(url, true);
    if (!xml || xml.includes("RSS reader not yet whitelisted")) continue;
    const items = parseRssItems(xml);
    if (items.length > 0) return items.slice(0, limit);
  }
  return [];
}

async function checkYouTubeSourceMulti(
  handle: string,
  limit: number = 3,
): Promise<{ title: string; url: string; thumbnail?: string }[]> {
  const rssUrl = await getYouTubeRssUrl(handle);
  let xml: string | null = null;
  if (rssUrl) {
    xml = await fetchRss(rssUrl);
  }
  if (!xml) {
    xml = await fetchRss("https://www.youtube.com/feeds/videos.xml?user=" + handle);
  }
  if (!xml) return [];
  const items = parseRssItems(xml);
  return items.slice(0, limit);
}

async function checkBlogSourceMulti(
  blogUrl: string,
  limit: number = 3,
): Promise<{ title: string; url: string; thumbnail?: string }[]> {
  const xml = await fetchRss(blogUrl);
  if (!xml) return [];
  const items = parseRssItems(xml);
  return items.slice(0, limit);
}

/**
 * Tente d'insérer une notification en base.
 * Utilise la contrainte d'unicité sur l'URL comme bouclier anti-doublon.
 *
 * @returns true si la notification est nouvelle (insérée avec succès)
 * @returns false si l'URL existe déjà (doublon, erreur P2002)
 */
async function tryInsertNotification(
  sourceId: string,
  platform: Platform,
  content: string,
  url: string,
): Promise<boolean> {
  const cleanedUrl = cleanUrl(url);
  if (!cleanedUrl) return false;

  try {
    await prisma.notification.upsert({
      where: { url: cleanedUrl },
      update: {},
      create: {
        sourceId,
        platform,
        content,
        url: cleanedUrl,
      },
    });
    return true; // Nouveau contenu, insertion réussie
  } catch (err: unknown) {
    // Autre erreur : on laisse passer pour ne pas bloquer le flux
    logger.error(
      `[Feeds] Erreur insertion notification: ${err instanceof Error ? err.message : String(err)}`,
      { stack: err instanceof Error ? err.stack : undefined },
    );
    return false;
  }
}

export async function sendToChannel(
  client: Client,
  channelId: string,
  embed: EmbedBuilder,
): Promise<boolean> {
  try {
    let channel = client.channels.cache.get(channelId) as TextChannel | undefined;
    // Fetch from API if not in cache
    if (!channel) {
      try {
        channel = (await client.channels.fetch(channelId)) as TextChannel | undefined;
      } catch (fetchErr) {
        logger.error(`[Feeds] Channel ${channelId} introuvable: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`);
        return false;
      }
    }
    if (channel?.isTextBased()) {
      try {
        await channel.send({ embeds: [embed] });
        return true;
      } catch (sendErr) {
        // Si l'embed est rejeté (image invalide, etc.), retry sans image
        const errMsg = sendErr instanceof Error ? sendErr.message : String(sendErr);
        if (errMsg.includes("Received one or more errors") || errMsg.includes("embed")) {
          try {
            embed.setImage(null);
            embed.setThumbnail(null);
            await channel.send({ embeds: [embed] });
            logger.warn(`[Feeds] Embed envoyé sans image après erreur Discord sur ${channelId}`);
            return true;
          } catch (retryErr) {
            logger.error(`[Feeds] Retry sans image échoué sur ${channelId}: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`);
          }
        }
        logger.error(`[Feeds] Discord API error sur ${channelId}: ${errMsg}`);
        return false;
      }
    }
    logger.warn(`[Feeds] Channel ${channelId} n'est pas textuel (type: ${channel?.type})`);
    return false;
  } catch (err) {
    logger.error(`[Feeds] Erreur envoi channel ${channelId}: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

export async function sendToChannelWithAttachment(
  client: Client,
  channelId: string,
  embed: EmbedBuilder,
  attachment: { attachment: Buffer; name: string },
): Promise<boolean> {
  try {
    let channel = client.channels.cache.get(channelId) as TextChannel | undefined;
    // Fetch from API if not in cache
    if (!channel) {
      try {
        channel = (await client.channels.fetch(channelId)) as TextChannel | undefined;
      } catch (fetchErr) {
        logger.error(`[Feeds] Channel ${channelId} introuvable (attachment): ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`);
        return false;
      }
    }
    if (channel?.isTextBased()) {
      try {
        await channel.send({ embeds: [embed], files: [attachment] });
        return true;
      } catch (sendErr) {
        // Si l'envoi avec attachment échoue, logger l'erreur réelle
        logger.error(`[Feeds] Discord API error (attachment) on ${channelId}: ${sendErr instanceof Error ? sendErr.message : String(sendErr)}`);
        return false;
      }
    }
    logger.warn(`[Feeds] Channel ${channelId} n'est pas textuel (type: ${channel?.type})`);
    return false;
  } catch (err) {
    logger.error(`[Feeds] Erreur envoi channel ${channelId} (attachment): ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

async function sendToChannelWithCard(
  client: Client,
  channelId: string,
  embed: EmbedBuilder,
  platform: string,
  title: string,
  handle: string,
  thumbnail?: string,
  url?: string,
): Promise<boolean> {
  try {
    const cardType = platform === "youtube" ? "youtube" : "blog";
    const cardAttachment = await generateCardAttachment(
      {
        type: cardType as "youtube" | "blog",
        title,
        subtitle: `@${handle}`,
        imageUrl: thumbnail,
        platformName: getPlatformLabel(platform.toLowerCase()),
        platformColor: getPlatformColor(platform.toLowerCase()),
        url,
      },
      `feed-${platform}-${Date.now()}`,
    );

    if (cardAttachment) {
      embed.setImage(`attachment://${cardAttachment.name}`);
      const sent = await sendToChannelWithAttachment(client, channelId, embed, cardAttachment);
      if (sent) return true;
      // Attachment send failed — clear the attachment:// image and retry with plain embed
      embed.setImage(null);
    }
    return await sendToChannel(client, channelId, embed);
  } catch (err) {
    logger.warn(`[Feeds] Card generation failed for ${platform}/${handle}: ${err instanceof Error ? err.message : String(err)}`);
    // Clear any attachment:// image that would be invalid without the file
    try { embed.setImage(null); } catch {}
    return await sendToChannel(client, channelId, embed);
  }
}

export async function logError(client: Client, module: string, error: string) {
  if (!config.logChannel) return;
  try {
    const embed = new EmbedBuilder()
      .setTitle("⚠️ Erreur système")
      .setColor(0xff3344)
      .addFields(
        { name: "Module", value: module, inline: true },
        { name: "Timestamp", value: new Date().toISOString(), inline: true },
        { name: "Message", value: error.slice(0, 1024) },
      )
      .setTimestamp();
    await sendToChannel(client, config.logChannel, embed);
  } catch {
    logger.error("[LogError] Impossible d'écrire dans le salon de logs");
  }
}

export async function runGamingFeeds(client: Client) {
  logger.info("[Feeds] Vérification des comptes gaming...");
  for (const feed of FEEDS) {
    if (!feed.channelId) continue;
    for (const source of feed.sources) {
      try {
        let result: { title: string; url: string; thumbnail?: string } | null = null;
        if (source.platform === "twitter") {
          result = await checkTwitterSource(source.handle);
        } else if (source.platform === "youtube") {
          result = await checkYouTubeSource(source.handle);
        } else if (source.platform === "blogs" && source.blogUrl) {
          result = await checkBlogSource(source.blogUrl);
        }
        if (!result || !result.url) continue;
        const isNewNotif = await tryInsertNotification(
          "gaming-feed",
          source.platform,
          result.title,
          result.url,
        );
        if (!isNewNotif) continue;

        const icon = PLATFORM_ICONS[source.platform] || "📡";
        const label = PLATFORM_LABELS[source.platform] || "";
        const embedTitle = label
          ? icon + " " + result.title + " — " + label
          : icon + " " + result.title;

        const embed = new EmbedBuilder()
          .setTitle(embedTitle)
          .setURL(result.url)
          .setColor(PLATFORM_COLORS[source.platform] || 0x5865f2)
          .addFields(
            {
              name: "Source",
              value: "@" + source.handle + " (" + source.platform + ")",
              inline: true,
            },
            { name: "Salon", value: feed.channelName, inline: true },
          )
          .setTimestamp();

        try {
          if (source.platform === "youtube") {
            const thumb = result.thumbnail || (await getYouTubeThumbnail(result.url));
            if (thumb) embed.setImage(thumb);
          } else if (source.platform === "twitter") {
            const og = await getTweetImage(result.url);
            if (og) embed.setImage(og);
          } else if (source.platform === "blogs") {
            const img = await getBlogImage(result.url);
            if (img) embed.setImage(img);
          }
        } catch {}

        const sent = await sendToChannelWithCard(
          client,
          feed.channelId,
          embed,
          source.platform,
          result.title,
          source.handle,
          result.thumbnail,
          result.url,
        );
        if (sent) {
          logger.info("[Feeds] OK " + feed.channelName + " <- @" + source.handle);
        }
      } catch (err) {
        const errMsg = String(err instanceof Error ? err.message : String(err));
        // Erreurs transitoires (Nitter down, RSS timeout, socket) — log seulement, pas d'alerte
        const isTransient = errMsg.includes("fetch") ||
          errMsg.includes("timeout") ||
          errMsg.includes("socket") ||
          errMsg.includes("ECONNREFUSED") ||
          errMsg.includes("ETIMEDOUT") ||
          errMsg.includes("ENOTFOUND") ||
          errMsg.includes("aborted") ||
          errMsg.includes("Nitter") ||
          errMsg.toLowerCase().includes("rss");

        if (isTransient) {
          logger.warn(`[Feeds] Transitoire ${feed.channelName}/${source.handle}: ${errMsg}`);
        } else {
          logger.error("[Feeds] ERR " + feed.channelName + "/" + source.handle + ": " + errMsg);
          void alertNotificationFailure(feed.channelName + "/" + source.handle, errMsg);
          await logError(client, "Feeds/" + feed.channelName + "/" + source.handle, errMsg);
        }
      }
    }
  }
  logger.info("[Feeds] Vérification terminée");
}

export async function runStartupRetrospective(client: Client) {
  logger.info("");
  logger.info("=".repeat(50));
  logger.info("  RETROSPECTIVE DE DEMARRAGE - Rattrapage");
  logger.info("=".repeat(50));
  let totalPublished = 0;
  const MAX_RETRO_POSTS = config.maxRetroPosts;
  feedLoop: for (const feed of FEEDS) {
    if (!feed.channelId) continue;
    for (const source of feed.sources) {
      try {
        let items: { title: string; url: string; thumbnail?: string }[] = [];
        if (source.platform === "twitter") {
          items = await checkTwitterSourceMulti(source.handle, 3);
        } else if (source.platform === "youtube") {
          items = await checkYouTubeSourceMulti(source.handle, 3);
        } else if (source.platform === "blogs" && source.blogUrl) {
          items = await checkBlogSourceMulti(source.blogUrl, 3);
        }
        let publishedForSource = 0;
        for (const item of items) {
          if (!item.url) continue;
          const isNewRetroNotif = await tryInsertNotification(
            "gaming-feed",
            source.platform,
            item.title,
            item.url,
          );
          if (!isNewRetroNotif) continue;

          const icon = PLATFORM_ICONS[source.platform] || "📡";
          const label = PLATFORM_LABELS[source.platform] || "";
          const embedTitle = label
            ? icon + " " + item.title + " — " + label
            : icon + " " + item.title;

          const embed = new EmbedBuilder()
            .setTitle(embedTitle)
            .setURL(item.url)
            .setColor(PLATFORM_COLORS[source.platform] || 0x5865f2)
            .addFields(
              {
                name: "Source",
                value: "@" + source.handle + " (" + source.platform + ")",
                inline: true,
              },
              { name: "Salon", value: feed.channelName, inline: true },
              {
                name: "Note",
                value: "📌 Rattrapage (publié pendant l'arrêt du bot)",
                inline: false,
              },
            )
            .setTimestamp();

          try {
            if (source.platform === "youtube") {
              const thumb = item.thumbnail || (await getYouTubeThumbnail(item.url));
              if (thumb) embed.setImage(thumb);
            } else if (source.platform === "twitter") {
              const og = await getTweetImage(item.url);
              if (og) embed.setImage(og);
            } else if (source.platform === "blogs") {
              const img = await getBlogImage(item.url);
              if (img) embed.setImage(img);
            }
          } catch (error) {
            logger.error("[Feeds] Erreur lors de la récupération de l'image:", error);
          }

          const sent = await sendToChannel(client, feed.channelId, embed);
          if (sent) {
            publishedForSource++;
            totalPublished++;
            if (totalPublished >= MAX_RETRO_POSTS) {
              logger.info("[Retro] Cap global atteint (" + MAX_RETRO_POSTS + " publications)");
              break feedLoop;
            }
          }
        }
        if (publishedForSource > 0) {
          logger.info(
            `[Retro] ${feed.channelName}/@${source.handle}: ${publishedForSource} rattrapage(s)`,
          );
        }
      } catch (err) {
        const errMsg = String(err);
        logger.error(`[Retro] Erreur ${feed.channelName}/@${source.handle}: ${errMsg}`);
        await logError(client, "Retro/" + feed.channelName + "/" + source.handle, errMsg);
      }
    }
  }

  try {
    const epicGames = await fetchFreeGames(client);
    if (epicGames.length > 0) {
      logger.info(`[Retro] ${epicGames.length} jeu(x) Epic Games gratuit(s) à rattraper`);
      for (const game of epicGames) {
        const epicEmbed = embedEpicGames({
          name: game.title,
          originalPrice: game.originalPrice || "Gratuit",
          endDate: game.freeEndDate
            ? new Date(game.freeEndDate).toLocaleDateString("fr-FR")
            : "Limitée",
          description: game.description || undefined,
          imageUrl: game.imageUrl || undefined,
        });
        epicEmbed.setURL(game.url);
        epicEmbed.addFields({
          name: "📌 Note",
          value: "Rattrapage (publié pendant l'arrêt du bot)",
          inline: false,
        });
        if (config.steamEpicChannel) {
          await sendToChannel(client, config.steamEpicChannel, epicEmbed);
        }
      }
    }
  } catch (err) {
    logger.error("[Retro] Erreur Epic Games:", String(err));
  }

  logger.info("=".repeat(50));
  logger.info(
    `  Rattrapage terminé : ${totalPublished} publication(s)${totalPublished >= MAX_RETRO_POSTS ? " (cap atteint)" : ""}`,
  );
  logger.info("=".repeat(50));
  logger.info("");
}

export { PLATFORM_COLORS, PLATFORM_ICONS, PLATFORM_LABELS };
