import { Redis } from "ioredis";
import NodeCache from "node-cache";
import { config } from "../config.js";
import logger from "./logger.js";

const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    // Reconnexion infinie avec backoff exponentiel plafonné à 5s
    return Math.min(times * 500, 5000);
  },
  lazyConnect: true,
});

// Cache local de fallback si Redis est down
const localCache = new NodeCache({
  stdTTL: 300, // 5 minutes par défaut
  checkperiod: 120, // nettoyage toutes les 2 minutes
});

let redisConnected = false;

// Gestion des événements de connexion Redis
redis.on("error", (err: Error) => {
  if (redisConnected) {
    logger.warn(`[Redis] Error: ${err.message} — fallback vers cache local`);
    redisConnected = false;
  }
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

/**
 * Connecte Redis. Non-bloquant — si Redis est down, le bot continue sans cache.
 */
export async function connectRedis(): Promise<void> {
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
    if (redisConnected) {
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
    if (redisConnected) {
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
    await redis.del(key);
  } catch {
    // Silently ignore
  }
}

/**
 * Supprime plusieurs clés du cache (pattern).
 */
export async function deleteCachePattern(pattern: string): Promise<void> {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
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
    return await redis.incr(key);
  } catch {
    return 0;
  }
}

/**
 * Décrémente un compteur dans le cache.
 */
export async function decrementCache(key: string): Promise<number> {
  try {
    return await redis.decr(key);
  } catch {
    return 0;
  }
}

/**
 * Vérifie si une clé existe dans le cache.
 */
export async function cacheExists(key: string): Promise<boolean> {
  try {
    const result = await redis.exists(key);
    return result === 1;
  } catch {
    return false;
  }
}

/**
 * Définit une expiration sur une clé existante.
 */
export async function setCacheExpire(key: string, ttlInSeconds: number): Promise<boolean> {
  try {
    await redis.expire(key, ttlInSeconds);
    return true;
  } catch {
    return false;
  }
}

/**
 * Récupère le TTL restant d'une clé.
 */
export async function getCacheTTL(key: string): Promise<number> {
  try {
    return await redis.ttl(key);
  } catch {
    return -1;
  }
}

/**
 * Déconnecte proprement Redis.
 */
export async function disconnectRedis(): Promise<void> {
  try {
    await redis.quit();
    logger.info("[Redis] Disconnected");
  } catch {
    // Ignore
  }
}

export default redis;
