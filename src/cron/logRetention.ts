/**
 * logRetention.ts — Nettoyage automatique des anciens logs en base de données.
 *
 * Supprime les logs de plus de 90 jours toutes les 24h.
 */

import prisma from "../prisma.js";
import logger from "../utils/logger.js";
import { safeInterval } from "../utils/safe-interval.js";
import { registerInterval } from "../shutdown.js";

const RETENTION_DAYS = 90;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h

let cleanupInterval: ReturnType<typeof setInterval> | null = null;
let initialTimeout: ReturnType<typeof setTimeout> | null = null;

async function runLogRetentionCleanup(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const result = await prisma.log.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    if (result.count > 0) {
      logger.info(
        `[LogRetention] ${result.count} logs de plus de ${RETENTION_DAYS} jours supprimés`,
      );
    }
  } catch (err) {
    logger.error(
      `[LogRetention] Erreur nettoyage: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function startLogRetention(): void {
  if (cleanupInterval) return;
  logger.info(`[LogRetention] Nettoyage des logs > ${RETENTION_DAYS}j programmé toutes les 24h`);

  initialTimeout = setTimeout(() => {
    runLogRetentionCleanup().catch(() => {});
  }, 60_000);

  cleanupInterval = safeInterval("LogRetention", runLogRetentionCleanup, CLEANUP_INTERVAL_MS);
  registerInterval(cleanupInterval);
}

export function stopLogRetention(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  if (initialTimeout) {
    clearTimeout(initialTimeout);
    initialTimeout = null;
  }
  logger.info("[LogRetention] Tache arrêtée");
}
