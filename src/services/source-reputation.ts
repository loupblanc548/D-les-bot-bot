import logger from "../utils/logger.js";
import prisma from "../prisma.js";

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

class SourceReputationService {
  private reputationCache: Map<string, SourceReputation>;

  constructor() {
    this.reputationCache = new Map();
    logger.info("[SourceReputation] Service initialisé");
  }

  /**
   * Enregistre une source
   */
  async registerSource(sourceId: string, sourceName: string, metadata: Record<string, any> = {}): Promise<void> {
    const reputation: SourceReputation = {
      sourceId,
      sourceName,
      reliabilityScore: 50,
      accuracyScore: 50,
      totalDeals: 0,
      successfulDeals: 0,
      failedDeals: 0,
      lastUpdated: Date.now(),
      metadata,
    };

    this.reputationCache.set(sourceId, reputation);

    await prisma.sourceReputation.upsert({
      where: { sourceId },
      create: reputation as any,
      update: reputation as any,
    });

    logger.info(`[SourceReputation] Source enregistrée: ${sourceName}`);
  }

  /**
   * Signale un deal réussi pour une source
   */
  async reportSuccessfulDeal(sourceId: string): Promise<void> {
    const reputation = this.reputationCache.get(sourceId);
    if (!reputation) return;

    reputation.totalDeals++;
    reputation.successfulDeals++;
    reputation.reliabilityScore = Math.min(100, reputation.reliabilityScore + 2);
    reputation.accuracyScore = Math.min(100, reputation.accuracyScore + 3);
    reputation.lastUpdated = Date.now();

    this.reputationCache.set(sourceId, reputation);
    await this.saveReputation(sourceId);

    logger.debug(`[SourceReputation] Deal réussi pour ${sourceId}: score ${reputation.reliabilityScore}`);
  }

  /**
   * Signale un deal échoué pour une source
   */
  async reportFailedDeal(sourceId: string): Promise<void> {
    const reputation = this.reputationCache.get(sourceId);
    if (!reputation) return;

    reputation.totalDeals++;
    reputation.failedDeals++;
    reputation.reliabilityScore = Math.max(0, reputation.reliabilityScore - 5);
    reputation.accuracyScore = Math.max(0, reputation.accuracyScore - 5);
    reputation.lastUpdated = Date.now();

    this.reputationCache.set(sourceId, reputation);
    await this.saveReputation(sourceId);

    logger.debug(`[SourceReputation] Deal échoué pour ${sourceId}: score ${reputation.reliabilityScore}`);
  }

  /**
   * Obtient la réputation d'une source
   */
  getSourceReputation(sourceId: string): SourceReputation | null {
    return this.reputationCache.get(sourceId) || null;
  }

  /**
   * Obtient les sources les plus fiables
   */
  getMostReliableSources(limit: number = 10): SourceReputation[] {
    return Array.from(this.reputationCache.values())
      .sort((a, b) => b.reliabilityScore - a.reliabilityScore)
      .slice(0, limit);
  }

  /**
   * Obtient les sources les moins fiables
   */
  getLeastReliableSources(limit: number = 10): SourceReputation[] {
    return Array.from(this.reputationCache.values())
      .filter(s => s.totalDeals >= 5)
      .sort((a, b) => a.reliabilityScore - b.reliabilityScore)
      .slice(0, limit);
  }

  /**
   * Calcule le taux de succès d'une source
   */
  getSuccessRate(sourceId: string): number {
    const reputation = this.reputationCache.get(sourceId);
    if (!reputation || reputation.totalDeals === 0) return 0;

    return (reputation.successfulDeals / reputation.totalDeals) * 100;
  }

  /**
   * Sauvegarde la réputation dans Prisma
   */
  private async saveReputation(sourceId: string): Promise<void> {
    const reputation = this.reputationCache.get(sourceId);
    if (!reputation) return;

    await prisma.sourceReputation.upsert({
      where: { sourceId },
      create: reputation as any,
      update: reputation as any,
    });
  }

  /**
   * Charge les réputations depuis Prisma
   */
  async loadReputationsFromPrisma(): Promise<void> {
    const reputations = await prisma.sourceReputation.findMany();
    
    for (const reputation of reputations) {
      this.reputationCache.set(reputation.sourceId, reputation as unknown as SourceReputation);
    }

    logger.info(`[SourceReputation] ${reputations.length} réputation(s) chargée(s) depuis Prisma`);
  }

  /**
   * Réinitialise les scores (pour maintenance)
   */
  async resetScores(sourceId: string): Promise<void> {
    const reputation = this.reputationCache.get(sourceId);
    if (!reputation) return;

    reputation.reliabilityScore = 50;
    reputation.accuracyScore = 50;
    reputation.lastUpdated = Date.now();

    this.reputationCache.set(sourceId, reputation);
    await this.saveReputation(sourceId);

    logger.info(`[SourceReputation] Scores réinitialisés pour ${sourceId}`);
  }

  /**
   * Obtient les statistiques globales
   */
  getGlobalStats(): {
    totalSources: number;
    averageReliability: number;
    averageAccuracy: number;
    totalDeals: number;
    successRate: number;
  } {
    const sources = Array.from(this.reputationCache.values());
    
    const averageReliability = sources.length > 0
      ? sources.reduce((sum, s) => sum + s.reliabilityScore, 0) / sources.length
      : 0;

    const averageAccuracy = sources.length > 0
      ? sources.reduce((sum, s) => sum + s.accuracyScore, 0) / sources.length
      : 0;

    const totalDeals = sources.reduce((sum, s) => sum + s.totalDeals, 0);
    const successfulDeals = sources.reduce((sum, s) => sum + s.successfulDeals, 0);
    const successRate = totalDeals > 0 ? (successfulDeals / totalDeals) * 100 : 0;

    return {
      totalSources: sources.length,
      averageReliability,
      averageAccuracy,
      totalDeals,
      successRate,
    };
  }
}

export const sourceReputationService = new SourceReputationService();
