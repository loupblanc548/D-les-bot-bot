interface SourceReputation {
    sourceId: string;
    sourceName: string;
    reliabilityScore: number;
    accuracyScore: number;
    totalDeals: number;
    successfulDeals: number;
    failedDeals: number;
    lastUpdated: number;
    metadata: Record<string, any>;
}
declare class SourceReputationService {
    private reputationCache;
    constructor();
    /**
     * Enregistre une source
     */
    registerSource(sourceId: string, sourceName: string, metadata?: Record<string, any>): Promise<void>;
    /**
     * Signale un deal réussi pour une source
     */
    reportSuccessfulDeal(sourceId: string): Promise<void>;
    /**
     * Signale un deal échoué pour une source
     */
    reportFailedDeal(sourceId: string): Promise<void>;
    /**
     * Obtient la réputation d'une source
     */
    getSourceReputation(sourceId: string): SourceReputation | null;
    /**
     * Obtient les sources les plus fiables
     */
    getMostReliableSources(limit?: number): SourceReputation[];
    /**
     * Obtient les sources les moins fiables
     */
    getLeastReliableSources(limit?: number): SourceReputation[];
    /**
     * Calcule le taux de succès d'une source
     */
    getSuccessRate(sourceId: string): number;
    /**
     * Sauvegarde la réputation dans Prisma
     */
    private saveReputation;
    /**
     * Charge les réputations depuis Prisma
     */
    loadReputationsFromPrisma(): Promise<void>;
    /**
     * Réinitialise les scores (pour maintenance)
     */
    resetScores(sourceId: string): Promise<void>;
    /**
     * Obtient les statistiques globales
     */
    getGlobalStats(): {
        totalSources: number;
        averageReliability: number;
        averageAccuracy: number;
        totalDeals: number;
        successRate: number;
    };
}
export declare const sourceReputationService: SourceReputationService;
export {};
//# sourceMappingURL=source-reputation.d.ts.map