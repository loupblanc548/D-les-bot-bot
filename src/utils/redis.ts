import { Redis } from "ioredis";
import NodeCache from "node-cache";
import { config } from "../config.js";
import logger from "./logger.js";

const hasRedisUrl = Boolean(config.redisUrl);

// Cache local de fallback si Redis est down ou non configuré
const localCache = new NodeCache({
  stdTTL: 300,
  checkperiod: 120,
});

let redisConnected = false;
let redis: Redis | null = null;

if (hasRedisUrl) {
  redis = new Redis(config.redisUrl!, {
    maxRetriesPerRequest: 0,
    retryStrategy: null,
    lazyConnect: true,
  });

  redis.on("error", (err: Error) => {
    if (redisConnected) {
      logger.warn(`[Redis] Error: ${err.message} — fallback vers cache local`);
      redisConnected = false;
    }
    // Always suppress — prevents ECONNREFUSED console spam
  });

  redis.on("reconnecting", (delay: number) => {
    logger.info(`[Redis] Reconnexion dans ${delay}ms...`);
  });

  redis.on("connect", () => {
    logger.info("[Redis] Connexion établie");
  });

  redis.on("ready", () => {
    if (!redisConnected) {
      logger.info("[Redis] Prêt — cache Redis actif ✅");
      redisConnected = true;
    }
  });

  redis.on("end", () => {
    if (redisConnected) {
      logger.warn("[Redis] Connexion fermée — fallback vers cache local");
      redisConnected = false;
    }
  });
} else {
  logger.info("[Redis] REDIS_URL non défini — cache local uniquement");
}

/**
 * Connecte Redis. Non-bloquant — si Redis est down, le bot continue sans cache.
 */
export async function connectRedis(): Promise<void> {
  if (!redis) return;
  try {
    await redis.connect();
    redisConnected = true;
    logger.info("[Redis] Connected");
  } catch (err) {
    redisConnected = false;
    logger.warn("[Redis] Connection failed — cache disabled: " + String(err));
  }
}

/**
 * Stocke une valeur en cache avec TTL.
 * Propage les erreurs Redis aux appelants (qui peuvent alors décider
 * d'un fallback local). Ne pas avaler l'erreur ici : cela masquait le bug
 * où `cachedSet` continuait d'écrire dans le fallback mémoire même quand
 * Redis avait accepté l'écriture (double-storage).
 */
export async function setCache(key: string, value: unknown, ttlInSeconds: number): Promise<void> {
  const serialized = JSON.stringify(value);
  try {
    if (redis && redisConnected) {
      await redis.setex(key, ttlInSeconds, serialized);
    } else {
      localCache.set(key, serialized, ttlInSeconds);
    }
  } catch {
    localCache.set(key, serialized, ttlInSeconds);
  }
}

/**
 * Récupère une valeur depuis le cache.
 * Retourne null si la clé n'existe pas ou si Redis est down.
 */
export async function getCache<T = unknown>(key: string): Promise<T | null> {
  try {
    if (redis && redisConnected) {
      const raw = await redis.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    }
  } catch {
    // Redis error → fallback to local
  }
  const local = localCache.get<string>(key);
  if (local) return JSON.parse(local) as T;
  return null;
}

/**
 * Supprime une clé du cache.
 */
export async function deleteCache(key: string): Promise<void> {
  try {
    if (redis) await redis.del(key);
  } catch {
    // Silently ignore
  }
  localCache.del(key);
}

/**
 * Supprime plusieurs clés du cache (pattern).
 */
export async function deleteCachePattern(pattern: string): Promise<void> {
  try {
    if (redis) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    }
  } catch {
    // Silently ignore
  }
}

/**
 * Incrémente un compteur dans le cache.
 */
export async function incrementCache(key: string): Promise<number> {
  try {
    if (redis) return await redis.incr(key);
  } catch {
    // fallback
  }
  return 0;
}

/**
 * Décrémente un compteur dans le cache.
 */
export async function decrementCache(key: string): Promise<number> {
  try {
    if (redis) return await redis.decr(key);
  } catch {
    // fallback
  }
  return 0;
}

/**
 * Vérifie si une clé existe dans le cache.
 */
export async function cacheExists(key: string): Promise<boolean> {
  try {
    if (redis) {
      const result = await redis.exists(key);
      return result === 1;
    }
  } catch {
    // fallback
  }
  return localCache.has(key);
}

/**
 * Définit une expiration sur une clé existante.
 */
export async function setCacheExpire(key: string, ttlInSeconds: number): Promise<boolean> {
  try {
    if (redis) {
      await redis.expire(key, ttlInSeconds);
      return true;
    }
  } catch {
    // fallback
  }
  return false;
}

/**
 * Récupère le TTL restant d'une clé.
 */
export async function getCacheTTL(key: string): Promise<number> {
  try {
    if (redis) return await redis.ttl(key);
  } catch {
    // fallback
  }
  return -1;
}

/**
 * Déconnecte proprement Redis.
 */
export async function disconnectRedis(): Promise<void> {
  try {
    if (redis) await redis.quit();
    logger.info("[Redis] Disconnected");
  } catch {
    // Ignore
  }
}

export default redis;
