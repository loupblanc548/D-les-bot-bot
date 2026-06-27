/**
 * alertDigest.ts — Résumé quotidien des alertes (CRON-09)
 *
 * Envoie un digest des alertes des dernières 24h dans le salon de log.
 * Synthétise : events de sécurité, alerts AI-mod, anti-phishing, spam.
 */

import { Client, TextChannel, EmbedBuilder } from "discord.js";
import cron, { ScheduledTask } from "node-cron";
import logger from "../utils/logger.js";
import { config } from "../config.js";
import prisma from "../prisma.js";

let cronJob: ScheduledTask | null = null;

export async function runAlertDigest(client: Client): Promise<void> {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Compter les logs par type
    const logs = await prisma.log.groupBy({
      by: ["type"],
      where: { createdAt: { gte: since } },
      _count: true,
    });

    if (logs.length === 0) {
      logger.debug("[AlertDigest] Aucune alerte dans les dernières 24h");
      return;
    }

    const logChannelId = config.logChannel;
    if (!logChannelId) return;

    const channel = await client.channels.fetch(logChannelId);
    if (!channel?.isTextBased()) return;

    const totalAlerts = logs.reduce((sum, l) => sum + l._count, 0);

    const fields = logs
      .sort((a, b) => b._count - a._count)
      .slice(0, 10)
      .map((l) => ({
        name: l.type,
        value: `${l._count}`,
        inline: true,
      }));

    const embed = new EmbedBuilder()
      .setTitle("📊 Digest des alertes (24h)")
      .setColor(0x2f3136)
      .setDescription(`**${totalAlerts}** événements enregistrés dans les dernières 24h`)
      .addFields(...fields)
      .setTimestamp()
      .setFooter({ text: "Digest automatique quotidien" });

    await (channel as TextChannel).send({ embeds: [embed] });
    logger.info(`[AlertDigest] Digest envoyé: ${totalAlerts} alertes`);
  } catch (error) {
    logger.error("[AlertDigest] Erreur:", error);
  }
}

export function startAlertDigest(client: Client): void {
  if (cronJob) {
    logger.warn("[AlertDigest] Déjà actif — ignoré");
    return;
  }

  // Tous les jours à 08:00
  cronJob = cron.schedule("0 8 * * *", () => {
    runAlertDigest(client).catch((err) => logger.error("[AlertDigest] Erreur cron:", err));
  });

  logger.info("[AlertDigest] Digest quotidien planifié à 08:00");
}

export function stopAlertDigest(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info("[AlertDigest] Cron arrêté");
  }
}
