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
/**
 * Ajoute une traduction à l'historique
 */
export declare function addTranslationToHistory(userId: string, originalText: string, translatedText: string, sourceLanguage: string, targetLanguage: string, guildId?: string): Promise<void>;
/**
 * Récupère l'historique des traductions d'un utilisateur
 */
export declare function getUserTranslationHistory(userId: string, guildId?: string, limit?: number): Promise<TranslationEntry[]>;
/**
 * Efface l'historique des traductions d'un utilisateur
 */
export declare function clearUserTranslationHistory(userId: string, guildId?: string): Promise<void>;
/**
 * Nettoie les anciennes entrées de l'historique (plus de 30 jours)
 */
export declare function cleanupOldTranslationHistory(): Promise<void>;
export {};
//# sourceMappingURL=translationHistory.d.ts.map