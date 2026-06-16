/**
 * Nettoie les données obsolètes de la base de données :
 * - Logs > 30 jours
 * - Notifications > 90 jours
 * - ChatHistory > 7 jours
 * - Sanctions > 180 jours (gardées pour l'historique long)
 */
export declare function pruneOldData(): Promise<{
    logsDeleted: number;
    notificationsDeleted: number;
    chatHistoryDeleted: number;
}>;
export declare function startDataPruning(): void;
export declare function stopDataPruning(): void;
//# sourceMappingURL=data-pruning.d.ts.map