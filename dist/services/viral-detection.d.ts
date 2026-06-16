interface ViralContent {
    contentId: string;
    title: string;
    url: string;
    platform: string;
    viralScore: number;
    predictedReach: number;
    engagementRate: number;
    timestamp: number;
    metadata: Record<string, any>;
}
declare class ViralDetectionService {
    private openai;
    private contentCache;
    private viralThreshold;
    constructor();
    /**
     * Analyse un contenu pour prédire son potentiel viral
     */
    analyzeViralPotential(content: {
        title: string;
        content?: string;
        platform: string;
        url: string;
    }): Promise<ViralContent>;
    /**
     * Analyse les flux RSS pour détecter le contenu viral potentiel
     */
    scanRSSFeeds(feedUrls: string[]): Promise<ViralContent[]>;
    /**
     * Extrait la plateforme depuis l'URL
     */
    private extractPlatform;
    /**
     * Génère un ID de contenu
     */
    private generateContentId;
    /**
     * Obtient le contenu viral depuis le cache
     */
    getCachedViralContent(contentId: string): ViralContent | null;
    /**
     * Obtient tout le contenu viral du cache
     */
    getAllViralContent(threshold?: number): ViralContent[];
    /**
     * Met à jour le seuil de viralité
     */
    setViralThreshold(threshold: number): void;
    /**
     * Obtient les statistiques du cache
     */
    getCacheStats(): {
        totalContent: number;
        viralContent: number;
        averageViralScore: number;
        topPlatforms: Record<string, number>;
    };
    /**
     * Nettoie le cache des anciens contenus (plus de 7 jours)
     */
    cleanupOldContent(daysToKeep?: number): void;
    /**
     * Active la surveillance automatique
     */
    enableMonitoring(feedUrls: string[], intervalMs?: number): void;
}
export declare const viralDetectionService: ViralDetectionService;
export {};
//# sourceMappingURL=viral-detection.d.ts.map