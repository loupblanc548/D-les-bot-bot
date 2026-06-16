"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectRedis = connectRedis;
exports.setCache = setCache;
exports.getCache = getCache;
exports.deleteCache = deleteCache;
exports.deleteCachePattern = deleteCachePattern;
exports.incrementCache = incrementCache;
exports.decrementCache = decrementCache;
exports.cacheExists = cacheExists;
exports.setCacheExpire = setCacheExpire;
exports.getCacheTTL = getCacheTTL;
exports.disconnectRedis = disconnectRedis;
const ioredis_1 = __importDefault(require("ioredis"));
const config_1 = require("../config");
const logger_1 = __importDefault(require("./logger"));
const redis = new ioredis_1.default(config_1.config.redisUrl, {
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
async function connectRedis() {
    try {
        await redis.connect();
        logger_1.default.info('[Redis] Connected to ' + config_1.config.redisUrl);
    }
    catch (err) {
        logger_1.default.warn('[Redis] Connection failed — cache disabled: ' + String(err));
    }
}
/**
 * Stocke une valeur en cache avec TTL.
 */
async function setCache(key, value, ttlInSeconds) {
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
async function getCache(key) {
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
async function deleteCache(key) {
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
async function deleteCachePattern(pattern) {
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
async function incrementCache(key) {
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
async function decrementCache(key) {
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
async function cacheExists(key) {
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
async function setCacheExpire(key, ttlInSeconds) {
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
async function getCacheTTL(key) {
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
async function disconnectRedis() {
    try {
        await redis.quit();
        logger_1.default.info('[Redis] Disconnected');
    }
    catch {
        // Ignore
    }
}
exports.default = redis;
//# sourceMappingURL=redis.js.map