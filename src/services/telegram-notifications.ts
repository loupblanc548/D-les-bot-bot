import logger from "../utils/logger.js";
import { sendEscalatedAlert } from "../utils/alert-escalation.js";

const TELEGRAM_API_URL = "https://api.telegram.org/bot";

interface TelegramMessage {
  chatId: string;
  text: string;
  parseMode?: "Markdown" | "HTML";
}

/**
 * Envoie un message via Telegram Bot API
 */
export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
  parseMode: "Markdown" | "HTML" = "Markdown"
): Promise<boolean> {
  try {
    const response = await fetch(
      `${TELEGRAM_API_URL}${botToken}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: parseMode,
        }),
      }
    );

    const data = await response.json() as Record<string, unknown>;

    if (data.ok) {
      logger.info(`[Telegram] Message envoyé à ${chatId}`);
      return true;
    } else {
      logger.error(`[Telegram] Erreur API: ${data.description}`);
      return false;
    }
  } catch (error) {
    logger.error("[Telegram] Erreur lors de l'envoi du message:", error);
    return false;
  }
}

/**
 * Envoie une alerte critique via Telegram
 */
export async function sendCriticalAlert(
  message: string,
  data?: Record<string, unknown>
): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    logger.warn("[Telegram] Configuration Telegram manquante");
    return;
  }

  const formattedMessage = `🚨 **ALERTE CRITIQUE**

${message}

${data ? `Données: \`${JSON.stringify(data, null, 2)}\`` : ""}`.trim();

  const success = await sendTelegramMessage(botToken, chatId, formattedMessage);

  if (!success) {
    logger.error("[Telegram] Échec de l'envoi de l'alerte critique");
  }
}

/**
 * Envoie un rapport de santé via Telegram
 */
export async function sendHealthReport(
  uptime: number,
  memoryUsage: NodeJS.MemoryUsage,
  guildCount: number,
  userCount: number
): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    logger.warn("[Telegram] Configuration Telegram manquante");
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
export async function sendDeploymentNotification(
  version: string,
  environment: string
): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    logger.warn("[Telegram] Configuration Telegram manquante");
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
export function initTelegramNotifications(): void {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (botToken && chatId) {
    logger.info("[Telegram] Notifications Telegram activées");
  } else {
    logger.warn("[Telegram] Notifications Telegram désactivées (configuration manquante)");
  }
}
