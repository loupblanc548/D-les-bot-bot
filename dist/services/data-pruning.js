"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pruneOldData = pruneOldData;
exports.startDataPruning = startDataPruning;
exports.stopDataPruning = stopDataPruning;
const logger_1 = __importDefault(require("../utils/logger"));
const prisma_1 = __importDefault(require("../prisma"));
const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000; // Tous les jours
/**
 * Nettoie les données obsolètes de la base de données :
 * - Logs > 30 jours
 * - Notifications > 90 jours
 * - ChatHistory > 7 jours
 * - Sanctions > 180 jours (gardées pour l'historique long)
 */
async function pruneOldData() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [logResult, notifResult, chatResult] = await Promise.allSettled([
        prisma_1.default.log.deleteMany({ where: { createdAt: { lt: thirtyDaysAgo } } }),
        prisma_1.default.notification.deleteMany({ where: { sentAt: { lt: ninetyDaysAgo } } }),
        prisma_1.default.chatHistory.deleteMany({ where: { createdAt: { lt: sevenDaysAgo } } }),
    ]);
    const logsDeleted = logResult.status === "fulfilled" ? logResult.value.count : 0;
    const notificationsDeleted = notifResult.status === "fulfilled" ? notifResult.value.count : 0;
    const chatHistoryDeleted = chatResult.status === "fulfilled" ? chatResult.value.count : 0;
    if (logsDeleted > 0 || notificationsDeleted > 0 || chatHistoryDeleted > 0) {
        logger_1.default.info(`[DataPruning] Nettoyage terminé : ${logsDeleted} logs, ${notificationsDeleted} notifications, ${chatHistoryDeleted} messages IA`);
    }
    return { logsDeleted, notificationsDeleted, chatHistoryDeleted };
}
let pruneInterval = null;
function startDataPruning() {
    if (pruneInterval)
        return;
    logger_1.default.info("[DataPruning] Nettoyage automatique activé (intervalle: 24h)");
    pruneInterval = setInterval(() => {
        pruneOldData().catch((err) => logger_1.default.error("[DataPruning] Erreur:", err));
    }, PRUNE_INTERVAL_MS);
}
function stopDataPruning() {
    if (pruneInterval) {
        clearInterval(pruneInterval);
        pruneInterval = null;
    }
}
//# sourceMappingURL=data-pruning.js.map