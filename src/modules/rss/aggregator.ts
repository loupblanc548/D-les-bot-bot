import { Client, TextChannel, EmbedBuilder } from "discord.js";
import logger from "../../utils/logger.js";
import Parser from "rss-parser";
import { ensureConnected } from "../../utils/redisClient.js";
import {
  createEpicEmbed,
  createSteamEmbed,
  createPlayStationEmbed,
  createXboxEmbed,
  createNintendoEmbed,
} from "./themedEmbeds.js";
import { cleanUrl } from "../../utils/url-cleaner.js";
import { dedupCache } from "../../utils/deduplicationCache.js";

const parser = new Parser();
const RSS_POSTED_KEY_PREFIX = "rss:posted:";
const RSS_TTL = 7 * 24 * 60 * 60; // 7 days
const CHECK_INTERVAL = 15 * 60 * 1000; // 15 minutes

interface RSSFeed {
  name: string;
  urls: string[];
  channelId: string;
  type: "epic" | "steam" | "playstation" | "xbox" | "nintendo" | "instantgaming";
}

const RSS_FEEDS: RSSFeed[] = [
  {
    name: "Fortnite",
    urls: process.env.PATCH_FORTNITE_RSS?.split(",") || [],
    channelId: process.env.PATCH_CHANNEL_FORTNITE_ID || "",
    type: "epic",
  },
  {
    name: "PlayStation",
    urls: process.env.PATCH_PLAYSTATION_RSS?.split(",") || [],
    channelId: process.env.PATCH_CHANNEL_PLAYSTATION_ID || "",
    type: "playstation",
  },
  {
    name: "Steam/Epic",
    urls: (process.env.PATCH_STEAM_EPIC_RSS || process.env.PATCH_STEAM_RSS || "")
      .split(",")
      .filter(Boolean),
    channelId: process.env.PATCH_CHANNEL_STEAM_EPIC_ID || process.env.PATCH_CHANNEL_STEAM_ID || "",
    type: "steam",
  },
  {
    name: "Xbox",
    urls: process.env.PATCH_XBOX_RSS?.split(",") || [],
    channelId: process.env.PATCH_CHANNEL_XBOX_ID || "",
    type: "xbox",
  },
  {
    name: "Nintendo",
    urls: process.env.PATCH_NINTENDO_RSS?.split(",") || [],
    channelId: process.env.PATCH_CHANNEL_NINTENDO_ID || "",
    type: "nintendo",
  },
  {
    name: "Instant Gaming",
    urls: process.env.PATCH_INSTANT_GAMING_RSS?.split(",") || [],
    channelId: process.env.PATCH_CHANNEL_INSTANT_GAMING_ID || "",
    type: "instantgaming",
  },
].filter((feed) => feed.urls.length > 0 && feed.channelId) as RSSFeed[];

export function startRSSAggregator(client: Client): void {
  logger.info("[RSSAggregator] Starting RSS aggregator");

  const _rssInterval = setInterval(async () => {
    await checkAllFeeds(client);
  }, CHECK_INTERVAL);
  if (_rssInterval.unref) _rssInterval.unref();

  checkAllFeeds(client);
}

async function checkAllFeeds(client: Client): Promise<void> {
  for (const feed of RSS_FEEDS) {
    if (!feed.channelId || feed.urls.length === 0) continue;

    for (const url of feed.urls) {
      try {
        await checkFeed(client, feed, url);
      } catch (error) {
        logger.error(`[RSSAggregator] Error checking ${feed.name} (${url}):`, error);
      }
    }
  }
}

async function checkFeed(client: Client, feed: RSSFeed, url: string): Promise<void> {
  try {
    const feedData = await parser.parseURL(url);

    if (!feedData.items || feedData.items.length === 0) {
      return;
    }

    const channel = await client.channels.fetch(feed.channelId);

    if (!channel || !(channel instanceof TextChannel)) {
      logger.error(`[RSSAggregator] Invalid channel for ${feed.name}: ${feed.channelId}`);
      return;
    }

    const redis = await ensureConnected();
    let postedCount = 0;

    for (const item of feedData.items) {
      const rawIdentifier = item.guid || item.link;
      if (!rawIdentifier) {
        logger.warn(`[RSSAggregator] No GUID or link for item in ${feed.name}`);
        continue;
      }

      // Normaliser l'URL pour la déduplication (retire tracking params)
      const itemIdentifier = cleanUrl(rawIdentifier);
      const postedKey = `${RSS_POSTED_KEY_PREFIX}${itemIdentifier}`;

      // Check 1: Redis (si disponible)
      const isPosted = redis ? await redis.get(postedKey) : null;
      if (isPosted) {
        logger.debug(`[RSSAggregator] Doublon Redis ignoré: ${item.title?.slice(0, 60)}`);
        continue;
      }

      // Check 2: dedupCache local (fallback si Redis down)
      if (dedupCache.isAlreadyProcessed(feed.type as any, itemIdentifier)) {
        logger.debug(`[RSSAggregator] Doublon cache local ignoré: ${item.title?.slice(0, 60)}`);
        continue;
      }

      const embedResult = createThemedEmbed(feed.type, item);

      try {
        if (embedResult instanceof EmbedBuilder) {
          await channel.send({ embeds: [embedResult] });
        } else {
          // Async embed (e.g. PlayStation with image attachment)
          const { embed, files } = await embedResult;
          await channel.send({ embeds: [embed], files: files || [] });
        }
        postedCount++;
      } catch (sendError) {
        logger.error(`[RSSAggregator] Erreur envoi ${feed.name}: ${sendError}`);
        continue;
      }

      // Marquer comme publié
      if (redis) await redis.set(postedKey, "1", { EX: RSS_TTL });
      await dedupCache.markAsProcessed(feed.type as any, itemIdentifier);

      logger.info(`[RSSAggregator] Posted new ${feed.name} item: ${item.title}`);

      // Délai anti rate-limit
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (postedCount === 0) {
      logger.debug(`[RSSAggregator] No new items for ${feed.name}`);
    }
  } catch (error) {
    logger.error(`[RSSAggregator] Error processing ${feed.name} (${url}):`, error);
  }
}

function createThemedEmbed(type: string, item: any): EmbedBuilder | Promise<{ embed: EmbedBuilder; files?: import("discord.js").AttachmentBuilder[] }> {
  const rssItem = {
    title: item.title || "Sans titre",
    description: item.contentSnippet || item.description || "Sans description",
    link: item.link || "",
    pubDate: item.pubDate,
    guid: item.guid,
    author: item.author || item.creator || "",
    category: item.category,
  };

  switch (type) {
    case "epic":
      return createEpicEmbed(rssItem);
    case "steam":
      return createSteamEmbed(rssItem);
    case "playstation":
      return createPlayStationEmbed(rssItem);
    case "xbox":
      return createXboxEmbed(rssItem);
    case "nintendo":
      return createNintendoEmbed(rssItem);
    default:
      return createEpicEmbed(rssItem);
  }
}
