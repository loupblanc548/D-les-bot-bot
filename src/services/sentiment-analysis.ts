import logger from "../utils/logger.js";
import { OpenAI } from "openai";

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

class SentimentAnalysisService {
  private openai: OpenAI | null = null;
  private reviewCache: Map<string, GameReview>;

  constructor() {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (apiKey) {
      this.openai = new OpenAI({
        apiKey,
        baseURL: "https://openrouter.ai/api/v1",
      });
      logger.info("[SentimentAnalysis] Service initialisé avec OpenRouter");
    } else {
      logger.warn("[SentimentAnalysis] OPENROUTER_API_KEY non configuré, service désactivé");
    }
    this.reviewCache = new Map();
  }

  /**
   * Analyse le sentiment d'un texte
   */
  async analyzeSentiment(text: string): Promise<SentimentResult> {
    if (!this.openai) {
      return {
        sentiment: "neutral",
        confidence: 0,
        emotions: { joy: 0, anger: 0, fear: 0, sadness: 0, surprise: 0 },
        keywords: [],
        summary: "Service IA non configuré",
      };
    }

    try {
      const prompt = `
Analyse le sentiment et les émotions de ce texte (probablement un commentaire sur un jeu vidéo) :

"${text.substring(0, 2000)}"

Fournis ta réponse au format JSON :
{
  "sentiment": "positive" | "neutral" | "negative",
  "confidence": 0-100,
  "emotions": {
    "joy": 0-100,
    "anger": 0-100,
    "fear": 0-100,
    "sadness": 0-100,
    "surprise": 0-100
  },
  "keywords": ["mot1", "mot2", "mot3"],
  "summary": "Résumé court de l'analyse"
}
      `.trim();

      const response = await this.openai.chat.completions.create({
        model: "anthropic/claude-3-haiku",
        messages: [
          {
            role: "system",
            content: "Tu es un expert en analyse de sentiment et d'émotions. Réponds uniquement en JSON valide.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
      });

      const content = response.choices[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);

      return {
        sentiment: parsed.sentiment || "neutral",
        confidence: parsed.confidence || 0,
        emotions: parsed.emotions || { joy: 0, anger: 0, fear: 0, sadness: 0, surprise: 0 },
        keywords: parsed.keywords || [],
        summary: parsed.summary || "Pas de résumé disponible",
      };

    } catch (error) {
      logger.error("[SentimentAnalysis] Erreur lors de l'analyse:", error);
      return {
        sentiment: "neutral",
        confidence: 0,
        emotions: { joy: 0, anger: 0, fear: 0, sadness: 0, surprise: 0 },
        keywords: [],
        summary: `Erreur lors de l'analyse: ${String(error)}`,
      };
    }
  }

  /**
   * Analyse plusieurs commentaires pour un jeu
   */
  async analyzeGameReviews(
    gameId: string,
    gameName: string,
    platform: string,
    comments: string[]
  ): Promise<GameReview> {
    logger.info(`[SentimentAnalysis] Analyse de ${comments.length} commentaires pour ${gameName}`);

    const reviews: SentimentResult[] = [];

    for (const comment of comments.slice(0, 10)) {
      const result = await this.analyzeSentiment(comment);
      reviews.push(result);
    }

    // Calculer le sentiment moyen
    const sentimentScores: number[] = reviews.map(r => {
      if (r.sentiment === "positive") return 1;
      if (r.sentiment === "negative") return -1;
      return 0;
    });

    const averageSentiment = sentimentScores.reduce((sum, score) => sum + score, 0) / sentimentScores.length;

    // Déterminer la recommandation
    let recommendation: "buy" | "wait" | "avoid";
    if (averageSentiment > 0.5) {
      recommendation = "buy";
    } else if (averageSentiment < -0.5) {
      recommendation = "avoid";
    } else {
      recommendation = "wait";
    }

    const gameReview: GameReview = {
      gameId,
      gameName,
      platform,
      reviews,
      averageSentiment,
      recommendation,
    };

    this.reviewCache.set(gameId, gameReview);
    return gameReview;
  }

  /**
   * Obtient l'analyse d'un jeu depuis le cache
   */
  getCachedReview(gameId: string): GameReview | null {
    return this.reviewCache.get(gameId) || null;
  }

  /**
   * Analyse les commentaires Reddit pour un jeu
   */
  async analyzeRedditComments(redditUrl: string): Promise<GameReview | null> {
    try {
      // Extraire l'ID du jeu depuis l'URL
      const gameId = this.extractGameIdFromUrl(redditUrl);
      if (!gameId) {
        logger.warn("[SentimentAnalysis] Impossible d'extraire l'ID du jeu depuis l'URL");
        return null;
      }

      // Simuler la récupération des commentaires (à remplacer par vraie intégration Reddit API)
      const comments = await this.fetchRedditComments(redditUrl);

      if (comments.length === 0) {
        logger.warn("[SentimentAnalysis] Aucun commentaire trouvé");
        return null;
      }

      return await this.analyzeGameReviews(
        gameId,
        "Jeu Reddit",
        "Reddit",
        comments
      );

    } catch (error) {
      logger.error("[SentimentAnalysis] Erreur lors de l'analyse Reddit:", error);
      return null;
    }
  }

  /**
   * Extrait l'ID du jeu depuis une URL Reddit
   */
  private extractGameIdFromUrl(url: string): string | null {
    // Simple extraction basée sur l'URL
    const match = url.match(/\/r\/[^/]+\/comments\/([^/]+)/);
    return match ? match[1] : null;
  }

  /**
   * Récupère les commentaires Reddit (simulé)
   */
  private async fetchRedditComments(redditUrl: string): Promise<string[]> {
    // À remplacer par vraie intégration Reddit API
    // Pour l'instant, retourne des commentaires simulés
    return [
      "Ce jeu est incroyable ! Les graphismes sont superbes.",
      "J'ai passé des heures dessus, vraiment addictif.",
      "Quelques bugs mais le gameplay est solide.",
      "Déçu par le manque de contenu post-fin.",
    ];
  }

  /**
   * Compare les sentiments de plusieurs jeux
   */
  compareGames(gameIds: string[]): Array<{ gameId: string; sentiment: number; recommendation: string }> {
    return gameIds.map(id => {
      const review = this.reviewCache.get(id);
      if (!review) {
        return { gameId: id, sentiment: 0, recommendation: "wait" };
      }
      return {
        gameId: id,
        sentiment: review.averageSentiment,
        recommendation: review.recommendation,
      };
    });
  }

  /**
   * Nettoie le cache des analyses
   */
  clearCache(): void {
    this.reviewCache.clear();
    logger.info("[SentimentAnalysis] Cache nettoyé");
  }

  /**
   * Obtient les statistiques du cache
   */
  getCacheStats(): {
    totalReviews: number;
    averageConfidence: number;
    sentimentDistribution: Record<string, number>;
  } {
    const reviews = Array.from(this.reviewCache.values());
    
    const averageConfidence = reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.reviews.reduce((s, rev) => s + rev.confidence, 0), 0) / 
          reviews.reduce((sum, r) => sum + r.reviews.length, 0)
      : 0;

    const sentimentDistribution: Record<string, number> = {
      positive: 0,
      neutral: 0,
      negative: 0,
    };

    for (const review of reviews) {
      for (const rev of review.reviews) {
        sentimentDistribution[rev.sentiment]++;
      }
    }

    return {
      totalReviews: reviews.length,
      averageConfidence,
      sentimentDistribution,
    };
  }
}

export const sentimentAnalysisService = new SentimentAnalysisService();
