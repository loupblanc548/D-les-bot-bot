"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addTranslationToHistory = addTranslationToHistory;
exports.getUserTranslationHistory = getUserTranslationHistory;
exports.clearUserTranslationHistory = clearUserTranslationHistory;
exports.cleanupOldTranslationHistory = cleanupOldTranslationHistory;
const logger_1 = __importDefault(require("../utils/logger"));
const prisma_1 = __importDefault(require("../prisma"));
const MAX_HISTORY_PER_USER = 50; // Garder les 50 dernières traductions par utilisateur
/**
 * Ajoute une traduction à l'historique
 */
async function addTranslationToHistory(userId, originalText, translatedText, sourceLanguage, targetLanguage, guildId) {
    try {
        // Stocker dans Prisma pour persistance
        await prisma_1.default.translationHistory.create({
            data: {
                userId,
                guildId: guildId || null,
                originalText: originalText.slice(0, 1000),
                translatedText: translatedText.slice(0, 1000),
                sourceLanguage,
                targetLanguage,
            }
        });
        logger_1.default.debug(`[TranslationHistory] Traduction ajoutée pour ${userId}: ${sourceLanguage} → ${targetLanguage}`);
    }
    catch (error) {
        logger_1.default.debug(`[TranslationHistory] Erreur ajout historique: ${error instanceof Error ? error.message : String(error)}`);
    }
}
/**
 * Récupère l'historique des traductions d'un utilisateur
 */
async function getUserTranslationHistory(userId, guildId, limit = 10) {
    try {
        const records = await prisma_1.default.translationHistory.findMany({
            where: {
                userId,
                guildId: guildId || null,
            },
            orderBy: {
                createdAt: "desc"
            },
            take: limit
        });
        return records.map((record) => ({
            userId: record.userId,
            guildId: record.guildId || undefined,
            originalText: record.originalText,
            translatedText: record.translatedText,
            sourceLanguage: record.sourceLanguage,
            targetLanguage: record.targetLanguage,
            timestamp: record.createdAt.getTime()
        }));
    }
    catch (error) {
        logger_1.default.debug(`[TranslationHistory] Erreur récupération historique: ${error instanceof Error ? error.message : String(error)}`);
        return [];
    }
}
/**
 * Efface l'historique des traductions d'un utilisateur
 */
async function clearUserTranslationHistory(userId, guildId) {
    try {
        await prisma_1.default.translationHistory.deleteMany({
            where: {
                userId,
                guildId: guildId || null,
            }
        });
        logger_1.default.debug(`[TranslationHistory] Historique effacé pour ${userId}`);
    }
    catch (error) {
        logger_1.default.debug(`[TranslationHistory] Erreur suppression historique: ${error instanceof Error ? error.message : String(error)}`);
    }
}
/**
 * Nettoie les anciennes entrées de l'historique (plus de 30 jours)
 */
async function cleanupOldTranslationHistory() {
    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const result = await prisma_1.default.translationHistory.deleteMany({
            where: {
                createdAt: {
                    lt: thirtyDaysAgo
                }
            }
        });
        if (result.count > 0) {
            logger_1.default.info(`[TranslationHistory] Nettoyage de ${result.count} ancienne(s) entrée(s)`);
        }
    }
    catch (error) {
        logger_1.default.debug(`[TranslationHistory] Erreur nettoyage historique: ${error instanceof Error ? error.message : String(error)}`);
    }
}
// Nettoyage automatique toutes les heures
setInterval(cleanupOldTranslationHistory, 60 * 60 * 1000);
//# sourceMappingURL=translationHistory.js.map