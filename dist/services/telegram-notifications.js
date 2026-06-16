"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendTelegramMessage = sendTelegramMessage;
exports.sendCriticalAlert = sendCriticalAlert;
exports.sendHealthReport = sendHealthReport;
exports.sendDeploymentNotification = sendDeploymentNotification;
exports.initTelegramNotifications = initTelegramNotifications;
const logger_1 = __importDefault(require("../utils/logger"));
const TELEGRAM_API_URL = "https://api.telegram.org/bot";
/**
 * Envoie un message via Telegram Bot API
 */
async function sendTelegramMessage(botToken, chatId, text, parseMode = "Markdown") {
    try {
        const response = await fetch(`${TELEGRAM_API_URL}${botToken}/sendMessage`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: parseMode,
            }),
        });
        const data = await response.json();
        if (data.ok) {
            logger_1.default.info(`[Telegram] Message envoyé à ${chatId}`);
            return true;
        }
        else {
            logger_1.default.error(`[Telegram] Erreur API: ${data.description}`);
            return false;
        }
    }
    catch (error) {
        logger_1.default.error("[Telegram] Erreur lors de l'envoi du message:", error);
        return false;
    }
}
/**
 * Envoie une alerte critique via Telegram
 */
async function sendCriticalAlert(message, data) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) {
        logger_1.default.warn("[Telegram] Configuration Telegram manquante");
        return;
    }
    const formattedMessage = `🚨 **ALERTE CRITIQUE**

${message}

${data ? `Données: \`${JSON.stringify(data, null, 2)}\`` : ""}`.trim();
    const success = await sendTelegramMessage(botToken, chatId, formattedMessage);
    if (!success) {
        logger_1.default.error("[Telegram] Échec de l'envoi de l'alerte critique");
    }
}
/**
 * Envoie un rapport de santé via Telegram
 */
async function sendHealthReport(uptime, memoryUsage, guildCount, userCount) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) {
        logger_1.default.warn("[Telegram] Configuration Telegram manquante");
        return;
    }
    const message = `📊 **Rapport de Santé**

⏱️ **Uptime**: ${Math.floor(uptime / 60)} minutes
💾 **Mémoire**: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB
🏠 **Serveurs**: ${guildCount}
👥 **Utilisateurs**: ${userCount}`.trim();
    await sendTelegramMessage(botToken, chatId, message);
}
/**
 * Envoie une notification de déploiement via Telegram
 */
async function sendDeploymentNotification(version, environment) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) {
        logger_1.default.warn("[Telegram] Configuration Telegram manquante");
        return;
    }
    const message = `🚀 **Déploiement**

Version: ${version}
Environnement: ${environment}
Date: ${new Date().toLocaleString()}`.trim();
    await sendTelegramMessage(botToken, chatId, message);
}
/**
 * Initialise les notifications Telegram
 */
function initTelegramNotifications() {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (botToken && chatId) {
        logger_1.default.info("[Telegram] Notifications Telegram activées");
    }
    else {
        logger_1.default.warn("[Telegram] Notifications Telegram désactivées (configuration manquante)");
    }
}
//# sourceMappingURL=telegram-notifications.js.map