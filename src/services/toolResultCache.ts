/**
 * toolResultCache.ts — TTL-based cache for stable tool results
 *
 * Caches tool results that are stable over a short time window to avoid
 * redundant API calls (weather, crypto, translation, etc.)
 *
 * NEVER cache tools classified as medium/high risk in toolRiskRegistry.ts
 * (OSINT, breach checks, security tools — cached responses could mask state changes).
 */

import logger from "../utils/logger.js";
import { getRiskLevel } from "./toolRiskRegistry.js";
import { ensureConnected } from "../utils/redisClient.js";

interface CachedToolResult {
  result: any;
  timestamp: number;
  ttlMs: number;
}

const cache = new Map<string, CachedToolResult>();
const REDIS_PREFIX = "tool:cache:";

// ─── TTL per tool (ms) ───────────────────────────────────────────────────────
const TOOL_TTL_MS: Record<string, number> = {
  // Weather: 10 minutes (conditions change slowly)
  getWeather: 10 * 60 * 1000,
  // Crypto: 30 seconds (volatile but not second-by-second)
  getCryptoPrice: 30 * 1000,
  // Web search: 5 minutes (results stable short-term)
  searchGoogle: 5 * 60 * 1000,
  searchWeb: 5 * 60 * 1000,
  // Translation: 1 hour (same text = same translation)
  translateText: 60 * 60 * 1000,
  translateTextDeepL: 60 * 60 * 1000,
  auto_translate: 60 * 60 * 1000,
  // Country info: 24 hours (rarely changes)
  get_country_info: 24 * 60 * 60 * 1000,
  getCountryInfo: 24 * 60 * 60 * 1000,
  capital_lookup: 24 * 60 * 60 * 1000,
  country_bordering: 24 * 60 * 60 * 1000,
  // Urban dictionary: 1 hour
  get_urban_dict: 60 * 60 * 1000,
  getUrbanDict: 60 * 60 * 1000,
  // Dev.to articles: 30 minutes
  get_devto_articles: 30 * 60 * 1000,
  // Google trends: 30 minutes
  getGoogleTrends: 30 * 60 * 1000,
  // NPM/PyPI package info: 1 hour
  get_npm_package: 60 * 60 * 1000,
  get_pypi_package: 60 * 60 * 1000,
  // Air quality: 15 minutes
  getAirQuality: 15 * 60 * 1000,
  // Tech news: 15 minutes
  getTechNews: 15 * 60 * 1000,
  // ── Orphan tools (Phase 1) ──
  // Lyrics: 24h (rarely changes)
  get_lyrics: 24 * 60 * 60 * 1000,
  // URL shortener: 24h (same URL = same short link)
  shorten_url: 24 * 60 * 60 * 1000,
  // DNS: 5 minutes (DNS can change)
  resolve_dns: 5 * 60 * 1000,
  // Game prices: 30 minutes
  compare_game_prices: 30 * 60 * 1000,
  // Game server status: 2 minutes (player count changes fast)
  check_game_server: 2 * 60 * 1000,
  minecraft_server_status: 2 * 60 * 1000,
  // Game artwork: 24h (rarely changes)
  get_game_artwork: 24 * 60 * 60 * 1000,
  // ── Additional cacheable tools ──
  // Wikipedia: 1 hour (articles rarely change)
  getWikipediaSummary: 60 * 60 * 1000,
  // Wiktionary: 24 hours (definitions rarely change)
  getWiktionaryDefinition: 24 * 60 * 60 * 1000,
  // GitHub repo info: 10 minutes
  getGitHubRepo: 10 * 60 * 1000,
  // Fortnite shop: 30 minutes (rotates daily)
  fortnite_item_shop: 30 * 60 * 1000,
  // Epic free games: 1 hour
  epic_games_free_games: 60 * 60 * 1000,
  // Joke/quote/trivia: 5 minutes
  getJoke: 5 * 60 * 1000,
  getDadJoke: 5 * 60 * 1000,
  getQuote: 5 * 60 * 1000,
  getTrivia: 5 * 60 * 1000,
  getRandomFact: 5 * 60 * 1000,
  // NASA APOD: 24 hours (one per day)
  getNasaApod: 24 * 60 * 60 * 1000,
  // Pokemon: 24 hours (static data)
  getPokemon: 24 * 60 * 60 * 1000,
  getColorInfo: 24 * 60 * 60 * 1000,
  // Reddit: 10 minutes
  getRedditPosts: 10 * 60 * 1000,
  // Exchange rates: 30 minutes
  convertCurrency: 30 * 60 * 1000,
  // BoardGameGeek: 1 hour
  boardgame_geek_search: 60 * 60 * 1000,
  // crt.sh: 30 minutes
  crtsh_search: 30 * 60 * 1000,
  // Wayback: 24 hours
  wayback_machine_lookup: 24 * 60 * 60 * 1000,
};

