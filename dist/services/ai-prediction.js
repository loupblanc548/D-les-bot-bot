import logger from "../utils/logger.js";
import Parser from "rss-parser";
import { OpenAI } from "openai";
class AIPredictionService {
    openai = null;
    historicalData = [];
    MAX_HISTORY = 100;
    constructor() {
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (apiKey) {
            this.openai = new OpenAI({
                apiKey,
                baseURL: "https://openrouter.ai/api/v1",
            });
            logger.info("[AIPrediction] Service initialisé avec OpenRouter");
        }
        else {
            logger.warn("[AIPrediction] OPENROUTER_API_KEY non configuré, service désactivé");
        }
    }
    /**
     * Ajoute une donnée historique
     */
    addHistoricalData(pattern) {
        this.historicalData.push(pattern);
        // Garder seulement les MAX_HISTORY dernières entrées
        if (this.historicalData.length > this.MAX_HISTORY) {
            this.historicalData = this.historicalData.slice(-this.MAX_HISTORY);
        }
    }
    /**
     * Analyse les tendances historiques
     */
    analyzeHistoricalTrends() {
        const platformCounts = this.historicalData.reduce((acc, deal) => {
            acc[deal.platform] = (acc[deal.platform] || 0) + 1;
            return acc;
        }, {});
        const avgPrice = this.historicalData.reduce((sum, deal) => sum + deal.price, 0) / this.historicalData.length;
        const recentDeals = this.historicalData.slice(-10);
        const recentPlatforms = recentDeals.map(d => d.platform).join(", ");
        return `
Historique des ${this.historicalData.length} dernières offres :
- Distribution par plateforme : ${JSON.stringify(platformCounts)}
- Prix moyen : ${avgPrice.toFixed(2)}€
- Plateformes récentes : ${recentPlatforms}
    `.trim();
    }
    /**
     * Prédit les prochaines offres avec IA
     */
    async predictNextOffers() {
        if (!this.openai) {
            return {
                predictedOffers: [],
                confidence: 0,
                reasoning: "Service IA non configuré",
                nextCheckDate: new Date(Date.now() + 3600000),
            };
        }
        if (this.historicalData.length < 5) {
            return {
                predictedOffers: [],
                confidence: 0,
                reasoning: "Pas assez de données historiques (minimum 5 requises)",
                nextCheckDate: new Date(Date.now() + 3600000),
            };
        }
        try {
            const trends = this.analyzeHistoricalTrends();
            const currentDate = new Date().toISOString().split('T')[0];
            const prompt = `
En tant qu'expert en gaming et offres digitales, analyse ces données historiques et prédis les 3-5 prochaines offres gratuites ou réductions importantes qui pourraient apparaître dans les 7 prochains jours.

${trends}

Date actuelle : ${currentDate}

Fournis ta réponse au format JSON :
{
  "predictedOffers": [
    {
      "title": "Titre prédit",
      "platform": "Plateforme (Steam/Epic/PlayStation/Xbox/Nintendo)",
      "probability": "Probabilité (haute/moyenne/faible)",
      "reasoning": "Pourquoi cette offre est probable"
    }
  ],
  "confidence": 0-100,
  "overallReasoning": "Explication globale"
}
      `.trim();
            const response = await this.openai.chat.completions.create({
                model: "anthropic/claude-3-haiku",
                messages: [
                    {
                        role: "system",
                        content: "Tu es un expert en gaming et analyse de tendances de offres digitales. Réponds uniquement en JSON valide.",
                    },
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
                temperature: 0.7,
                max_tokens: 1000,
            });
            const content = response.choices[0]?.message?.content || "{}";
            const parsed = JSON.parse(content);
            return {
                predictedOffers: parsed.predictedOffers?.map((p) => p.title) || [],
                confidence: parsed.confidence || 0,
                reasoning: parsed.overallReasoning || "Pas de raisonnement disponible",
                nextCheckDate: new Date(Date.now() + 86400000), // 24h
            };
        }
        catch (error) {
            logger.error("[AIPrediction] Erreur lors de la prédiction:", error);
            return {
                predictedOffers: [],
                confidence: 0,
                reasoning: `Erreur lors de la prédiction: ${String(error)}`,
                nextCheckDate: new Date(Date.now() + 3600000),
            };
        }
    }
    /**
     * Analyse un flux RSS et extrait les patterns
     */
    async analyzeRSSFeed(feedUrl) {
        try {
            const parser = new Parser();
            const feed = await parser.parseURL(feedUrl);
            if (!feed.items)
                return;
            for (const item of feed.items.slice(0, 5)) {
                const title = item.title || "";
                const platform = this.detectPlatform(title);
                const price = this.extractPrice(title);
                this.addHistoricalData({
                    title,
                    platform,
                    price,
                    timestamp: Date.now(),
                    source: feedUrl,
                });
            }
            logger.info(`[AIPrediction] ${feed.items.length} items analysés depuis ${feedUrl}`);
        }
        catch (error) {
            logger.error(`[AIPrediction] Erreur lors de l'analyse de ${feedUrl}:`, error);
        }
    }
    /**
     * Détecte la plateforme depuis le titre
     */
    detectPlatform(title) {
        const lower = title.toLowerCase();
        if (lower.includes("epic") || lower.includes("epic games"))
            return "Epic Games";
        if (lower.includes("steam"))
            return "Steam";
        if (lower.includes("playstation") || lower.includes("ps4") || lower.includes("ps5"))
            return "PlayStation";
        if (lower.includes("xbox"))
            return "Xbox";
        if (lower.includes("nintendo") || lower.includes("switch"))
            return "Nintendo";
        return "Unknown";
    }
    /**
     * Extrait le prix depuis le titre
     */
    extractPrice(title) {
        const priceMatch = title.match(/(\d+\.?\d*)\s*(?:€|EUR|dollars?|\$)/i);
        if (priceMatch) {
            return parseFloat(priceMatch[1]);
        }
        return 0; // Gratuit
    }
    /**
     * Obtient les statistiques historiques
     */
    getHistoricalStats() {
        const platformDistribution = this.historicalData.reduce((acc, deal) => {
            acc[deal.platform] = (acc[deal.platform] || 0) + 1;
            return acc;
        }, {});
        const averagePrice = this.historicalData.length > 0
            ? this.historicalData.reduce((sum, deal) => sum + deal.price, 0) / this.historicalData.length
            : 0;
        return {
            totalDeals: this.historicalData.length,
            platformDistribution,
            averagePrice,
            recentActivity: this.historicalData.slice(-10),
        };
    }
}
export const aiPredictionService = new AIPredictionService();
//# sourceMappingURL=ai-prediction.js.map