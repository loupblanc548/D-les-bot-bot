import logger from "../utils/logger.js";
import prisma from "../prisma.js";

const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000; // Tous les jours

/**
 * Nettoie les données obsolètes de la base de données :
 * - Logs > 30 jours
 * - Notifications > 90 jours
 * - ChatHistory > 7 jours
 * - Sanctions > 180 jours (gardées pour l'historique long)
 */
export async function pruneOldData(): Promise<{
  logsDeleted: number;
  notificationsDeleted: number;
  chatHistoryDeleted: number;
}> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [logResult, notifResult, chatResult] = await Promise.allSettled([
    prisma.log.deleteMany({ where: { createdAt: { lt: thirtyDaysAgo } } }),
    prisma.notification.deleteMany({ where: { sentAt: { lt: ninetyDaysAgo } } }),
    prisma.chatHistory.deleteMany({ where: { createdAt: { lt: sevenDaysAgo } } }),
  ]);

  const logsDeleted = logResult.status === "fulfilled" ? logResult.value.count : 0;
  const notificationsDeleted = notifResult.status === "fulfilled" ? notifResult.value.count : 0;
  const chatHistoryDeleted = chatResult.status === "fulfilled" ? chatResult.value.count : 0;

  if (logsDeleted > 0 || notificationsDeleted > 0 || chatHistoryDeleted > 0) {
    logger.info(
      `[DataPruning] Nettoyage terminé : ${logsDeleted} logs, ${notificationsDeleted} notifications, ${chatHistoryDeleted} messages IA`
    );
  }

  return { logsDeleted, notificationsDeleted, chatHistoryDeleted };
}

let pruneInterval: ReturnType<typeof setInterval> | null = null;

export function startDataPruning(): void {
  if (pruneInterval) return;
  logger.info("[DataPruning] Nettoyage automatique activé (intervalle: 24h)");
  pruneInterval = setInterval(() => {
    pruneOldData().catch((err) => logger.error("[DataPruning] Erreur:", err));
  }, PRUNE_INTERVAL_MS);
}

export function stopDataPruning(): void {
  if (pruneInterval) {
    clearInterval(pruneInterval);
    pruneInterval = null;
  }
}
