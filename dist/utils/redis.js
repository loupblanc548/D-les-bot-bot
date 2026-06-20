import Redis from 'ioredis';
import { config } from '../config.js';
import logger from './logger.js';
const redis = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
        if (times > 5)
            return null; // Stop retrying after 5 attempts
        return Math.min(times * 200, 2000);
    },
    lazyConnect: true,
});
/**
 * Connecte Redis. Non-bloquant — si Redis est down, le bot continue sans cache.
 */
export async function connectRedis() {
    try {
        await redis.connect();
        logger.info('[Redis] Connected to ' + config.redisUrl);
    }
    catch (err) {
        logger.warn('[Redis] Connection failed — cache disabled: ' + String(err));
    }
}
/**
 * Stocke une valeur en cache avec TTL.
 */
export async function setCache(key, value, ttlInSeconds) {
    try {
        const serialized = JSON.stringify(value);
        await redis.setex(key, ttlInSeconds, serialized);
    }
    catch {
        // Silently ignore — cache is optional
    }
}
/**
 * Récupère une valeur depuis le cache.
 * Retourne null si la clé n'existe pas ou si Redis est down.
 */
export async function getCache(key) {
    try {
        const raw = await redis.get(key);
        if (!raw)
            return null;
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
/**
 * Supprime une clé du cache.
 */
export async function deleteCache(key) {
    try {
        await redis.del(key);
    }
    catch {
        // Silently ignore
    }
}
/**
 * Supprime plusieurs clés du cache (pattern).
 */
export async function deleteCachePattern(pattern) {
    try {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
            await redis.del(...keys);
        }
    }
    catch {
        // Silently ignore
    }
}
/**
 * Incrémente un compteur dans le cache.
 */
export async function incrementCache(key) {
    try {
        return await redis.incr(key);
    }
    catch {
        return 0;
    }
}
/**
 * Décrémente un compteur dans le cache.
 */
export async function decrementCache(key) {
    try {
        return await redis.decr(key);
    }
    catch {
        return 0;
    }
}
/**
 * Vérifie si une clé existe dans le cache.
 */
export async function cacheExists(key) {
    try {
        const result = await redis.exists(key);
        return result === 1;
    }
    catch {
        return false;
    }
}
/**
 * Définit une expiration sur une clé existante.
 */
export async function setCacheExpire(key, ttlInSeconds) {
    try {
        await redis.expire(key, ttlInSeconds);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Récupère le TTL restant d'une clé.
 */
export async function getCacheTTL(key) {
    try {
        return await redis.ttl(key);
    }
    catch {
        return -1;
    }
}
/**
 * Déconnecte proprement Redis.
 */
export async function disconnectRedis() {
    try {
        await redis.quit();
        logger.info('[Redis] Disconnected');
    }
    catch {
        // Ignore
    }
}
export default redis;
//# sourceMappingURL=redis.js.map