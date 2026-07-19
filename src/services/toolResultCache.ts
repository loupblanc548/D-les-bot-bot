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

interface CachedToolResult {
  result: unknown;
  timestamp: number;
  ttlMs: number;
}

const cache = new Map<string, CachedToolResult>();

// ─── TTL per tool (ms) ───────────────────────────────────────────────────────
const TOOL_TTL_MS: Record<string, number> = {
  // Weather: 10 minutes (conditions change slowly)
  getWeather: 10 * 60 * 1000,
  // Crypto: 30 seconds (volatile but not second-by-second)
  getCryptoPrice: 30 * 1000,
  // Web search: 5 minutes (results stable short-term)
  searchGoogle: 5 * 60 * 1000,
  // Translation: 1 hour (same text = same translation)
  translateText: 60 * 60 * 1000,
  translateTextDeepL: 60 * 60 * 1000,
  auto_translate: 60 * 60 * 1000,
  // Country info: 24 hours (rarely changes)
  get_country_info: 24 * 60 * 60 * 1000,
  // Urban dictionary: 1 hour
  get_urban_dict: 60 * 60 * 1000,
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
};

const MAX_CACHE_SIZE = 500;
const DEFAULT_TTL_MS = 5 * 60 * 1000;

function generateCacheKey(toolName: string, args: Record<string, unknown>): string {
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
export function getCachedToolResult(
  toolName: string,
  args: Record<string, unknown>,
): unknown | null {
  if (!isToolCacheable(toolName)) return null;

  const key = generateCacheKey(toolName, args);
  const entry = cache.get(key);

  if (!entry) return null;

  const now = Date.now();
  if (now - entry.timestamp > entry.ttlMs) {
    cache.delete(key);
    return null;
  }

  logger.debug(
    `[ToolCache] Hit: ${toolName} (age: ${((now - entry.timestamp) / 1000).toFixed(0)}s)`,
  );
  return entry.result;
}

/**
 * Cache a tool result with the appropriate TTL.
 * No-op if the tool is not cacheable.
 */
export function setCachedToolResult(
  toolName: string,
  args: Record<string, unknown>,
  result: unknown,
): void {
  if (!isToolCacheable(toolName)) return;

  const key = generateCacheKey(toolName, args);
  const ttlMs = TOOL_TTL_MS[toolName] ?? DEFAULT_TTL_MS;

  // Evict oldest entries if cache is full
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }

  cache.set(key, { result, timestamp: Date.now(), ttlMs });
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
