import { Client, EmbedBuilder, TextChannel } from "discord.js";
import Parser from "rss-parser";
import { createClient } from "redis";

const redis = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

redis.on("error", (err: Error) => console.error("[Redis] Error:", err));
redis.connect().catch((err) => console.error("[Redis] Connect error:", err));

const parser = new Parser();
const RSS_POSTED_KEY_PREFIX = "rss:posted:";
const RSS_TTL = 7 * 24 * 60 * 60; // 7 days
const CHECK_INTERVAL = 15 * 60 * 1000; // 15 minutes

interface RSSFeed {
  name: string;
  urls: string[];
  channelId: string;
}

const RSS_FEEDS: RSSFeed[] = [
  {
    name: "Fortnite",
    urls: process.env.PATCH_FORTNITE_RSS?.split(",") || [],
    channelId: process.env.PATCH_CHANNEL_FORTNITE_ID || "",
  },
  {
    name: "PlayStation",
    urls: process.env.PATCH_PLAYSTATION_RSS?.split(",") || [],
    channelId: process.env.PATCH_CHANNEL_PLAYSTATION_ID || "",
  },
  {
    name: "Steam",
    urls: process.env.PATCH_STEAM_RSS?.split(",") || [],
    channelId: process.env.PATCH_CHANNEL_STEAM_ID || "",
  },
  {
    name: "Xbox",
    urls: process.env.PATCH_XBOX_RSS?.split(",") || [],
    channelId: process.env.PATCH_CHANNEL_XBOX_ID || "",
  },
];

export function startRSSAggregator(client: Client): void {
  console.log("[RSSAggregator] Starting RSS aggregator");

  setInterval(async () => {
    await checkAllFeeds(client);
  }, CHECK_INTERVAL);

  checkAllFeeds(client);
}

async function checkAllFeeds(client: Client): Promise<void> {
  for (const feed of RSS_FEEDS) {
    if (!feed.channelId || feed.urls.length === 0) continue;

    for (const url of feed.urls) {
      try {
        await checkFeed(client, feed, url);
      } catch (error) {
        console.error(`[RSSAggregator] Error checking ${feed.name} (${url}):`, error);
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

    const latestItem = feedData.items[0];
    const itemIdentifier = latestItem.guid || latestItem.link;

    if (!itemIdentifier) {
      console.warn(`[RSSAggregator] No GUID or link for item in ${feed.name}`);
      return;
    }

    const postedKey = `${RSS_POSTED_KEY_PREFIX}${itemIdentifier}`;
    const isPosted = await redis.get(postedKey);

    if (isPosted) {
      return;
    }

    const channel = await client.channels.fetch(feed.channelId);

    if (!channel || !(channel instanceof TextChannel)) {
      console.error(`[RSSAggregator] Invalid channel for ${feed.name}: ${feed.channelId}`);
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`📢 ${feed.name} - Nouvelle Mise à Jour`)
      .setDescription(latestItem.title || "Sans titre")
      .addFields(
        { name: "Lien", value: latestItem.link || "Non disponible" },
        {
          name: "Description",
          value: (latestItem.contentSnippet || latestItem.description || "Sans description").substring(0, 300),
        },
      )
      .setColor(0xffd700)
      .setFooter({ text: "John Helldiver • Super Earth Command" })
      .setTimestamp(latestItem.pubDate ? new Date(latestItem.pubDate) : new Date());

    await channel.send({ embeds: [embed] });

    await redis.set(postedKey, "1", { EX: RSS_TTL });

    console.log(`[RSSAggregator] Posted new ${feed.name} item: ${latestItem.title}`);
  } catch (error) {
    console.error(`[RSSAggregator] Error processing ${feed.name} (${url}):`, error);
  }
}
