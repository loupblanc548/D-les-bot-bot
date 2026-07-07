/**
 * braveSearch.ts — Brave Search API integration
 *
 * Free tier: 2000 queries/month, 1 query/sec
 * Web search with rich snippets, images, news
 *
 * Primary use: searchWeb tool in agent loop, OSINT, fact-checking
 * Replaces the existing searchWeb implementation with a proper search API
 */

import logger from "../utils/logger.js";
import { config } from "../config.js";

const BRAVE_BASE_URL = "https://api.search.brave.com/res/v1/web/search";

export function isBraveSearchAvailable(): boolean {
  return !!config.braveSearchApiKey;
}

export interface SearchResult {
  title: string;
  url: string;
  description: string;
  snippet?: string;
}

export interface BraveSearchResponse {
  web?: {
    results?: Array<{
      title?: string;
      url?: string;
      description?: string;
      snippet?: string;
      extra_snippets?: string[];
    }>;
  };
  news?: {
    results?: Array<{
      title?: string;
      url?: string;
      description?: string;
      snippet?: string;
    }>;
  };
}

/**
 * Search the web using Brave Search API
 * @param query Search query
 * @param count Number of results (max 20)
 * @returns Array of search results
 */
export async function braveWebSearch(
  query: string,
  count = 5,
): Promise<SearchResult[]> {
  if (!config.braveSearchApiKey) return [];

  try {
    const params = new URLSearchParams({
      q: query,
      count: String(Math.min(count, 20)),
      country: "FR",
      search_lang: "fr",
      safesearch: "moderate",
    });

    const res = await fetch(`${BRAVE_BASE_URL}?${params}`, {
      headers: {
        "X-Subscription-Token": config.braveSearchApiKey,
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      logger.debug(`[BraveSearch] HTTP ${res.status}`);
      return [];
    }

    const data = (await res.json()) as BraveSearchResponse;
    const results: SearchResult[] = [];

    const webResults = data.web?.results || [];
    for (const r of webResults.slice(0, count)) {
      if (r.url && r.title) {
        results.push({
          title: r.title,
          url: r.url,
          description: r.description || r.snippet || "",
          snippet: r.snippet,
        });
      }
    }

    return results;
  } catch (error) {
    logger.debug(`[BraveSearch] Error: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

/**
 * Format search results as a readable string for AI consumption
 */
export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) return "Aucun résultat trouvé.";
  return results
    .map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.description.slice(0, 200)}`)
    .join("\n\n");
}
