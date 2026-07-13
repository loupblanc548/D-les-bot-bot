/**
 * configCache.ts — MODULE 2: High-Capacity Prisma Cache Layer
 *
 * In-memory cache for guild configuration to minimize Neon DB queries.
 * TTL: 15 minutes (generous, since host has 6GB RAM).
 * Cache invalidation is immediate on config mutations.
 *
 * All queries use indexed fields (guildId, userId) for optimal performance.
 */

import prisma from "../prisma.js";
import logger from "../utils/logger.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CachedConfig {
  guildId: string;
  logChannelId: string | null;
  freeGamesChannelId: string | null;
  monitoringEnabled: boolean;
  monitoringIntervalMs: number;
  maxRetroPosts: number;
  modelSelect: string | null;
  funMode: boolean;
  cooldownConfig: number;
  alertChannelId: string | null;
  autoModEnabled: boolean;
  aiChannel: string | null;
  raw: unknown; // Full Prisma record for edge-case access
  cachedAt: number;
  expiresAt: number;
}

// ─── Configuration ───────────────────────────────────────────────────────────

const TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_CACHE_ENTRIES = 500; // Max guilds to cache (safety valve)
const CACHE_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Cleanup every 5 min

// ─── Cache Storage ───────────────────────────────────────────────────────────

const cache = new Map<string, CachedConfig>();
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

// ─── Cache Stats ─────────────────────────────────────────────────────────────

let cacheHits = 0;
let cacheMisses = 0;

export function getCacheStats(): {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  hitRate: number;
} {
  const total = cacheHits + cacheMisses;
  return {
    size: cache.size,
    maxSize: MAX_CACHE_ENTRIES,
    hits: cacheHits,
    misses: cacheMisses,
    hitRate: total > 0 ? cacheHits / total : 0,
  };
}

// ─── Core API ────────────────────────────────────────────────────────────────

/**
 * Get guild config from cache, falling back to Prisma on miss.
 * Always checks cache first — DB is only hit on cold start or expired entry.
 */
export async function getGuildConfigCached(guildId: string): Promise<CachedConfig | null> {
  // Check cache
  const cached = cache.get(guildId);
  if (cached) {
    if (Date.now() < cached.expiresAt) {
      cacheHits++;
      return cached;
    }
    // Expired — evict
    cache.delete(guildId);
  }

  // Cache miss — hit the database
  cacheMisses++;
  try {
    const dbConfig = await prisma.guildConfig.findUnique({
      where: { guildId },
    });

    if (!dbConfig) {
      // Create default config on first access
      const created = await prisma.guildConfig.create({
        data: { guildId },
      });
      return cacheConfig(guildId, created);
    }

    return cacheConfig(guildId, dbConfig);
  } catch (err) {
    logger.error(
      `[ConfigCache] DB error for guild ${guildId}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * Invalidate cache for a specific guild. Called when config is mutated.
 */
export function invalidateGuild(guildId: string): void {
  if (cache.delete(guildId)) {
    logger.debug(`[ConfigCache] Invalidated guild ${guildId}`);
  }
}

/**
 * Invalidate all cached configs (full flush).
 */
export function invalidateAll(): void {
  const count = cache.size;
  cache.clear();
  logger.info(`[ConfigCache] Full cache flush (${count} entries)`);
}

/**
 * Update guild config in DB and invalidate cache.
 */
export async function updateGuildConfigCached(
  guildId: string,
  data: Record<string, unknown>,
): Promise<CachedConfig | null> {
  try {
    const updated = await prisma.guildConfig.upsert({
      where: { guildId },
      create: { guildId, ...data } as never,
      update: data as never,
    });

    // Invalidate stale cache entry
    invalidateGuild(guildId);

    // Re-cache the fresh data
    return cacheConfig(guildId, updated);
  } catch (err) {
    logger.error(
      `[ConfigCache] Update error for guild ${guildId}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

// ─── Convenience getters (cache-first) ───────────────────────────────────────

export async function getLogChannelIdCached(guildId: string): Promise<string | null> {
  const config = await getGuildConfigCached(guildId);
  return config?.logChannelId ?? process.env.LOG_CHANNEL_ID ?? null;
}

export async function getAlertChannelIdCached(guildId: string): Promise<string | null> {
  const config = await getGuildConfigCached(guildId);
  return config?.alertChannelId ?? null;
}

export async function isMonitoringEnabledCached(guildId: string): Promise<boolean> {
  const config = await getGuildConfigCached(guildId);
  return config?.monitoringEnabled ?? false;
}

export async function getModelSelectCached(guildId: string): Promise<string | null> {
  const config = await getGuildConfigCached(guildId);
  return config?.modelSelect ?? null;
}

export async function isFunModeCached(guildId: string): Promise<boolean> {
  const config = await getGuildConfigCached(guildId);
  return config?.funMode ?? false;
}

export async function getCooldownCached(guildId: string): Promise<number> {
  const config = await getGuildConfigCached(guildId);
  return config?.cooldownConfig ?? 3000;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function cacheConfig(guildId: string, dbRecord: unknown): CachedConfig {
  const record = dbRecord as Record<string, unknown>;

  // Enforce max cache size — evict oldest entry
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }

  const now = Date.now();
  const cached: CachedConfig = {
    guildId,
    logChannelId: (record.logChannelId as string) ?? null,
    freeGamesChannelId: (record.freeGamesChannelId as string) ?? null,
    monitoringEnabled: (record.monitoringEnabled as boolean) ?? false,
    monitoringIntervalMs: (record.monitoringIntervalMs as number) ?? 30000,
    maxRetroPosts: (record.maxRetroPosts as number) ?? 5,
    modelSelect: (record.modelSelect as string) ?? null,
    funMode: (record.funMode as boolean) ?? false,
    cooldownConfig: (record.cooldownConfig as number) ?? 3000,
    alertChannelId: (record.alertChannelId as string) ?? null,
    autoModEnabled: (record.autoModEnabled as boolean) ?? false,
    aiChannel: (record.aiChannel as string) ?? null,
    raw: dbRecord,
    cachedAt: now,
    expiresAt: now + TTL_MS,
  };

  cache.set(guildId, cached);
  return cached;
}

/**
 * Periodic cleanup of expired entries.
 */
function cleanupExpired(): void {
  const now = Date.now();
  let evicted = 0;
  for (const [key, entry] of cache) {
    if (now >= entry.expiresAt) {
      cache.delete(key);
      evicted++;
    }
  }
  if (evicted > 0) {
    logger.debug(
      `[ConfigCache] Cleanup: evicted ${evicted} expired entries (${cache.size} remaining)`,
    );
  }
}

/**
 * Start the background cleanup interval.
 */
export function startConfigCacheCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(cleanupExpired, CACHE_CLEANUP_INTERVAL_MS);
  cleanupTimer.unref?.(); // Don't keep process alive for cleanup
  logger.info(`[ConfigCache] Started — TTL: ${TTL_MS / 1000}s, Max entries: ${MAX_CACHE_ENTRIES}`);
}

/**
 * Stop the cleanup interval and clear cache (called on shutdown).
 */
export function stopConfigCache(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
  cache.clear();
  logger.info("[ConfigCache] Stopped and cleared");
}
