"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEscalatedAlert = sendEscalatedAlert;
exports.resetAlert = resetAlert;
exports.resetAllAlerts = resetAllAlerts;
exports.getAlertStats = getAlertStats;
const logger_1 = __importDefault(require("./logger"));
const cooldown_1 = require("./cooldown");
const discord_js_1 = require("discord.js");
const config_1 = require("../config");
const alertMap = new Map();
const ESCALATION_RULES = {
    spam: {
        severity: "low",
        cooldown: 60000,
        escalateAfter: 3,
        escalateTo: "medium",
        notifyRoles: [],
    },
    raid: {
        severity: "high",
        cooldown: 300000,
        escalateAfter: 2,
        escalateTo: "critical",
        notifyRoles: [],
    },
    phishing: {
        severity: "critical",
        cooldown: 1800000,
        escalateAfter: 1,
        escalateTo: "critical",
        notifyRoles: [],
    },
    api_error: {
        severity: "medium",
        cooldown: 300000,
        escalateAfter: 5,
        escalateTo: "high",
        notifyRoles: [],
    },
};
/**
 * Envoie une alerte avec système d'escalation automatique
 * @param client Client Discord
 * @param key Clé unique pour l'alerte (ex: "spam", "raid", "phishing")
 * @param message Message de l'alerte
 * @param data Données additionnelles
 * @returns true si l'alerte a été envoyée, false sinon
 */
async function sendEscalatedAlert(client, key, message, data) {
    const rule = ESCALATION_RULES[key];
    if (!rule) {
        logger_1.default.warn(`[Escalation] Règle non trouvée pour ${key}, envoi direct`);
        return await sendDirectAlert(client, key, message, data);
    }
    // Vérifier le cooldown
    if (!(0, cooldown_1.canSendAlert)(key, rule.severity)) {
        logger_1.default.debug(`[Escalation] Cooldown actif pour ${key}`);
        return false;
    }
    // Mettre à jour ou créer l'entrée d'alerte
    const now = Date.now();
    const entry = alertMap.get(key);
    if (!entry) {
        alertMap.set(key, {
            key,
            severity: rule.severity,
            count: 1,
            firstAlert: now,
            lastAlert: now,
            data,
        });
    }
    else {
        entry.count++;
        entry.lastAlert = now;
        entry.data = data;
        alertMap.set(key, entry);
    }
    const currentEntry = alertMap.get(key);
    // Vérifier si escalation nécessaire
    if (currentEntry.count >= rule.escalateAfter && rule.escalateTo !== rule.severity) {
        logger_1.default.info(`[Escalation] Escalation de ${key} de ${rule.severity} à ${rule.escalateTo}`);
        currentEntry.severity = rule.escalateTo;
        (0, cooldown_1.resetCooldown)(key); // Reset cooldown pour la nouvelle sévérité
    }
    // Envoyer l'alerte
    return await sendDirectAlert(client, key, message, currentEntry);
}
/**
 * Envoie une alerte directe sans escalation
 */
async function sendDirectAlert(client, key, message, entry) {
    const severity = entry?.severity || "medium";
    if (!config_1.config.logChannel) {
        logger_1.default.error(`[Escalation] Channel de logs non configuré`);
        return false;
    }
    const channel = client.channels.cache.get(config_1.config.logChannel);
    if (!channel || !channel.isTextBased()) {
        logger_1.default.error(`[Escalation] Channel de logs non disponible`);
        return false;
    }
    const colors = {
        low: 0x00ff00,
        medium: 0xffaa00,
        high: 0xff6600,
        critical: 0xff0000,
    };
    const emojis = {
        low: "🟢",
        medium: "🟡",
        high: "🟠",
        critical: "🔴",
    };
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle(`${emojis[severity]} Alert: ${key.toUpperCase()}`)
        .setDescription(message)
        .setColor(colors[severity])
        .setTimestamp();
    if (entry) {
        embed.addFields({
            name: "Nombre d'alertes",
            value: entry.count.toString(),
            inline: true,
        }, {
            name: "Sévérité",
            value: entry.severity.toUpperCase(),
            inline: true,
        }, {
            name: "Première alerte",
            value: new Date(entry.firstAlert).toLocaleString(),
            inline: true,
        });
        if (entry.data) {
            embed.addFields({
                name: "Données",
                value: JSON.stringify(entry.data, null, 2).substring(0, 1000),
                inline: false,
            });
        }
    }
    try {
        await channel.send({ embeds: [embed] });
        logger_1.default.info(`[Escalation] Alert envoyée: ${key} (${severity})`);
        return true;
    }
    catch (error) {
        logger_1.default.error(`[Escalation] Erreur lors de l'envoi de l'alerte:`, error);
        return false;
    }
}
/**
 * Réinitialise les alertes pour une clé donnée
 */
function resetAlert(key) {
    alertMap.delete(key);
    (0, cooldown_1.resetCooldown)(key);
    logger_1.default.debug(`[Escalation] Alert réinitialisée pour ${key}`);
}
/**
 * Réinitialise toutes les alertes
 */
function resetAllAlerts() {
    const count = alertMap.size;
    alertMap.clear();
    for (const key of alertMap.keys()) {
        (0, cooldown_1.resetCooldown)(key);
    }
    logger_1.default.info(`[Escalation] ${count} alerte(s) réinitialisée(s)`);
}
/**
 * Obtient les statistiques d'alertes
 */
function getAlertStats() {
    return Object.fromEntries(alertMap);
}
//# sourceMappingURL=alert-escalation.js.map