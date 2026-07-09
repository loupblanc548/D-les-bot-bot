import { Client, TextChannel, EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";
import { safeInterval } from "../utils/safe-interval.js";
import { config } from "../config.js";
import { dedupCache } from "../utils/deduplicationCache.js";
import { stripHtml } from "../utils/stripHtml.js";
import Parser from "rss-parser";

const CHECK_INTERVAL_MS = parseInt(process.env.RELEASE_CALENDAR_INTERVAL_MS || "3600000", 10); // 1h
let calendarInterval: NodeJS.Timeout | null = null;

const PLATFORM_FEEDS: { platform: string; url: string; channelId: string; color: number; emoji: string }[] = [
  { platform: "steam", url: "https://store.steampowered.com/feeds/news.xml", channelId: config.steamEpicChannel, color: 0x1b2838, emoji: "🎮" },
  { platform: "playstation", url: "https://blog.playstation.com/feed/", channelId: config.playstationChannel, color: 0x003791, emoji: "🕹️" },
  { platform: "xbox", url: "https://news.xbox.com/en-us/feed/", channelId: config.xboxChannel, color: 0x107c10, emoji: "🎯" },
  { platform: "nintendo", url: "https://www.nintendo.com/fr-fr/whatsnew/rss.xml", channelId: config.nintendoChannel, color: 0xe60012, emoji: "🎲" },
  { platform: "epic", url: "https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=fr", channelId: config.steamEpicChannel, color: 0x2a2a2a, emoji: "📦" },
];

interface GameRelease {
  title: string;
  platform: string;
  releaseDate: Date | null;
  url: string;
  description: string;
}

async function fetchReleases(platform: string, feedUrl: string): Promise<GameRelease[]> {
  const releases: GameRelease[] = [];
  try {
    const parser = new Parser();
    const feed = await parser.parseURL(feedUrl);

    for (const item of feed.items.slice(0, 20)) {
      const title = item.title || "";
      const content = item.contentSnippet || item.content || "";
      const link = item.link || "";
      const pubDate = item.pubDate ? new Date(item.pubDate) : null;

      const releaseKeywords = ["release", "launch", "sortie", "disponible", "out now", "arrive"];
      const isRelease = releaseKeywords.some((kw) => title.toLowerCase().includes(kw) || content.toLowerCase().includes(kw));

      if (isRelease) {
        releases.push({
          title,
          platform,
          releaseDate: pubDate,
          url: link,
          description: stripHtml(content).substring(0, 300),
        });
      }
    }
  } catch (err) {
    logger.debug(`[ReleaseCalendar] Erreur fetch ${platform}: ${err instanceof Error ? err.message : String(err)}`);
  }
  return releases;
}

async function checkReleases(client: Client): Promise<void> {
  for (const feed of PLATFORM_FEEDS) {
    if (!feed.channelId) continue;

    const releases = await fetchReleases(feed.platform, feed.url);
    for (const release of releases) {
      const dedupKey = `release:${feed.platform}:${release.title}`;
      if (dedupCache.isAlreadyProcessed("game_updates", dedupKey)) continue;

      const channel = client.channels.cache.get(feed.channelId) as TextChannel;
      if (!channel?.isTextBased()) continue;

      const daysLeft = release.releaseDate
        ? Math.ceil((release.releaseDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null;

      const embed = new EmbedBuilder()
        .setTitle(`${feed.emoji} ${release.title}`)
        .setDescription(release.description || "Nouvelle sortie à venir")
        .setColor(feed.color)
        .setURL(release.url)
        .addFields(
          { name: "Plateforme", value: `${feed.emoji} ${feed.platform.toUpperCase()}`, inline: true },
          {
            name: "Date de sortie",
            value: release.releaseDate ? release.releaseDate.toLocaleDateString("fr-FR") : "À confirmer",
            inline: true,
          },
          {
            name: "Countdown",
            value: daysLeft !== null ? (daysLeft > 0 ? `${daysLeft} jour(s)` : "Disponible maintenant !") : "—",
            inline: true,
          },
        )
        .setFooter({ text: `Surveillance System • Release Calendar • ${feed.platform.toUpperCase()}` })
        .setTimestamp();

      try {
        await channel.send({ embeds: [embed] });
        await dedupCache.markAsProcessed("game_updates", dedupKey);
        logger.info(`[ReleaseCalendar] Sortie notifiée: ${release.title} (${feed.platform})`);
      } catch (err) {
        logger.error(`[ReleaseCalendar] Erreur envoi: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
}

export function startReleaseCalendar(client: Client): void {
  if (calendarInterval) return;
  logger.info("[ReleaseCalendar] Calendrier de sorties activé (intervalle: 6h) — routing par plateforme");
  calendarInterval = safeInterval("ReleaseCalendar", () => checkReleases(client), CHECK_INTERVAL_MS);
}

export function stopReleaseCalendar(): void {
  if (calendarInterval) {
    clearInterval(calendarInterval);
    calendarInterval = null;
  }
}
