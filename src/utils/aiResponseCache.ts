/**
 * aiResponseCache.ts — Lightweight semantic cache for AI responses
 *
 * Caches recent AI responses keyed by normalized user message.
 * Hits return cached response instantly, saving API calls.
 * TTL-based expiry + max entries to bound memory.
 */

import logger from "./logger.js";
import { aiCacheHits, aiCacheMisses } from "../services/prometheusExporter.js";

interface CacheEntry {
  response: string;
  timestamp: number;
  userId: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ENTRIES = 200;
const SIMILARITY_THRESHOLD = 0.92;

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

export function getCachedResponse(
  message: string,
  userId: string,
  channelType: "guild" | "dm" = "guild",
): string | null {
  cleanupExpired();
  const normalized = normalize(message);

  for (const [, entry] of cache) {
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) continue;
    if (entry.userId !== userId) continue;

    const cachedNorm = normalize(entry.response.slice(0, 500));
    const sim = cosineSimilarity(normalized, cachedNorm);
    if (sim >= SIMILARITY_THRESHOLD) {
      logger.info(`[AICache] Cache hit (similarity: ${sim.toFixed(2)})`);
      aiCacheHits.labels(channelType).inc();
      return entry.response;
    }
  }

  aiCacheMisses.labels(channelType).inc();
  return null;
}

export function setCachedResponse(message: string, response: string, userId: string): void {
  const normalized = normalize(message);
  cache.set(`${userId}:${normalized.slice(0, 100)}`, {
    response,
    timestamp: Date.now(),
    userId,
  });
  cleanupExpired();
}

export function clearCache(): void {
  cache.clear();
  logger.info("[AICache] Cache cleared");
}

export function getCacheSize(): number {
  return cache.size;
}
