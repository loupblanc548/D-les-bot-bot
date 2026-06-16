interface TrendData {
    keyword: string;
    mentions: number;
    growthRate: number;
    platforms: string[];
    lastUpdated: number;
}
interface EmergingTrend {
    keyword: string;
    confidence: number;
    prediction: string;
    relatedKeywords: string[];
    estimatedPeak: Date;
}
declare class TrendDetectionService {
    private openai;
    private trendHistory;
    private currentTrends;
    constructor();
    /**
     * Analyse les flux RSS pour détecter les tendances
     */
    analyzeRSSFeeds(feedUrls: string[]): Promise<void>;
    /**
     * Extrait les mots-clés d'un texte
     */
    private extractKeywords;
    /**
     * Détecte les tendances émergentes avec IA
     */
    detectEmergingTrends(): Promise<EmergingTrend[]>;
    /**
     * Obtient les tendances actuelles
     */
    getCurrentTrends(limit?: number): TrendData[];
    /**
     * Obtient les tendances en croissance rapide
     */
    getFastGrowingTrends(threshold?: number): TrendData[];
    /**
     * Sauvegarde l'historique des tendances
     */
    saveTrendHistory(): void;
    /**
     * Obtient l'historique d'un mot-clé
     */
    getKeywordHistory(keyword: string): TrendData[];
    /**
     * Active la surveillance automatique
     */
    enableMonitoring(intervalMs?: number): void;
    /**
     * Obtient les statistiques globales
     */
    getGlobalStats(): {
        totalTrends: number;
        averageGrowthRate: number;
        topKeywords: string[];
    };
}
export declare const trendDetectionService: TrendDetectionService;
export {};
//# sourceMappingURL=trend-detection.d.ts.map