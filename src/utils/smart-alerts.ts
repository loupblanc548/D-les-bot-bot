import logger from "./logger";
import { Client, TextChannel, EmbedBuilder } from "discord.js";
import { config } from "../config";
import { sendEscalatedAlert } from "./alert-escalation";

interface GroupedAlert {
  key: string;
  severity: "low" | "medium" | "high" | "critical";
  messages: string[];
  firstTimestamp: number;
  lastTimestamp: number;
  count: number;
}

const alertBuffer = new Map<string, GroupedAlert>();
const GROUPING_WINDOW = 30000; // 30 secondes pour grouper les alertes similaires
let processingInterval: NodeJS.Timeout | null = null;

/**
 * Ajoute une alerte au buffer pour groupement
 * @param key Clé de groupement (ex: "spam", "raid", "api_error")
 * @param message Message de l'alerte
 * @param severity Sévérité de l'alerte
 */
export function addAlertToBuffer(
  key: string,
  message: string,
  severity: "low" | "medium" | "high" | "critical" = "medium"
): void {
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
  } else {
    existing.messages.push(message);
    existing.lastTimestamp = now;
    existing.count++;
    existing.severity = severity; // Mettre à jour la sévérité
    alertBuffer.set(key, existing);
  }

  logger.debug(`[SmartAlerts] Alert ajoutée au buffer: ${key} (total: ${existing?.count || 1})`);
}

/**
 * Traite les alertes groupées et les envoie
 */
async function processGroupedAlerts(client: Client): Promise<void> {
  const now = Date.now();
  if (!config.logChannel) {
    logger.error("[SmartAlerts] Channel de logs non configuré");
    return;
  }
  const channel = client.channels.cache.get(config.logChannel) as TextChannel;

  if (!channel || !channel.isTextBased()) {
    logger.error("[SmartAlerts] Channel de logs non disponible");
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
async function sendGroupedAlert(client: Client, grouped: GroupedAlert): Promise<void> {
  if (!config.logChannel) {
    logger.error("[SmartAlerts] Channel de logs non configuré");
    return;
  }
  const channel = client.channels.cache.get(config.logChannel) as TextChannel;

  if (!channel || !channel.isTextBased()) {
    logger.error("[SmartAlerts] Channel de logs non disponible");
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

  const embed = new EmbedBuilder()
    .setTitle(`${emojis[grouped.severity]} Alert Groupée: ${grouped.key.toUpperCase()}`)
    .setDescription(`${grouped.count} alerte(s) groupée(s)`)
    .setColor(colors[grouped.severity])
    .addFields(
      {
        name: "Période",
        value: `${Math.round((grouped.lastTimestamp - grouped.firstTimestamp) / 1000)}s`,
        inline: true,
      },
      {
        name: "Sévérité",
        value: grouped.severity.toUpperCase(),
        inline: true,
      },
      {
        name: "Première alerte",
        value: new Date(grouped.firstTimestamp).toLocaleString(),
        inline: true,
      }
    )
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
    logger.info(`[SmartAlerts] Alert groupée envoyée: ${grouped.key} (${grouped.count} alertes)`);
  } catch (error) {
    logger.error("[SmartAlerts] Erreur lors de l'envoi de l'alerte groupée:", error);
  }
}

/**
 * Active le traitement automatique des alertes groupées
 */
export function enableSmartAlerts(client: Client, intervalMs: number = 10000): void {
  if (processingInterval) {
    logger.warn("[SmartAlerts] Traitement automatique déjà activé");
    return;
  }

  logger.info(`[SmartAlerts] Traitement automatique activé (intervalle: ${intervalMs}ms)`);
  processingInterval = setInterval(() => {
    processGroupedAlerts(client);
  }, intervalMs);
}

/**
 * Désactive le traitement automatique
 */
export function disableSmartAlerts(): void {
  if (processingInterval) {
    clearInterval(processingInterval);
    processingInterval = null;
    logger.info("[SmartAlerts] Traitement automatique désactivé");
  }
}

/**
 * Force le traitement immédiat des alertes groupées
 */
export async function flushAlertBuffer(client: Client): Promise<void> {
  logger.info("[SmartAlerts] Flush du buffer d'alertes");
  for (const [key, grouped] of alertBuffer.entries()) {
    await sendGroupedAlert(client, grouped);
    alertBuffer.delete(key);
  }
}

/**
 * Obtient les statistiques du buffer
 */
export function getBufferStats(): Record<string, GroupedAlert> {
  return Object.fromEntries(alertBuffer);
}
