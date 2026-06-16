interface SentimentResult {
    sentiment: "positive" | "neutral" | "negative";
    confidence: number;
    emotions: {
        joy: number;
        anger: number;
        fear: number;
        sadness: number;
        surprise: number;
    };
    keywords: string[];
    summary: string;
}
interface GameReview {
    gameId: string;
    gameName: string;
    platform: string;
    reviews: SentimentResult[];
    averageSentiment: number;
    recommendation: "buy" | "wait" | "avoid";
}
declare class SentimentAnalysisService {
    private openai;
    private reviewCache;
    constructor();
    /**
     * Analyse le sentiment d'un texte
     */
    analyzeSentiment(text: string): Promise<SentimentResult>;
    /**
     * Analyse plusieurs commentaires pour un jeu
     */
    analyzeGameReviews(gameId: string, gameName: string, platform: string, comments: string[]): Promise<GameReview>;
    /**
     * Obtient l'analyse d'un jeu depuis le cache
     */
    getCachedReview(gameId: string): GameReview | null;
    /**
     * Analyse les commentaires Reddit pour un jeu
     */
    analyzeRedditComments(redditUrl: string): Promise<GameReview | null>;
    /**
     * Extrait l'ID du jeu depuis une URL Reddit
     */
    private extractGameIdFromUrl;
    /**
     * Récupère les commentaires Reddit (simulé)
     */
    private fetchRedditComments;
    /**
     * Compare les sentiments de plusieurs jeux
     */
    compareGames(gameIds: string[]): Array<{
        gameId: string;
        sentiment: number;
        recommendation: string;
    }>;
    /**
     * Nettoie le cache des analyses
     */
    clearCache(): void;
    /**
     * Obtient les statistiques du cache
     */
    getCacheStats(): {
        totalReviews: number;
        averageConfidence: number;
        sentimentDistribution: Record<string, number>;
    };
}
export declare const sentimentAnalysisService: SentimentAnalysisService;
export {};
//# sourceMappingURL=sentiment-analysis.d.ts.map