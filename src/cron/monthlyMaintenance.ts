/**
 * monthlyMaintenance.ts — Maintenance mensuelle automatique (15 du mois)
 *
 * Nettoie le cache de notification Neon (trim à 100 IDs par plateforme),
 * et envoie une notification de maintenance dans le salon de log.
 *
 * ⚠️ Neon-only : plus de fichier JSON local, tout passe par PostgreSQL.
 */

import { Client, TextChannel, EmbedBuilder } from "discord.js";
import cron, { ScheduledTask } from "node-cron";
import logger from "../utils/logger.js";
import { dedupCache } from "../utils/deduplicationCache.js";
import { config } from "../config.js";

// --- Constantes ---

const CLEANUP_HOUR = 8;
const CLEANUP_MINUTE = 0;

// --- Etat interne ---

let cronJob: ScheduledTask | null = null;

// --- Verification (async — Neon) ---

async function shouldRunMaintenance(): Promise<boolean> {
  return dedupCache.isMaintenanceDay();
}

// --- Notification ---

async function sendMaintenanceNotification(
  client: Client,
  statsBefore: Record<string, number>,
  totalBefore: number,
): Promise<void> {
  const logChannelId = config.logChannel;
  if (!logChannelId) {
    logger.warn("[MonthlyMaintenance] LOG_CHANNEL_ID non configure - notification ignoree");
    return;
  }

  try {
    const channel = await client.channels.fetch(logChannelId);
    if (!channel?.isTextBased()) {
      logger.warn("[MonthlyMaintenance] Salon de log invalide");
      return;
    }

    const _statsAfter = dedupCache.getStats();
    const totalAfter = dedupCache.getTotalCount();

    const embed = new EmbedBuilder()
      .setTitle("Menage Mensuel")
      .setDescription(
        `Le cache anti-doublon Neon (ProcessedCache) a ete nettoye avec succes (15 du mois) !\n` +
          `IDs avant: **${totalBefore}** → apres: **${totalAfter}**`,
      )
      .setColor(0x9b59b6)
      .addFields(
        { name: "Cache", value: "ProcessedCache (Neon) - trim a 100/plateforme", inline: true },
        { name: "Date", value: new Date().toLocaleDateString("fr-FR"), inline: true },
        { name: "Etat", value: "Nettoye avec succes", inline: true },
      )
      .setTimestamp()
      .setFooter({ text: "Maintenance automatique - Tous les 15 du mois" });

    await (channel as TextChannel).send({ embeds: [embed] });
    logger.info("[MonthlyMaintenance] Notification de maintenance envoyee");
  } catch (error) {
    logger.error(
      "[MonthlyMaintenance] Erreur envoi notification: " +
        (error instanceof Error ? error.message : String(error)),
    );
  }
}

// --- Execution ---

async function runMonthlyMaintenance(client: Client): Promise<void> {
  if (!(await shouldRunMaintenance())) {
    logger.debug("[MonthlyMaintenance] Pas le 15 ou deja nettoye ce mois-ci - ignore");
    return;
  }

  logger.info("[MonthlyMaintenance] Demarrage de la maintenance mensuelle (15 du mois)...");

  try {
    const statsBefore = dedupCache.getStats();
    const totalBefore = dedupCache.getTotalCount();
    logger.info(
      "[MonthlyMaintenance] Cache avant nettoyage: " +
        totalBefore +
        " IDs (" +
        Object.entries(statsBefore)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => k + ":" + v)
          .join(", ") +
        ")",
    );

    // Utilise clean() au lieu de reset() — trim à 100 IDs par plateforme
    // sans perdre l'historique. Les IDs sont conservés dans ProcessedCache.
    await dedupCache.clean();
    logger.info("[MonthlyMaintenance] Cache ProcessedCache (Neon) nettoye (trim 100/plateforme)");

    await dedupCache.markMaintenanceDone();

    try {
      await sendMaintenanceNotification(client, statsBefore, totalBefore);
    } catch (notifError) {
      logger.error(
        "[MonthlyMaintenance] Erreur notification: " +
          (notifError instanceof Error ? notifError.message : String(notifError)),
      );
    }

    logger.info("[MonthlyMaintenance] Maintenance mensuelle terminee avec succes");
  } catch (error) {
    logger.error(
      "[MonthlyMaintenance] Erreur maintenance: " +
        (error instanceof Error ? error.message : String(error)),
      { stack: error instanceof Error ? error.stack : undefined },
    );
  }
}

// --- Cron Management ---

export function startMonthlyMaintenance(client: Client): void {
  if (cronJob) {
    logger.warn("[MonthlyMaintenance] Deja actif - ignore");
    return;
  }

  const cronExpression = CLEANUP_MINUTE + " " + CLEANUP_HOUR + " * * *";

  logger.info(
    "[MonthlyMaintenance] Planification: tous les jours a " +
      CLEANUP_HOUR.toString().padStart(2, "0") +
      ":" +
      CLEANUP_MINUTE.toString().padStart(2, "0") +
      " (verification si 15 du mois)",
  );

  cronJob = cron.schedule(cronExpression, () => {
    runMonthlyMaintenance(client).catch((err) =>
      logger.error(
        "[MonthlyMaintenance] Erreur cron: " + (err instanceof Error ? err.message : String(err)),
      ),
    );
  });

  // Verifier au demarrage (au cas ou le bot eteint le 15)
  runMonthlyMaintenance(client).catch((err) =>
    logger.error(
      "[MonthlyMaintenance] Erreur check initial: " +
        (err instanceof Error ? err.message : String(err)),
    ),
  );
}

export function stopMonthlyMaintenance(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info("[MonthlyMaintenance] Cron arrete");
  }
}

export { runMonthlyMaintenance };
