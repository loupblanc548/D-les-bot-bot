/**
 * FreeGameFetcher.ts — Strategy Pattern pour la récupération des jeux gratuits.
 *
 * Implémente une chaîne de stratégies de fallback :
 *   RedditScraper → Rss2Json → DirectRss → EpicApi
 *
 * Chaque stratégie implémente l'interface FetchStrategy et peut être
 * ajoutée/supprimée indépendamment.
 */

import axios from "axios";
import logger from "../utils/logger.js";
import { config } from "../config.js";
import { scrapeRssFeed } from "../managers/ScraperManager.js";
import { parseRssXmlItems, RssItem } from "../utils/rss.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FreeGameItem {
  title: string;
  link: string;
  pubDate: string;
  content?: string;
  contentSnippet?: string;
  author?: string;
  guid?: string;
  redditPostId?: string;
  thumbnail?: string;
  enclosure?: { url: string; type: string };
}

/**
 * Interface Strategy : chaque stratégie sait si elle peut gérer la requête
 * et retourne une liste d'items ou null (pour passer à la suivante).
 */
export interface FetchStrategy {
  readonly name: string;
  fetch(): Promise<FreeGameItem[] | null>;
}

// ─── Stratégie A : Scrapling sur le RSS Reddit direct (anti-bot bypass) ────

export class RedditScraperStrategy implements FetchStrategy {
  readonly name = "RedditScraper";

  async fetch(): Promise<FreeGameItem[] | null> {
    try {
      const scraped = await scrapeRssFeed(config.redditFreeGamesRss, 15000);

      if (scraped.raw) {
        const items = parseRssXmlItems(scraped.raw);
        if (items.length > 0) {
          return items.map(this.rssItemToFreeGame);
        }
        // Fallback: essayer JSON si ce n'est pas du XML
        try {
          const parsed = JSON.parse(scraped.raw);
          const jsonItems = (parsed.items || parsed.entries || []) as FreeGameItem[];
          if (jsonItems.length > 0) return jsonItems;
        } catch {
          // Pas du JSON non plus
        }
      }

      if ((scraped as any).items && Array.isArray((scraped as any).items) && (scraped as any).items.length > 0) {
        return (scraped as any).items as FreeGameItem[];
      }

      return null;
    } catch (err) {
      logger.warn(`[FreeGameFetcher] RedditScraperStrategy failed: ${(err as Error).message}`);
      return null; // Prochaine stratégie
    }
  }

  private rssItemToFreeGame(item: RssItem): FreeGameItem {
    return {
      title: item.title,
      link: item.link,
      pubDate: item.pubDate,
      content: item.content,
      contentSnippet: item.contentSnippet,
      author: item.author,
      guid: item.guid,
      thumbnail: item.thumbnail,
      enclosure: item.enclosure,
    };
  }
}

// ─── Stratégie B : rss2json (service tiers) ──────────────────────────────────

export class Rss2JsonStrategy implements FetchStrategy {
  readonly name = "Rss2Json";

  async fetch(): Promise<FreeGameItem[] | null> {
    try {
      const url = `${config.rss2jsonBaseUrl}?rss_url=${encodeURIComponent(config.redditFreeGamesRss)}`;
      const response = await axios.get(url, { timeout: 10000 });
      const items = (response.data.items || []) as FreeGameItem[];
      return items.length > 0 ? items : null;
    } catch (err) {
      logger.warn(`[FreeGameFetcher] Rss2JsonStrategy failed: ${(err as Error).message}`);
      return null;
    }
  }
}

// ─── Stratégie C : Axios direct sur le RSS Reddit ───────────────────────────

export class DirectRssStrategy implements FetchStrategy {
  readonly name = "DirectRss";

  async fetch(): Promise<FreeGameItem[] | null> {
    try {
      const response = await axios.get(config.redditFreeGamesRss, { timeout: 15000 });
      const items = parseRssXmlItems(response.data);
      if (items.length > 0) {
        return items.map(this.rssItemToFreeGame);
      }
      return null;
    } catch (err) {
      logger.warn(`[FreeGameFetcher] DirectRssStrategy failed: ${(err as Error).message}`);
      return null;
    }
  }

  private rssItemToFreeGame(item: RssItem): FreeGameItem {
    return {
      title: item.title,
      link: item.link,
      pubDate: item.pubDate,
      content: item.content,
      contentSnippet: item.contentSnippet,
      author: item.author,
      guid: item.guid,
      thumbnail: item.thumbnail,
      enclosure: item.enclosure,
    };
  }
}

// ─── Stratégie D : API Epic Games ───────────────────────────────────────────

export class EpicApiStrategy implements FetchStrategy {
  readonly name = "EpicApi";

  async fetch(): Promise<FreeGameItem[] | null> {
    try {
      const response = await axios.get(config.epicGamesRss, { timeout: 15000 });
      const epicData = response.data;
      const elements = epicData?.data?.Catalog?.searchStore?.elements;

      if (!elements || !Array.isArray(elements)) return null;

      const items = elements
        .filter((e: Record<string, unknown>) => {
          const offers = (e as Record<string, unknown>).promotions as Record<string, unknown> | undefined;
          return offers?.promotionalOffers && Array.isArray(offers.promotionalOffers) && offers.promotionalOffers.length > 0;
        })
        .map((e: Record<string, unknown>) => ({
          title: String(e.title || "Jeu gratuit Epic Games"),
          link: `https://store.epicgames.com/p/${e.productSlug || ((e.catalogNs as Record<string, unknown>)?.mappings as Record<string, unknown>[])?.[0]?.pageSlug || ''}`,
          pubDate: new Date().toISOString(),
          content: String(e.description || ""),
          guid: String(e.productSlug || e.id || ""),
          thumbnail: Array.isArray(e.keyImages) ? String((e.keyImages as Record<string, unknown>[])[0]?.url || "") : "",
        })) as FreeGameItem[];

      return items.length > 0 ? items : null;
    } catch (err) {
      logger.warn(`[FreeGameFetcher] EpicApiStrategy failed: ${(err as Error).message}`);
      return null;
    }
  }
}

// ─── FreeGameFetcher : chaîne de stratégies ─────────────────────────────────

/**
 * FreeGameFetcher tente chaque stratégie dans l'ordre jusqu'à obtenir
 * des items. Ajoutez une stratégie à la liste `strategies` pour
 * l'inclure dans la chaîne de fallback.
 */
export class FreeGameFetcher {
  private strategies: FetchStrategy[];

  constructor(strategies?: FetchStrategy[]) {
    // Ordre par défaut : du plus robuste au moins robuste
    this.strategies = strategies ?? [
      new RedditScraperStrategy(),
      new Rss2JsonStrategy(),
      new DirectRssStrategy(),
      new EpicApiStrategy(),
    ];
  }

  /**
   * Parcourt les stratégies dans l'ordre et retourne les items
   * de la première qui réussit.
   */
  async fetchGames(): Promise<FreeGameItem[]> {
    for (const strategy of this.strategies) {
      logger.debug(`[FreeGameFetcher] Trying strategy: ${strategy.name}`);
      const items = await strategy.fetch();
      if (items && items.length > 0) {
        logger.info(`[FreeGameFetcher] Strategy "${strategy.name}" returned ${items.length} item(s)`);
        return items;
      }
    }

    logger.error("[FreeGameFetcher] All strategies failed — no free games found");
    return [];
  }

  /**
   * Retourne la liste des noms de stratégies (utile pour le debug).
   */
  getStrategyNames(): string[] {
    return this.strategies.map(s => s.name);
  }
}
