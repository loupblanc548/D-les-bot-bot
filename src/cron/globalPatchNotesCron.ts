import { Client } from "discord.js";
import cron, { ScheduledTask } from "node-cron";
import axios from "axios";
import { config } from "../config.js";
import logger from "../utils/logger.js";
import { translateAutoToFrench } from "../utils/translator.js";
import {
  isNewItem,
  markAsProcessed,
  ContentType,
  isWithinTemporalBarrier,
} from "../managers/ScraperManager.js";
import { scrapeRssFeed } from "../managers/ScraperManager.js";
import { routeArticle } from "../managers/ChannelRouter.js";
import { dedupCache } from "../utils/deduplicationCache.js";
import { parseRssXmlItems } from "../utils/rss.js";
import { generateStableId } from "../utils/url-cleaner.js";

// âââ Constantes âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

// URL directe Reddit RSS (scrapee via Scrapling - anti-bot bypass)
const DIRECT_REDDIT_RSS_URL = config.redditPatchNotesRss;
// Fallback: rss2json (service tiers - utilise uniquement si Scrapling echoue)
const RSS2JSON_FALLBACK_URL = `${config.rss2jsonBaseUrl}?rss_url=${encodeURIComponent(config.redditPatchNotesRss)}`;

// Flux RSS officiels par plateforme — tous les jeux, toutes les news
const PLATFORM_RSS_FEEDS: { name: string; url: string; platform: string }[] = [
  { name: "Steam News", url: "https://store.steampowered.com/feeds/news.xml", platform: "steam" },
  { name: "PlayStation Blog", url: "https://blog.playstation.com/feed/", platform: "playstation" },
  { name: "Xbox Wire", url: "https://news.xbox.com/feed/", platform: "xbox" },
  { name: "Nintendo News", url: "https://www.nintendo.com/feed/", platform: "nintendo" },
  {
    name: "Epic Games",
    url: "https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions",
    platform: "epic",
  },
  // Sources gaming générales — détectées et routées par ChannelRouter
  { name: "IGN", url: "https://feeds.feedburner.com/ign/games-all", platform: "general" },
  { name: "GameSpot", url: "https://www.gamespot.com/feeds/mashup/news/", platform: "general" },
  { name: "Eurogamer", url: "https://www.eurogamer.net/feed", platform: "general" },
  { name: "PC Gamer", url: "https://www.pcgamer.com/rss/", platform: "general" },
  { name: "Kotaku", url: "https://kotaku.com/rss", platform: "general" },
];
// âââ Types ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

interface PatchNoteItem {
  title: string;
  link: string;
  pubDate: string;
  content?: string;
  contentSnippet?: string;
  author?: string;
  guid?: string;
  thumbnail?: string;
  enclosure?: { url: string; type: string };
}

// âââ Helpers ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

/**
 * Parse le XML RSS brut en items structures.
 * Utilise fast-xml-parser pour une extraction fiable de tous les champs.
 */
