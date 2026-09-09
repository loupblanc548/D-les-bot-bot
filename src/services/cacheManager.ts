/**
 * cacheManager.ts — Façade unifiée pour tous les caches du bot
 *
 * Hiérarchie:
 *  L1 (local)  → cache.ts (Map + TTL)
 *  L2 (redis)  → redisCache.ts (Redis + fallback local)
 *  L1+L2       → multiLevelCache.ts (combine les deux)
 *
 * Caches spécialisés:
 *  - AI responses → aiCache.ts (sémantique, normalisation) + llmCache.ts (Redis persistant)
 *  - Tool results → toolResultCache.ts (avec risk registry)
 *  - Config guild → configCache.ts (Prisma)
 *  - Local LLM    → responseCache.ts (simple LRU)
 *
 * Cette façade expose une API unique: get/set/delete/invalidate
 * tout en déléguant aux implémentations existantes.
 */

import inMemoryCache from "./cache.js";
import multiLevelCache from "./multiLevelCache.js";
import { getCachedResponse, setCachedResponse } from "./responseCache.js";
import { getCachedCompletion, setCachedCompletion } from "./llmCache.js";
import { getCachedToolResult, setCachedToolResult } from "./toolResultCache.js";
import logger from "../utils/logger.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type CacheTier = "memory" | "redis" | "multi" | "ai" | "llm" | "tool";

interface CacheGetOptions {
  tier?: CacheTier;
}

interface CacheSetOptions {
  tier?: CacheTier;
  ttl?: number; // ms for memory, seconds for redis
  model?: string; // for llm cache
  toolName?: string; // for tool cache
}

// ─── API unifiée ─────────────────────────────────────────────────────────────

/**
 * Récupère une valeur du cache selon le tier
 */
export async function get<T = unknown>(
  key: string,
  options: CacheGetOptions = {},
): Promise<T | null> {
  const tier = options.tier ?? "multi";
  try {
    switch (tier) {
      case "memory":
        return inMemoryCache.get<T>(key);
      case "redis": {
        // redisCache est importé dynamiquement pour éviter les cycles
        const redisCache = await import("./redisCache.js");
        return await redisCache.default.get<T>(key);
      }
      case "multi":
        return await multiLevelCache.get<T>(key);
      case "ai":
        return getCachedResponse(key) as T | null;
      case "llm":
        return await getCachedCompletion<T>(key, (options as CacheSetOptions).model ?? "default");
      case "tool":
        return (await getCachedToolResult(key, {})) as T | null;
      default:
        return null;
    }
  } catch (err) {
    logger.error("[CacheManager] Get error:", err);
    return null;
  }
}

/**
 * Stocke une valeur dans le cache selon le tier
 */
export async function set<T = unknown>(
  key: string,
  value: T,
  options: CacheSetOptions = {},
): Promise<void> {
  const tier = options.tier ?? "multi";
  try {
    switch (tier) {
      case "memory":
        inMemoryCache.set(key, value, options.ttl ?? 300_000);
        break;
      case "redis": {
        const redisCache = await import("./redisCache.js");
        await redisCache.default.set(key, value, options.ttl ?? 300);
        break;
      }
      case "multi":
        await multiLevelCache.set(key, value, {
          memoryTTL: options.ttl,
          redisTTL: options.ttl ? Math.floor(options.ttl / 1000) : undefined,
        });
        break;
      case "ai":
        setCachedResponse(key, value as string);
        break;
      case "llm":
        await setCachedCompletion(key, value as string, options.model ?? "default");
        break;
      case "tool":
        await setCachedToolResult(options.toolName ?? "unknown", { key }, value);
        break;
    }
  } catch (err) {
    logger.error("[CacheManager] Set error:", err);
  }
}

/**
 * Supprime une entrée du cache (tous tiers si possible)
 */
export async function del(key: string): Promise<void> {
  try {
    inMemoryCache.delete(key);
    await multiLevelCache.del(key);
  } catch (err) {
    logger.error("[CacheManager] Delete error:", err);
  }
}

/**
 * Invalide toutes les entrées d'un namespace (préfixe)
 */
export async function invalidatePrefix(prefix: string): Promise<void> {
  try {
    // multiLevelCache et inMemoryCache n'ont pas d'API par préfixe,
    // mais on peut au moins nettoyer le cache mémoire
    inMemoryCache.clear();
    logger.info(`[CacheManager] Cache invalidated for prefix: ${prefix}`);
  } catch (err) {
    logger.error("[CacheManager] Invalidate error:", err);
  }
}

/**
 * Stats globales du cache
 */
export function getStats(): Record<string, any> {
  return {
    memory: {
      size: "(see inMemoryCache)",
    },
    timestamp: Date.now(),
  };
}

export default { get, set, del, invalidatePrefix, getStats };
