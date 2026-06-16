import Redis from 'ioredis';
import { config } from '../config';
import logger from './logger';

const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    if (times > 5) return null; // Stop retrying after 5 attempts
    return Math.min(times * 200, 2000);
  },
  lazyConnect: true,
});

/**
 * Connecte Redis. Non-bloquant — si Redis est down, le bot continue sans cache.
 */
export async function connectRedis(): Promise<void> {
  try {
    await redis.connect();
    logger.info('[Redis] Connected to ' + config.redisUrl);
  } catch (err) {
    logger.warn('[Redis] Connection failed — cache disabled: ' + String(err));
  }
}

/**
 * Stocke une valeur en cache avec TTL.
 */
export async function setCache(key: string, value: unknown, ttlInSeconds: number): Promise<void> {
  try {
    const serialized = JSON.stringify(value);
    await redis.setex(key, ttlInSeconds, serialized);
  } catch {
    // Silently ignore — cache is optional
  }
}

/**
 * Récupère une valeur depuis le cache.
 * Retourne null si la clé n'existe pas ou si Redis est down.
 */
export async function getCache<T = unknown>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
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
    logger.info('[Redis] Disconnected');
  } catch {
    // Ignore
  }
}

export default redis;
