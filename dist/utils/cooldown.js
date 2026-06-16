"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.canSendAlert = canSendAlert;
exports.forceAlert = forceAlert;
exports.resetCooldown = resetCooldown;
exports.resetAllCooldowns = resetAllCooldowns;
exports.getCooldownInfo = getCooldownInfo;
exports.cleanupExpiredCooldowns = cleanupExpiredCooldowns;
exports.enableCooldownCleanup = enableCooldownCleanup;
exports.disableCooldownCleanup = disableCooldownCleanup;
const logger_1 = __importDefault(require("./logger"));
const cooldownMap = new Map();
const COOLDOWN_CONFIG = {
    low: { duration: 60000, maxAlerts: 5 }, // 1 minute, 5 alertes
    medium: { duration: 300000, maxAlerts: 3 }, // 5 minutes, 3 alertes
    high: { duration: 900000, maxAlerts: 2 }, // 15 minutes, 2 alertes
    critical: { duration: 1800000, maxAlerts: 1 }, // 30 minutes, 1 alerte
};
/**
 * Vérifie si une alerte peut être envoyée pour une clé donnée
 * @param key Clé unique pour l'alerte (ex: "user_123_spam", "guild_456_raid")
 * @param severity Sévérité de l'alerte
 * @returns true si l'alerte peut être envoyée, false sinon
 */
function canSendAlert(key, severity = "medium") {
    const now = Date.now();
    const entry = cooldownMap.get(key);
    const config = COOLDOWN_CONFIG[severity];
    if (!entry) {
        // Première alerte
        cooldownMap.set(key, {
            lastAlert: now,
            alertCount: 1,
            severity,
        });
        logger_1.default.debug(`[Cooldown] Première alerte pour ${key} (${severity})`);
        return true;
    }
    const timeSinceLastAlert = now - entry.lastAlert;
    // Si le temps de cooldown est écoulé, réinitialiser
    if (timeSinceLastAlert > config.duration) {
        cooldownMap.set(key, {
            lastAlert: now,
            alertCount: 1,
            severity,
        });
        logger_1.default.debug(`[Cooldown] Cooldown écoulé pour ${key}, réinitialisation`);
        return true;
    }
    // Vérifier si le nombre maximum d'alertes est atteint
    if (entry.alertCount >= config.maxAlerts) {
        logger_1.default.debug(`[Cooldown] Maximum d'alertes atteint pour ${key} (${entry.alertCount}/${config.maxAlerts})`);
        return false;
    }
    // Incrémenter le compteur et autoriser l'alerte
    entry.alertCount++;
    entry.lastAlert = now;
    cooldownMap.set(key, entry);
    logger_1.default.debug(`[Cooldown] Alertes pour ${key}: ${entry.alertCount}/${config.maxAlerts}`);
    return true;
}
/**
 * Force l'envoi d'une alerte (ignore le cooldown)
 * @param key Clé unique pour l'alerte
 */
function forceAlert(key) {
    const entry = cooldownMap.get(key);
    if (entry) {
        entry.lastAlert = Date.now();
        entry.alertCount = 0; // Réinitialiser le compteur
        cooldownMap.set(key, entry);
        logger_1.default.debug(`[Cooldown] Alertes forcées pour ${key}`);
    }
}
/**
 * Réinitialise le cooldown pour une clé donnée
 * @param key Clé unique pour l'alerte
 */
function resetCooldown(key) {
    cooldownMap.delete(key);
    logger_1.default.debug(`[Cooldown] Cooldown réinitialisé pour ${key}`);
}
/**
 * Réinitialise tous les cooldowns
 */
function resetAllCooldowns() {
    const count = cooldownMap.size;
    cooldownMap.clear();
    logger_1.default.info(`[Cooldown] ${count} cooldown(s) réinitialisé(s)`);
}
/**
 * Obtient les informations de cooldown pour une clé
 * @param key Clé unique pour l'alerte
 * @returns Informations de cooldown ou null si inexistant
 */
function getCooldownInfo(key) {
    return cooldownMap.get(key) || null;
}
/**
 * Nettoie les entrées de cooldown expirées
 */
function cleanupExpiredCooldowns() {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of cooldownMap.entries()) {
        const config = COOLDOWN_CONFIG[entry.severity];
        if (now - entry.lastAlert > config.duration * 2) { // Double du cooldown pour être sûr
            cooldownMap.delete(key);
            cleaned++;
        }
    }
    if (cleaned > 0) {
        logger_1.default.debug(`[Cooldown] ${cleaned} entrée(s) expirée(s) nettoyée(s)`);
    }
}
/**
 * Active le nettoyage automatique des cooldowns expirés
 */
let cleanupInterval = null;
function enableCooldownCleanup(intervalMs = 300000) {
    if (cleanupInterval) {
        logger_1.default.warn("[Cooldown] Nettoyage automatique déjà activé");
        return;
    }
    logger_1.default.info(`[Cooldown] Nettoyage automatique activé (intervalle: ${intervalMs}ms)`);
    cleanupInterval = setInterval(() => {
        cleanupExpiredCooldowns();
    }, intervalMs);
}
/**
 * Désactive le nettoyage automatique
 */
function disableCooldownCleanup() {
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
        logger_1.default.info("[Cooldown] Nettoyage automatique désactivé");
    }
}
//# sourceMappingURL=cooldown.js.map