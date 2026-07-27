/**
 * responseCache.ts — LRU cache for local LLM responses
 *
 * If two users ask similar questions within a short window,
 * qwen2.5 returns the cached answer instead of recomputing.
 */

import logger from "../utils/logger.js";

const CACHE_MAX = 100;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  response: string;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

function normalizeKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

export function getCachedResponse(text: string): string | null {
  const key = normalizeKey(text);
  if (!key || key.length < 10) return null; // Too short to cache

  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }

  logger.debug(`[ResponseCache] Cache hit: "${key.slice(0, 40)}..."`);
  return entry.response;
}

export function setCachedResponse(text: string, response: string): void {
  const key = normalizeKey(text);
  if (!key || key.length < 10) return;
  if (response.length < 5) return;

  // LRU eviction: remove oldest if at capacity
  if (cache.size >= CACHE_MAX) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }

  cache.set(key, { response, timestamp: Date.now() });
}

export function clearResponseCache(): void {
  cache.clear();
}

export function getCacheSize(): number {
  return cache.size;
}
