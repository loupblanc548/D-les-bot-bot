interface DealPattern {
    title: string;
    platform: string;
    price: number;
    timestamp: number;
    source: string;
}
interface PredictionResult {
    predictedOffers: string[];
    confidence: number;
    reasoning: string;
    nextCheckDate: Date;
}
declare class AIPredictionService {
    private openai;
    private historicalData;
    private readonly MAX_HISTORY;
    constructor();
    /**
     * Ajoute une donnée historique
     */
    addHistoricalData(pattern: DealPattern): void;
    /**
     * Analyse les tendances historiques
     */
    private analyzeHistoricalTrends;
    /**
     * Prédit les prochaines offres avec IA
     */
    predictNextOffers(): Promise<PredictionResult>;
    /**
     * Analyse un flux RSS et extrait les patterns
     */
    analyzeRSSFeed(feedUrl: string): Promise<void>;
    /**
     * Détecte la plateforme depuis le titre
     */
    private detectPlatform;
    /**
     * Extrait le prix depuis le titre
     */
    private extractPrice;
    /**
     * Obtient les statistiques historiques
     */
    getHistoricalStats(): {
        totalDeals: number;
        platformDistribution: Record<string, number>;
        averagePrice: number;
        recentActivity: DealPattern[];
    };
}
export declare const aiPredictionService: AIPredictionService;
export {};
//# sourceMappingURL=ai-prediction.d.ts.map