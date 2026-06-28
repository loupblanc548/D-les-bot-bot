import logger from "../utils/logger.js";
import prisma from "../prisma.js";

/**
 * Service d'historique des traductions par utilisateur
 * Stocke les traductions pour consultation ultérieure
 */

interface TranslationEntry {
  userId: string;
  guildId?: string;
  originalText: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  timestamp: number;
}

const _MAX_HISTORY_PER_USER = 50; // Garder les 50 dernières traductions par utilisateur

/**
 * Ajoute une traduction à l'historique
 */
export async function addTranslationToHistory(
  userId: string,
  originalText: string,
  translatedText: string,
  sourceLanguage: string,
  targetLanguage: string,
  guildId?: string,
): Promise<void> {
  try {
    // Stocker dans Prisma pour persistance
    await prisma.translationHistory.create({
      data: {
        userId,
        guildId: guildId || null,
        originalText: originalText.slice(0, 1000),
        translatedText: translatedText.slice(0, 1000),
        sourceLanguage,
        targetLanguage,
      },
    });

    logger.debug(
      `[TranslationHistory] Traduction ajoutée pour ${userId}: ${sourceLanguage} → ${targetLanguage}`,
    );
  } catch (error) {
    logger.debug(
      `[TranslationHistory] Erreur ajout historique: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Récupère l'historique des traductions d'un utilisateur
 */
export async function getUserTranslationHistory(
  userId: string,
  guildId?: string,
  limit: number = 10,
): Promise<TranslationEntry[]> {
  try {
    const records = await prisma.translationHistory.findMany({
      where: {
        userId,
        guildId: guildId || null,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
    });

    return records.map((record: any) => ({
      userId: record.userId,
      guildId: record.guildId || undefined,
      originalText: record.originalText,
      translatedText: record.translatedText,
      sourceLanguage: record.sourceLanguage,
      targetLanguage: record.targetLanguage,
      timestamp: (record as any).createdAt.getTime(),
    }));
  } catch (error) {
    logger.debug(
      `[TranslationHistory] Erreur récupération historique: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

/**
 * Efface l'historique des traductions d'un utilisateur
 */
export async function clearUserTranslationHistory(userId: string, guildId?: string): Promise<void> {
  try {
    await prisma.translationHistory.deleteMany({
      where: {
        userId,
        guildId: guildId || null,
      },
    });

    logger.debug(`[TranslationHistory] Historique effacé pour ${userId}`);
  } catch (error) {
    logger.debug(
      `[TranslationHistory] Erreur suppression historique: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Nettoie les anciennes entrées de l'historique (plus de 30 jours)
 */
export async function cleanupOldTranslationHistory(): Promise<void> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await prisma.translationHistory.deleteMany({
      where: {
        createdAt: {
          lt: thirtyDaysAgo,
        },
      },
    });

    if (result.count > 0) {
      logger.info(`[TranslationHistory] Nettoyage de ${result.count} ancienne(s) entrée(s)`);
    }
  } catch (error) {
    logger.debug(
      `[TranslationHistory] Erreur nettoyage historique: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// Nettoyage automatique toutes les heures
const _translationCleanup = setInterval(cleanupOldTranslationHistory, 60 * 60 * 1000);
if (_translationCleanup.unref) _translationCleanup.unref();
