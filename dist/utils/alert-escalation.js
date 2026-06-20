import logger from "./logger.js";
import { canSendAlert, resetCooldown } from "./cooldown.js";
import { EmbedBuilder } from "discord.js";
import { config } from "../config.js";
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
export async function sendEscalatedAlert(client, key, message, data) {
    const rule = ESCALATION_RULES[key];
    if (!rule) {
        logger.warn(`[Escalation] Règle non trouvée pour ${key}, envoi direct`);
        return await sendDirectAlert(client, key, message, data);
    }
    // Vérifier le cooldown
    if (!canSendAlert(key, rule.severity)) {
        logger.debug(`[Escalation] Cooldown actif pour ${key}`);
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
        logger.info(`[Escalation] Escalation de ${key} de ${rule.severity} à ${rule.escalateTo}`);
        currentEntry.severity = rule.escalateTo;
        resetCooldown(key); // Reset cooldown pour la nouvelle sévérité
    }
    // Envoyer l'alerte
    return await sendDirectAlert(client, key, message, currentEntry);
}
/**
 * Envoie une alerte directe sans escalation
 */
async function sendDirectAlert(client, key, message, entry) {
    const severity = entry?.severity || "medium";
    if (!config.logChannel) {
        logger.error(`[Escalation] Channel de logs non configuré`);
        return false;
    }
    const channel = client.channels.cache.get(config.logChannel);
    if (!channel || !channel.isTextBased()) {
        logger.error(`[Escalation] Channel de logs non disponible`);
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
    const embed = new EmbedBuilder()
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
        logger.info(`[Escalation] Alert envoyée: ${key} (${severity})`);
        return true;
    }
    catch (error) {
        logger.error(`[Escalation] Erreur lors de l'envoi de l'alerte:`, error);
        return false;
    }
}
/**
 * Réinitialise les alertes pour une clé donnée
 */
export function resetAlert(key) {
    alertMap.delete(key);
    resetCooldown(key);
    logger.debug(`[Escalation] Alert réinitialisée pour ${key}`);
}
/**
 * Réinitialise toutes les alertes
 */
export function resetAllAlerts() {
    const count = alertMap.size;
    alertMap.clear();
    for (const key of alertMap.keys()) {
        resetCooldown(key);
    }
    logger.info(`[Escalation] ${count} alerte(s) réinitialisée(s)`);
}
/**
 * Obtient les statistiques d'alertes
 */
export function getAlertStats() {
    return Object.fromEntries(alertMap);
}
//# sourceMappingURL=alert-escalation.js.map