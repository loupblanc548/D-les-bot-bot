/**
 * aiResponseCache.ts — Two-tier semantic cache for AI responses
 *
 * L1: In-memory (fast, 5 min TTL, 200 entries)
 * L2: Redis (persistent across restarts, 1h TTL, shared)
 * Hits return cached response instantly, saving API calls.
 */

import logger from "./logger.js";
import { aiCacheHits, aiCacheMisses } from "../services/prometheusExporter.js";
import { ensureConnected } from "./redisClient.js";

interface CacheEntry {
  response: string;
  timestamp: number;
  userId: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes (L1)
const REDIS_TTL_S = 60 * 60; // 1 hour (L2)
const MAX_ENTRIES = 200;
const SIMILARITY_THRESHOLD = 0.92;
const REDIS_PREFIX = "ai:cache:";

const cache = new Map<string, CacheEntry>();

function normalize(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\sàâäéèêëïîôöùûüçñ]/gi, "")
    .slice(0, 500);
}

function cosineSimilarity(a: string, b: string): number {
  const wordsA = a.split(" ").filter(Boolean);
  const wordsB = b.split(" ").filter(Boolean);
  const setA = new Map<string, number>();
  for (const w of wordsA) setA.set(w, (setA.get(w) || 0) + 1);
  const setB = new Map<string, number>();
  for (const w of wordsB) setB.set(w, (setB.get(w) || 0) + 1);

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (const [word, count] of setA) {
    magA += count * count;
    if (setB.has(word)) dot += count * (setB.get(word) || 0);
  }
  for (const [, count] of setB) magB += count * count;

  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function cleanupExpired(): void {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      cache.delete(key);
    }
  }
  if (cache.size > MAX_ENTRIES) {
    const sorted = [...cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = sorted.slice(0, cache.size - MAX_ENTRIES);
    for (const [key] of toRemove) cache.delete(key);
  }
}

export async function getCachedResponse(
  message: string,
  userId: string,
  channelType: "guild" | "dm" = "guild",
): Promise<string | null> {
  cleanupExpired();
  const normalized = normalize(message);

  // L1: In-memory cache
  for (const [, entry] of cache) {
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) continue;
    if (entry.userId !== userId) continue;

    const cachedNorm = normalize(entry.response.slice(0, 500));
    const sim = cosineSimilarity(normalized, cachedNorm);
    if (sim >= SIMILARITY_THRESHOLD) {
      logger.info(`[AICache] L1 hit (similarity: ${sim.toFixed(2)})`);
      aiCacheHits.labels(channelType).inc();
      return entry.response;
    }
  }

  // L2: Redis cache (persistent across restarts)
  try {
    const redis = await ensureConnected();
    if (redis) {
      const redisKey = `${REDIS_PREFIX}${userId}:${normalized.slice(0, 100)}`;
      const redisVal = (await redis.get(redisKey)) as string | null;
      if (redisVal) {
        const entry = JSON.parse(redisVal) as CacheEntry;
        // Populate L1 for future fast access
        cache.set(`${userId}:${normalized.slice(0, 100)}`, entry);
        logger.info(`[AICache] L2 (Redis) hit`);
        aiCacheHits.labels(channelType).inc();
        return entry.response;
      }
    }
  } catch { logger.error("[Silent catch]"); }

  aiCacheMisses.labels(channelType).inc();
  return null;
}

export async function setCachedResponse(message: string, response: string, userId: string): Promise<void> {
  const normalized = normalize(message);
  const entry: CacheEntry = { response, timestamp: Date.now(), userId };
  const key = `${userId}:${normalized.slice(0, 100)}`;

  // L1: In-memory
  cache.set(key, entry);
  cleanupExpired();

  // L2: Redis (fire-and-forget, non-blocking)
  try {
    const redis = await ensureConnected();
    if (redis) {
      const redisKey = `${REDIS_PREFIX}${key}`;
      await redis.setEx(redisKey, REDIS_TTL_S, JSON.stringify(entry));
    }
  } catch { logger.error("[Silent catch]"); }
}

export function clearCache(): void {
  cache.clear();
  logger.info("[AICache] L1 cache cleared");
}

export function getCacheSize(): number {
  return cache.size;
}
