"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkRateLimit = checkRateLimit;
exports.resetRateLimit = resetRateLimit;
exports.resetAllRateLimitsForUser = resetAllRateLimitsForUser;
exports.getRateLimitStats = getRateLimitStats;
exports.cleanupExpiredRateLimits = cleanupExpiredRateLimits;
exports.configureRateLimit = configureRateLimit;
const logger_1 = __importDefault(require("../utils/logger"));
// Configurations par défaut pour différents types de requêtes
const DEFAULT_CONFIGS = {
    ai_chat: { maxRequests: 10, windowMs: 60 * 1000, cooldownMs: 5000 }, // 10 requêtes/min, 5s cooldown
    translate: { maxRequests: 20, windowMs: 60 * 1000, cooldownMs: 1000 }, // 20 traductions/min, 1s cooldown
    general: { maxRequests: 30, windowMs: 60 * 1000, cooldownMs: 500 }, // 30 requêtes/min, 0.5s cooldown
};
// Stockage en mémoire (pourrait être remplacé par Redis pour la persistance distribuée)
const rateLimits = new Map();
/**
 * Génère une clé unique pour le rate limiting
 */
function getRateLimitKey(userId, type, guildId) {
    return guildId ? `${guildId}:${userId}:${type}` : `dm:${userId}:${type}`;
}
/**
 * Vérifie si un utilisateur est limité
 * @param userId - ID de l'utilisateur
 * @param type - Type de requête (ai_chat, translate, general)
 * @param guildId - ID du serveur (optionnel)
 * @returns { allowed: boolean, remaining: number, resetTime: number }
 */
function checkRateLimit(userId, type = "general", guildId) {
    const config = DEFAULT_CONFIGS[type] || DEFAULT_CONFIGS.general;
    const key = getRateLimitKey(userId, type, guildId);
    const now = Date.now();
    let entry = rateLimits.get(key);
    // Si aucune entrée ou fenêtre expirée, créer une nouvelle
    if (!entry || now - entry.windowStart > config.windowMs) {
        entry = {
            count: 0,
            windowStart: now,
            lastRequest: 0
        };
        rateLimits.set(key, entry);
    }
    // Vérifier le cooldown entre requêtes
    if (entry.lastRequest > 0 && now - entry.lastRequest < config.cooldownMs) {
        const cooldownRemaining = config.cooldownMs - (now - entry.lastRequest);
        logger_1.default.debug(`[RateLimiter] Cooldown actif pour ${userId} (${type}): ${cooldownRemaining}ms restants`);
        return {
            allowed: false,
            remaining: 0,
            resetTime: entry.lastRequest + config.cooldownMs
        };
    }
    // Vérifier si la limite est atteinte
    if (entry.count >= config.maxRequests) {
        const resetTime = entry.windowStart + config.windowMs;
        logger_1.default.debug(`[RateLimiter] Limite atteinte pour ${userId} (${type}): ${entry.count}/${config.maxRequests}`);
        return {
            allowed: false,
            remaining: 0,
            resetTime
        };
    }
    // Incrémenter le compteur
    entry.count++;
    entry.lastRequest = now;
    rateLimits.set(key, entry);
    const remaining = config.maxRequests - entry.count;
    logger_1.default.debug(`[RateLimiter] Requête autorisée pour ${userId} (${type}): ${remaining} restantes`);
    return {
        allowed: true,
        remaining,
        resetTime: entry.windowStart + config.windowMs
    };
}
/**
 * Réinitialise le rate limit pour un utilisateur
 */
function resetRateLimit(userId, type = "general", guildId) {
    const key = getRateLimitKey(userId, type, guildId);
    rateLimits.delete(key);
    logger_1.default.debug(`[RateLimiter] Rate limit réinitialisé pour ${userId} (${type})`);
}
/**
 * Réinitialise tous les rate limits pour un utilisateur
 */
function resetAllRateLimitsForUser(userId, guildId) {
    const prefix = guildId ? `${guildId}:${userId}:` : `dm:${userId}:`;
    for (const key of rateLimits.keys()) {
        if (key.startsWith(prefix)) {
            rateLimits.delete(key);
        }
    }
    logger_1.default.debug(`[RateLimiter] Tous les rate limits réinitialisés pour ${userId}`);
}
/**
 * Récupère les statistiques de rate limiting
 */
function getRateLimitStats() {
    const entriesByType = {};
    let oldestTimestamp = null;
    for (const [key, entry] of rateLimits.entries()) {
        const type = key.split(":").pop() || "unknown";
        entriesByType[type] = (entriesByType[type] || 0) + 1;
        if (oldestTimestamp === null || entry.windowStart < oldestTimestamp) {
            oldestTimestamp = entry.windowStart;
        }
    }
    return {
        totalEntries: rateLimits.size,
        entriesByType,
        oldestEntry: oldestTimestamp
    };
}
/**
 * Nettoie les entrées expirées du rate limiting
 */
function cleanupExpiredRateLimits() {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of rateLimits.entries()) {
        const type = key.split(":").pop() || "general";
        const config = DEFAULT_CONFIGS[type] || DEFAULT_CONFIGS.general;
        if (now - entry.windowStart > config.windowMs) {
            rateLimits.delete(key);
            cleaned++;
        }
    }
    if (cleaned > 0) {
        logger_1.default.debug(`[RateLimiter] Nettoyage de ${cleaned} entrée(s) expirée(s)`);
    }
}
// Nettoyage automatique toutes les 5 minutes
setInterval(cleanupExpiredRateLimits, 5 * 60 * 1000);
/**
 * Configure une limite personnalisée pour un type de requête
 */
function configureRateLimit(type, config) {
    DEFAULT_CONFIGS[type] = config;
    logger_1.default.info(`[RateLimiter] Configuration personnalisée pour ${type}: ${config.maxRequests} requêtes/${config.windowMs}ms`);
}
//# sourceMappingURL=rateLimiter.js.map