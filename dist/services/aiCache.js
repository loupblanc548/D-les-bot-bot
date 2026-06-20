import logger from "../utils/logger.js";
import crypto from "crypto";
// Cache en mémoire (pourrait être remplacé par Redis pour la persistance distribuée)
const responseCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 heure de TTL
const MAX_CACHE_SIZE = 1000; // Maximum 1000 réponses en cache
/**
 * Génère une clé de cache basée sur le message et le contexte
 */
function generateCacheKey(message, context) {
    const data = context ? `${message}:${context}` : message;
    return crypto.createHash("md5").update(data).digest("hex");
}
/**
 * Récupère une réponse mise en cache
 */
export function getCachedResponse(message, context) {
    const key = generateCacheKey(message, context);
    const cached = responseCache.get(key);
    if (!cached) {
        return null;
    }
    // Vérifier si le cache a expiré
    if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
        responseCache.delete(key);
        logger.debug(`[AICache] Cache expiré pour: ${message.slice(0, 30)}...`);
        return null;
    }
    // Incrémenter le compteur de hits
    cached.hitCount++;
    responseCache.set(key, cached);
    logger.debug(`[AICache] Cache hit pour: ${message.slice(0, 30)}... (hits: ${cached.hitCount})`);
    return cached.response;
}
/**
 * Met en cache une réponse IA
 */
export function cacheResponse(message, response, context) {
    const key = generateCacheKey(message, context);
    // Limiter la taille du cache
    if (responseCache.size >= MAX_CACHE_SIZE) {
        // Supprimer l'entrée la moins utilisée (LRU simple)
        let oldestKey = null;
        let oldestTimestamp = Infinity;
        for (const [cacheKey, cached] of responseCache.entries()) {
            if (cached.timestamp < oldestTimestamp) {
                oldestTimestamp = cached.timestamp;
                oldestKey = cacheKey;
            }
        }
        if (oldestKey) {
            responseCache.delete(oldestKey);
            logger.debug(`[AICache] Cache LRU: supprimé ${oldestKey}`);
        }
    }
    responseCache.set(key, {
        response,
        timestamp: Date.now(),
        hitCount: 0
    });
    logger.debug(`[AICache] Réponse mise en cache: ${message.slice(0, 30)}...`);
}
/**
 * Efface le cache pour un message spécifique
 */
export function clearCacheEntry(message, context) {
    const key = generateCacheKey(message, context);
    responseCache.delete(key);
    logger.debug(`[AICache] Cache effacé pour: ${message.slice(0, 30)}...`);
}
/**
 * Efface tout le cache
 */
export function clearAllCache() {
    const size = responseCache.size;
    responseCache.clear();
    logger.info(`[AICache] Tout le cache effacé (${size} entrées)`);
}
/**
 * Récupère les statistiques du cache
 */
export function getCacheStats() {
    let totalHits = 0;
    let oldestTimestamp = null;
    let newestTimestamp = null;
    for (const cached of responseCache.values()) {
        totalHits += cached.hitCount;
        if (oldestTimestamp === null || cached.timestamp < oldestTimestamp) {
            oldestTimestamp = cached.timestamp;
        }
        if (newestTimestamp === null || cached.timestamp > newestTimestamp) {
            newestTimestamp = cached.timestamp;
        }
    }
    // Calculer le taux de hits (approximatif)
    const hitRate = responseCache.size > 0 ? totalHits / responseCache.size : 0;
    return {
        size: responseCache.size,
        maxSize: MAX_CACHE_SIZE,
        hitRate,
        oldestEntry: oldestTimestamp,
        newestEntry: newestTimestamp
    };
}
/**
 * Nettoie les entrées expirées du cache
 */
export function cleanupExpiredCache() {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, cached] of responseCache.entries()) {
        if (now - cached.timestamp > CACHE_TTL_MS) {
            responseCache.delete(key);
            cleaned++;
        }
    }
    if (cleaned > 0) {
        logger.debug(`[AICache] Nettoyage de ${cleaned} entrée(s) expirée(s)`);
    }
}
// Nettoyage automatique toutes les 30 minutes
setInterval(cleanupExpiredCache, 30 * 60 * 1000);
//# sourceMappingURL=aiCache.js.map