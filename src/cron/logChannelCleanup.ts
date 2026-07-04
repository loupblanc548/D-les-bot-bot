/**
 * logChannelCleanup.ts — Nettoyage automatique des messages du bot dans le salon de log.
 *
 * Supprime les messages envoyés par le bot de plus de 24h dans le salon de log
 * (rapports de maintenance, health checks, alertes, etc.) pour éviter le spam.
 *
 * Tourne toutes les 6 heures.
 */

import { Client, ChannelType, TextChannel } from "discord.js";
import cron, { ScheduledTask } from "node-cron";
import logger from "../utils/logger.js";
import { config } from "../config.js";

const RETENTION_HOURS = 24;
const MAX_MESSAGES_TO_FETCH = 100;

let cronJob: ScheduledTask | null = null;

async function runLogChannelCleanup(client: Client): Promise<void> {
  if (!config.logChannel) return;

  try {
    const channel = await client.channels.fetch(config.logChannel).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) return;

    const textChannel = channel as TextChannel;
    const messages = await textChannel.messages.fetch({ limit: MAX_MESSAGES_TO_FETCH });
    if (messages.size === 0) return;

    const botId = client.user?.id;
    const cutoff = Date.now() - RETENTION_HOURS * 60 * 60 * 1000;

    const toDelete: string[] = [];
    for (const msg of messages.values()) {
      if (msg.author.id !== botId) continue;
      if (msg.createdTimestamp < cutoff) {
        toDelete.push(msg.id);
      }
    }

    if (toDelete.length === 0) return;

    // Bulk delete si possible (messages < 14 jours), sinon un par un
    const recentMsgs = toDelete.filter((id) => {
      const m = messages.get(id);
      return m && Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000;
    });
    const oldMsgs = toDelete.filter((id) => !recentMsgs.includes(id));

    if (recentMsgs.length > 1) {
      await textChannel.bulkDelete(recentMsgs).catch((err) => {
        logger.error(`[LogCleanup] Erreur bulkDelete: ${String(err)}`);
      });
    } else if (recentMsgs.length === 1) {
      const msg = messages.get(recentMsgs[0]);
      if (msg) await msg.delete().catch(() => {});
    }

    for (const id of oldMsgs) {
      const msg = messages.get(id);
      if (msg) await msg.delete().catch(() => {});
    }

    logger.info(`[LogCleanup] ${toDelete.length} message(s) du bot supprimé(s) (> ${RETENTION_HOURS}h) dans le salon de log`);
  } catch (err) {
    logger.error(`[LogCleanup] Erreur: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function startLogChannelCleanup(client: Client): void {
  if (cronJob) {
    logger.warn("[LogCleanup] Déjà actif — ignoré");
    return;
  }

  cronJob = cron.schedule("0 */6 * * *", () => {
    void runLogChannelCleanup(client);
  });

  // Premier run après 2 min
  setTimeout(() => void runLogChannelCleanup(client), 2 * 60 * 1000);

  logger.info(`[LogCleanup] Nettoyage du salon de log programmé (toutes les 6h, messages > ${RETENTION_HOURS}h supprimés)`);
}

export function stopLogChannelCleanup(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info("[LogCleanup] Cron arrêté");
  }
}
