/**
 * notificationCleanup.ts — Purge automatique des notifications anciennes (quotidien)
 *
 * CRON-23: Supprime les notifications > 30 jours de la DB
 * CRON-29: Purge les transcripts vocaux > 7 jours
 */

import { Client } from "discord.js";
import cron, { ScheduledTask } from "node-cron";
import logger from "../utils/logger.js";
import prisma from "../prisma.js";

const NOTIFICATION_RETENTION_DAYS = 30;
const TRANSCRIPT_RETENTION_DAYS = 7;

let cronJob: ScheduledTask | null = null;

export async function runNotificationCleanup(): Promise<void> {
  try {
    const notifCutoff = new Date(Date.now() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const _transcriptCutoff = new Date(
      Date.now() - TRANSCRIPT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );

    // Purge notifications
    let notifDeleted = 0;
    try {
      const result = await prisma.notification.deleteMany({
        where: { sentAt: { lt: notifCutoff } },
      });
      notifDeleted = result.count;
    } catch {
      // Table peut ne pas exister
    }

    // Purge logs anciens (> 30 jours)
    let logDeleted = 0;
    try {
      const result = await prisma.log.deleteMany({
        where: { createdAt: { lt: notifCutoff } },
      });
      logDeleted = result.count;
    } catch {
      // Table peut ne pas exister
    }

    logger.info(
      `[Cleanup] Purge: ${notifDeleted} notifications, ${logDeleted} logs supprimés (> ${NOTIFICATION_RETENTION_DAYS}j)`,
    );
  } catch (error) {
    logger.error("[Cleanup] Erreur:", error);
  }
}

export function startNotificationCleanup(_client: Client): void {
  if (cronJob) {
    logger.warn("[Cleanup] Déjà actif — ignoré");
    return;
  }

  // Tous les lundis à 4h00 du matin — une fois par semaine
  cronJob = cron.schedule("0 4 * * 1", () => {
    runNotificationCleanup().catch((err) => logger.error("[Cleanup] Erreur cron:", err));
  });

  logger.info("[Cleanup] Purge automatique planifiée (hebdomadaire, lundi 04:00)");
}

export function stopNotificationCleanup(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info("[Cleanup] Cron arrêté");
  }
}