// ─── Adaptive TTL multipliers by risk level ──────────────────────────────────
// Low risk tools get longer TTL, restricted tools get shorter TTL
const TTL_MULTIPLIER_BY_LEVEL: Record<string, number> = {
  low: 1.0,
  medium: 0.5,
  high: 0.25,
  restricted: 0.25,
};

const MAX_CACHE_SIZE = 500;
const DEFAULT_TTL_MS = 5 * 60 * 1000;

function generateCacheKey(toolName: string, args: Record<string, any>): string {
  const argStr = JSON.stringify(args, Object.keys(args).sort());
  return `${toolName}:${argStr}`;
}

/**
 * Check if a tool should be cached.
 * Returns false for medium/high risk tools (security, OSINT, breach checks).
 */
export function isToolCacheable(toolName: string): boolean {
  // Only cache tools with an explicit TTL
  if (!(toolName in TOOL_TTL_MS)) return false;

  // Never cache medium/high risk tools
  const risk = getRiskLevel(toolName);
  if (risk === "medium" || risk === "high") {
    return false;
  }

  return true;
}

/**
 * Get a cached tool result if available and not expired.
 * Returns null if not cached or expired.
 */
export async function getCachedToolResult(
  toolName: string,
  args: Record<string, any>,
): Promise<any | null> {
  if (!isToolCacheable(toolName)) return null;

  const key = generateCacheKey(toolName, args);
  const entry = cache.get(key);

  if (entry) {
    const now = Date.now();
    if (now - entry.timestamp > entry.ttlMs) {
      cache.delete(key);
    } else {
      logger.debug(`[ToolCache] L1 hit: ${toolName}`);
      return entry.result;
    }
  }

  // L2: Redis
  try {
    const redis = await ensureConnected();
    if (redis) {
      const redisKey = `${REDIS_PREFIX}${key}`;
      const redisVal = (await redis.get(redisKey)) as string | null;
      if (redisVal) {
        const parsed = JSON.parse(redisVal) as CachedToolResult;
        cache.set(key, parsed); // Populate L1
        logger.debug(`[ToolCache] L2 (Redis) hit: ${toolName}`);
        return parsed.result;
      }
    }
  } catch {
    logger.error("[Silent catch]");
  }

  return null;
}

/**
 * Cache a tool result with the appropriate TTL.
 * No-op if the tool is not cacheable.
 */
export async function setCachedToolResult(
  toolName: string,
  args: Record<string, any>,
  result: any,
): Promise<void> {
  if (!isToolCacheable(toolName)) return;

  const key = generateCacheKey(toolName, args);
  const baseTtl = TOOL_TTL_MS[toolName] ?? DEFAULT_TTL_MS;
  const level = getRiskLevel(toolName) ?? "low";
  const multiplier = TTL_MULTIPLIER_BY_LEVEL[level] ?? 1.0;
  const ttlMs = Math.floor(baseTtl * multiplier);

  // Evict oldest entries if cache is full
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }

  const entry: CachedToolResult = { result, timestamp: Date.now(), ttlMs };
  cache.set(key, entry);

  // L2: Redis (fire-and-forget)
  try {
    const redis = await ensureConnected();
    if (redis) {
      const redisKey = `${REDIS_PREFIX}${key}`;
      const ttlSec = Math.floor(ttlMs / 1000);
      await redis.setEx(redisKey, ttlSec, JSON.stringify(entry));
    }
  } catch {
    logger.error("[Silent catch]");
  }
}

/**
 * Clear the entire tool result cache.
 */
export function clearToolResultCache(): void {
  const size = cache.size;
  cache.clear();
  logger.info(`[ToolCache] Cleared ${size} entries`);
}

/**
 * Get cache stats for observability.
 */
export function getToolCacheStats(): {
  size: number;
  entries: Array<{ tool: string; age: number; ttl: number }>;
} {
  const now = Date.now();
  const entries = [...cache.entries()].map(([key, val]) => ({
    tool: key.split(":")[0],
    age: Math.floor((now - val.timestamp) / 1000),
    ttl: Math.floor(val.ttlMs / 1000),
  }));
  return { size: cache.size, entries };
}
