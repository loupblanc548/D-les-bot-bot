"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addAlertToBuffer = addAlertToBuffer;
exports.enableSmartAlerts = enableSmartAlerts;
exports.disableSmartAlerts = disableSmartAlerts;
exports.flushAlertBuffer = flushAlertBuffer;
exports.getBufferStats = getBufferStats;
const logger_1 = __importDefault(require("./logger"));
const discord_js_1 = require("discord.js");
const config_1 = require("../config");
const alertBuffer = new Map();
const GROUPING_WINDOW = 30000; // 30 secondes pour grouper les alertes similaires
let processingInterval = null;
/**
 * Ajoute une alerte au buffer pour groupement
 * @param key Clé de groupement (ex: "spam", "raid", "api_error")
 * @param message Message de l'alerte
 * @param severity Sévérité de l'alerte
 */
function addAlertToBuffer(key, message, severity = "medium") {
    const now = Date.now();
    const existing = alertBuffer.get(key);
    if (!existing) {
        alertBuffer.set(key, {
            key,
            severity,
            messages: [message],
            firstTimestamp: now,
            lastTimestamp: now,
            count: 1,
        });
    }
    else {
        existing.messages.push(message);
        existing.lastTimestamp = now;
        existing.count++;
        existing.severity = severity; // Mettre à jour la sévérité
        alertBuffer.set(key, existing);
    }
    logger_1.default.debug(`[SmartAlerts] Alert ajoutée au buffer: ${key} (total: ${existing?.count || 1})`);
}
/**
 * Traite les alertes groupées et les envoie
 */
async function processGroupedAlerts(client) {
    const now = Date.now();
    if (!config_1.config.logChannel) {
        logger_1.default.error("[SmartAlerts] Channel de logs non configuré");
        return;
    }
    const channel = client.channels.cache.get(config_1.config.logChannel);
    if (!channel || !channel.isTextBased()) {
        logger_1.default.error("[SmartAlerts] Channel de logs non disponible");
        return;
    }
    for (const [key, grouped] of alertBuffer.entries()) {
        // Vérifier si la fenêtre de groupement est écoulée
        if (now - grouped.lastTimestamp >= GROUPING_WINDOW) {
            await sendGroupedAlert(client, grouped);
            alertBuffer.delete(key);
        }
    }
}
/**
 * Envoie une alerte groupée
 */
async function sendGroupedAlert(client, grouped) {
    if (!config_1.config.logChannel) {
        logger_1.default.error("[SmartAlerts] Channel de logs non configuré");
        return;
    }
    const channel = client.channels.cache.get(config_1.config.logChannel);
    if (!channel || !channel.isTextBased()) {
        logger_1.default.error("[SmartAlerts] Channel de logs non disponible");
        return;
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
        .setTitle(`${emojis[grouped.severity]} Alert Groupée: ${grouped.key.toUpperCase()}`)
        .setDescription(`${grouped.count} alerte(s) groupée(s)`)
        .setColor(colors[grouped.severity])
        .addFields({
        name: "Période",
        value: `${Math.round((grouped.lastTimestamp - grouped.firstTimestamp) / 1000)}s`,
        inline: true,
    }, {
        name: "Sévérité",
        value: grouped.severity.toUpperCase(),
        inline: true,
    }, {
        name: "Première alerte",
        value: new Date(grouped.firstTimestamp).toLocaleString(),
        inline: true,
    })
        .setTimestamp();
    // Ajouter les messages (limité à 10 pour éviter les embeds trop longs)
    const messagesToShow = grouped.messages.slice(-10);
    const messagesText = messagesToShow
        .map((msg, i) => `${i + 1}. ${msg}`)
        .join("\n")
        .substring(0, 4000);
    if (messagesText) {
        embed.addFields({
            name: `Alertes (${messagesToShow.length}/${grouped.messages.length})`,
            value: messagesText,
            inline: false,
        });
    }
    try {
        await channel.send({ embeds: [embed] });
        logger_1.default.info(`[SmartAlerts] Alert groupée envoyée: ${grouped.key} (${grouped.count} alertes)`);
    }
    catch (error) {
        logger_1.default.error("[SmartAlerts] Erreur lors de l'envoi de l'alerte groupée:", error);
    }
}
/**
 * Active le traitement automatique des alertes groupées
 */
function enableSmartAlerts(client, intervalMs = 10000) {
    if (processingInterval) {
        logger_1.default.warn("[SmartAlerts] Traitement automatique déjà activé");
        return;
    }
    logger_1.default.info(`[SmartAlerts] Traitement automatique activé (intervalle: ${intervalMs}ms)`);
    processingInterval = setInterval(() => {
        processGroupedAlerts(client);
    }, intervalMs);
}
/**
 * Désactive le traitement automatique
 */
function disableSmartAlerts() {
    if (processingInterval) {
        clearInterval(processingInterval);
        processingInterval = null;
        logger_1.default.info("[SmartAlerts] Traitement automatique désactivé");
    }
}
/**
 * Force le traitement immédiat des alertes groupées
 */
async function flushAlertBuffer(client) {
    logger_1.default.info("[SmartAlerts] Flush du buffer d'alertes");
    for (const [key, grouped] of alertBuffer.entries()) {
        await sendGroupedAlert(client, grouped);
        alertBuffer.delete(key);
    }
}
/**
 * Obtient les statistiques du buffer
 */
function getBufferStats() {
    return Object.fromEntries(alertBuffer);
}
//# sourceMappingURL=smart-alerts.js.map