/** @internal Test-only export */
function _generatePatchId(link: string): string {
  const match = link.match(/\/comments\/([a-z0-9]+)\//i);
  return match?.[1] || link;
}

function generatePatchGuid(item: PatchNoteItem): string {
  return generateStableId({ guid: item.guid, link: item.link, title: item.title });
}

function generateSummary(content: string): string {
  if (!content) return "Aucune description disponible";

  // Remove HTML tags
  let cleanText = content.replace(/<[^>]*>/g, "");

  // Remove BBCode tags
  cleanText = cleanText.replace(/\[\/?[a-z]+\]/gi, "");

  // Remove URLs
  cleanText = cleanText.replace(/https?:\/\/[^\s]+/g, "");

  // Remove excessive whitespace
  cleanText = cleanText.replace(/\s+/g, " ").trim();

  // Limit to 400-500 characters
  if (cleanText.length > 500) {
    cleanText = cleanText.substring(0, 500);
    // Find the last space to avoid cutting in the middle of a word
    const lastSpace = cleanText.lastIndexOf(" ");
    if (lastSpace > 400) {
      cleanText = cleanText.substring(0, lastSpace);
    }
    cleanText += "...";
  }

  return cleanText;
}

// createPatchEmbed() dÃ©lÃ©guÃ©e Ã  ChannelRouter.buildPlatformEmbed()
// La traduction est dÃ©sormais gÃ©rÃ©e dans processPatchNote (avant routage)
// âââ Main Processing ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

async function processPatchNote(client: Client, item: PatchNoteItem): Promise<void> {
  // âââ Ãtape 1: BarriÃ¨re temporelle 48h (ScraperManager) ââââââââââââââââ
  if (!isWithinTemporalBarrier(item.pubDate)) {
    logger.debug(`[GlobalPatchNotes] Item ignorÃ© (barriÃ¨re 48h): ${item.pubDate}`);
    return;
  }

  const patchGuid = generatePatchGuid(item);

  // âââ Ãtape 2: DÃ©duplication (ScraperManager) ââââââââââââââââââââââââââ
  const isNew = await isNewItem(ContentType.PATCH_NOTE, patchGuid);
  if (!isNew) {
    return;
  }

  // VERROU ANTI-SPAM : dedup cache JSON local
  if (dedupCache.isAlreadyProcessed("patch_notes", patchGuid)) {
    logger.debug(`[SPAM BLOQUE] Patch notes doublon cache: ${patchGuid}`);
    return;
  }

  // âââ Ãtape 3: Traduction (translator) ââââââââââââââââââââââââââââââââ
  let translatedTitle = item.title;
  let translatedContent = generateSummary(item.content || item.contentSnippet || "");

  try {
    const titleResult = await translateAutoToFrench(item.title);
    if (titleResult && titleResult.detectedLanguage !== "fr") {
      translatedTitle = titleResult.translatedText;
    }

    const contentResult = await translateAutoToFrench(translatedContent);
    if (contentResult && contentResult.detectedLanguage !== "fr") {
      translatedContent = contentResult.translatedText;
    }
  } catch (error) {
    logger.debug(
      `[GlobalPatchNotes] Erreur traduction, utilisation texte original: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Tronquer le contenu pour respecter les limites Discord (4096 chars max)
  if (translatedContent.length > 1800) {
    translatedContent = translatedContent.slice(0, 1797) + "...";
  }

  // âââ Ãtape 4: Routage multi-salon (ChannelRouter) ââââââââââââââââââââ
  const imageUrl = item.thumbnail || item.enclosure?.url;

  try {
    const routingResult = await routeArticle(
      client,
      translatedTitle,
      translatedContent,
      item.link,
      item.pubDate,
      imageUrl,
    );

    logger.info(
      `[GlobalPatchNotes] RoutÃ©: "${translatedTitle.slice(0, 60)}" â ${routingResult.sentTo.length} salon(s), ${routingResult.errors.length} erreur(s)`,
    );

    if (routingResult.errors.length > 0) {
      logger.warn(`[GlobalPatchNotes] Erreurs routage: ${routingResult.errors.join("; ")}`);
    }

    // âââ Ãtape 5: Marquage comme traitÃ© (ScraperManager) âââââââââââââââ
    // Marquer SEULEMENT si au moins un salon a reÃ§u l'article
    if (routingResult.routed) {
      // Marquer dans le cache JSON anti-doublon
      await dedupCache.markAsProcessed("patch_notes", patchGuid);
      await markAsProcessed(ContentType.PATCH_NOTE, patchGuid);
    }
  } catch (error) {
    logger.error(
      `[GlobalPatchNotes] Ãchec routage: ${error instanceof Error ? error.message : String(error)}`,
      { stack: error instanceof Error ? error.stack : undefined },
    );
    // Ne pas marquer comme traitÃ© si le routage Ã©choue â sera rÃ©essayÃ©
  }
}

// Circuit breaker for Reddit RSS feed
const redditFeedFailures = { count: 0, skipUntil: 0 };
const MAX_REDDIT_FAILURES = 3;
const REDDIT_SKIP_MS = 60 * 60 * 1000; // 1h

async function checkPatchNotes(client: Client): Promise<void> {
  // 🔒 Recharge le cache anti-doublon depuis le disque (persistance inter-cycles)
  await dedupCache.reloadFromDisk();

  // Circuit breaker: skip Reddit RSS if too many failures
  if (Date.now() < redditFeedFailures.skipUntil) {
    logger.debug("[GlobalPatchNotes] Flux Reddit en circuit breaker — skip");
    return;
  }

  logger.info("[GlobalPatchNotes] Vérification des patch notes Reddit...");

  try {
    // Fetch via Scrapling adaptive scraper (anti-bot bypass + self-healing selectors)
    let items: PatchNoteItem[] = [];
    try {
      const scraped = await scrapeRssFeed(DIRECT_REDDIT_RSS_URL, 15000);
      if (scraped.raw) {
        // Parser le XML RSS brut via fast-xml-parser (fiable, extrait tous les champs)
        items = parseRssXmlItems(scraped.raw);
        if (items.length === 0) {
          // Fallback: essayer JSON si ce n'est pas du XML
          try {
            const parsed = JSON.parse(scraped.raw);
            items = (parsed.items || parsed.entries || []) as PatchNoteItem[];
          } catch (error) {
            logger.warn(
              "[GlobalPatchNotes] Failed to parse RSS XML: " +
                (error instanceof Error ? error.message : String(error)),
            );
            logger.warn("[GlobalPatchNotes] Unable to parse scraped raw content");
          }
        }
      } else if ((scraped as Record<string, unknown>).items) {
        // Items pre-parses par scraper-bridge (deja valides)
        items = (scraped as Record<string, unknown>).items as PatchNoteItem[];
      }
    } catch (scraperErr) {
      logger.warn(
        "[GlobalPatchNotes] Scrapling failed on direct Reddit RSS, falling back to rss2json: " +
          (scraperErr instanceof Error ? scraperErr.message : String(scraperErr)),
      );
      // Fallback to original axios method
      try {
        const response = await axios.get(RSS2JSON_FALLBACK_URL, { timeout: 10000 });
        const feed = response.data;
        items = (feed.items || []) as PatchNoteItem[];
      } catch (axiosErr) {
        logger.warn(
          "[GlobalPatchNotes] rss2json also failed, trying direct Reddit RSS with axios: " +
            (axiosErr instanceof Error ? axiosErr.message : String(axiosErr)),
        );
        try {
          const directResponse = await axios.get(DIRECT_REDDIT_RSS_URL, { timeout: 15000 });
          const rawXml = directResponse.data;
          const titleMatches =
            (typeof rawXml == "string" ? rawXml.match(/<title[^>]*>([^<]+)<\/title>/gi) : null) ||
            [];
          items = titleMatches.slice(1).map((t, _i) => ({
            title: t.replace(/<[^>]+>/g, ""),
            link: "",
            pubDate: new Date().toISOString(),
            content: "",
          })) as PatchNoteItem[];
        } catch (_directErr) {
          logger.error(
            "[GlobalPatchNotes] All 3 attempts failed (Scrapling, rss2json, direct axios)",
          );
          return;
        }
      }
    }

    if (!Array.isArray(items) || items.length === 0) {
      redditFeedFailures.count++;
      if (redditFeedFailures.count >= MAX_REDDIT_FAILURES) {
        redditFeedFailures.skipUntil = Date.now() + REDDIT_SKIP_MS;
        redditFeedFailures.count = 0;
        logger.warn(`[GlobalPatchNotes] Flux Reddit désactivé ${REDDIT_SKIP_MS / 60000}min (${MAX_REDDIT_FAILURES} échecs)`);
      }
      logger.warn("[GlobalPatchNotes] Format RSS invalide ou aucun item");
      return;
    }

    // Reset failures on success
    redditFeedFailures.count = 0;

    let processedCount = 0;
    for (const item of items.slice(0, 20)) {
      try {
        // 🔒 Delai anti rate-limit (1s entre chaque item)
        await new Promise((resolve) => setTimeout(resolve, 500));
        await processPatchNote(client, item as PatchNoteItem);
        processedCount++;
      } catch (error) {
        logger.error(
          `[GlobalPatchNotes] Erreur traitement patch: ${error instanceof Error ? error.message : String(error)}`,
          { stack: error instanceof Error ? error.stack : undefined },
        );
      }
    }

    logger.info(`[GlobalPatchNotes] ${processedCount} patch note(s) traitÃ©e(s)`);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) {
        logger.warn("[GlobalPatchNotes] Rate limit Reddit (429) - rÃ©essayer plus tard");
      } else {
        logger.error(`[GlobalPatchNotes] Erreur HTTP: ${error.response?.status || error.message}`, {
          stack: error.stack,
        });
      }
    } else {
      logger.error(
        `[GlobalPatchNotes] Erreur critique: ${error instanceof Error ? error.message : String(error)}`,
        { stack: error instanceof Error ? error.stack : undefined },
      );
    }
  }
}

// âââ Cron Management âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

async function checkPlatformFeeds(client: Client): Promise<void> {
  for (const feed of PLATFORM_RSS_FEEDS) {
    try {
      const response = await axios.get(feed.url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        timeout: 15000,
        maxRedirects: 5,
        validateStatus: (s) => s < 400,
      });

      const raw = typeof response.data === "string" ? response.data : JSON.stringify(response.data);
      if (!raw || raw.length < 50) continue;

      const items = parseRssXmlItems(raw);
      if (items.length === 0) continue;

      let processed = 0;
      for (const item of items.slice(0, 15)) {
        try {
          await new Promise((resolve) => setTimeout(resolve, 800));
          await processPatchNote(client, item as PatchNoteItem);
          processed++;
        } catch (err) {
          logger.error(
            `[GlobalPatchNotes] Erreur traitement ${feed.name}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      if (processed > 0) {
        logger.info(`[GlobalPatchNotes] ${feed.name}: ${processed} article(s) traite(s)`);
      }
    } catch (err) {
      logger.debug(
        `[GlobalPatchNotes] Flux ${feed.name} indisponible: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

let cronJob: ScheduledTask | null = null;
let isChecking = false;

export function startGlobalPatchNotesMonitoring(client: Client): void {
  if (cronJob) {
    logger.warn("[GlobalPatchNotes] DÃ©jÃ  actif â ignorÃ©");
    return;
  }

  logger.info(
    "[GlobalPatchNotes] â±ï¸ ExÃ©cution Cron planifiÃ©e pour Patch Notes â toutes les 10 minutes",
  );

  cronJob = cron.schedule("*/5 * * * *", () => {
    if (isChecking) {
      logger.info("[GlobalPatchNotes] VÃ©rification dÃ©jÃ  en cours, ignorÃ©e");
      return;
    }

    isChecking = true;
    logger.info("[GlobalPatchNotes] â±ï¸ ExÃ©cution Cron planifiÃ©e pour Patch Notes");

    Promise.allSettled([checkPatchNotes(client), checkPlatformFeeds(client)])
      .then((results) => {
        const rejected = results.filter((r) => r.status === "rejected");
        if (rejected.length > 0) {
          logger.error(`[GlobalPatchNotes] ${rejected.length} source(s) en erreur`);
        }
      })
      .finally(() => {
        isChecking = false;
      });
  });
}

export function stopGlobalPatchNotesMonitoring(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info("[GlobalPatchNotes] ArrÃªtÃ©");
  }
}

export { checkPatchNotes, checkPlatformFeeds };
