"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.trendDetectionService = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
const rss_parser_1 = __importDefault(require("rss-parser"));
const openai_1 = require("openai");
class TrendDetectionService {
    openai = null;
    trendHistory;
    currentTrends;
    constructor() {
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (apiKey) {
            this.openai = new openai_1.OpenAI({
                apiKey,
                baseURL: "https://openrouter.ai/api/v1",
            });
            logger_1.default.info("[TrendDetection] Service initialisé avec OpenRouter");
        }
        else {
            logger_1.default.warn("[TrendDetection] OPENROUTER_API_KEY non configuré, service limité");
        }
        this.trendHistory = new Map();
        this.currentTrends = new Map();
    }
    /**
     * Analyse les flux RSS pour détecter les tendances
     */
    async analyzeRSSFeeds(feedUrls) {
        const parser = new rss_parser_1.default();
        const keywordCounts = new Map();
        for (const feedUrl of feedUrls) {
            try {
                const feed = await parser.parseURL(feedUrl);
                if (!feed.items)
                    continue;
                for (const item of feed.items) {
                    const title = item.title || "";
                    const keywords = this.extractKeywords(title);
                    for (const keyword of keywords) {
                        keywordCounts.set(keyword, (keywordCounts.get(keyword) || 0) + 1);
                    }
                }
            }
            catch (error) {
                logger_1.default.error(`[TrendDetection] Erreur lors de l'analyse de ${feedUrl}:`, error);
            }
        }
        // Mettre à jour les tendances actuelles
        const now = Date.now();
        for (const [keyword, mentions] of keywordCounts) {
            const previousData = this.currentTrends.get(keyword);
            const growthRate = previousData
                ? ((mentions - previousData.mentions) / previousData.mentions) * 100
                : 0;
            this.currentTrends.set(keyword, {
                keyword,
                mentions,
                growthRate,
                platforms: ["Reddit", "Twitter"],
                lastUpdated: now,
            });
        }
        logger_1.default.info(`[TrendDetection] ${this.currentTrends.size} tendance(s) analysée(s)`);
    }
    /**
     * Extrait les mots-clés d'un texte
     */
    extractKeywords(text) {
        const words = text.toLowerCase()
            .replace(/[^\w\s]/g, "")
            .split(/\s+/)
            .filter(word => word.length > 3);
        const stopWords = new Set(["le", "la", "les", "un", "une", "des", "et", "ou", "mais", "pour", "avec", "sur", "dans"]);
        return words.filter(word => !stopWords.has(word));
    }
    /**
     * Détecte les tendances émergentes avec IA
     */
    async detectEmergingTrends() {
        if (!this.openai) {
            return [];
        }
        const trends = Array.from(this.currentTrends.values())
            .filter(t => t.growthRate > 50) // Taux de croissance > 50%
            .slice(0, 10);
        if (trends.length === 0) {
            return [];
        }
        try {
            const trendsData = trends.map(t => ({
                keyword: t.keyword,
                mentions: t.mentions,
                growthRate: t.growthRate,
            }));
            const prompt = `
En tant qu'expert en tendances gaming et digitales, analyse ces données de tendances :

${JSON.stringify(trendsData, null, 2)}

Identifie les 3-5 tendances émergentes les plus prometteuses et fournis une prédiction.

Fournis ta réponse au format JSON :
{
  "emergingTrends": [
    {
      "keyword": "mot-clé",
      "confidence": 0-100,
      "prediction": "prédiction détaillée",
      "relatedKeywords": ["mot1", "mot2"],
      "estimatedPeak": "date ISO"
    }
  ]
}
      `.trim();
            const response = await this.openai.chat.completions.create({
                model: "anthropic/claude-3-haiku",
                messages: [
                    {
                        role: "system",
                        content: "Tu es un expert en analyse de tendances. Réponds uniquement en JSON valide.",
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
            return parsed.emergingTrends || [];
        }
        catch (error) {
            logger_1.default.error("[TrendDetection] Erreur lors de la détection IA:", error);
            return [];
        }
    }
    /**
     * Obtient les tendances actuelles
     */
    getCurrentTrends(limit = 20) {
        return Array.from(this.currentTrends.values())
            .sort((a, b) => b.mentions - a.mentions)
            .slice(0, limit);
    }
    /**
     * Obtient les tendances en croissance rapide
     */
    getFastGrowingTrends(threshold = 50) {
        return Array.from(this.currentTrends.values())
            .filter(t => t.growthRate > threshold)
            .sort((a, b) => b.growthRate - a.growthRate);
    }
    /**
     * Sauvegarde l'historique des tendances
     */
    saveTrendHistory() {
        const now = Date.now();
        const snapshot = Array.from(this.currentTrends.values());
        this.trendHistory.set(now.toString(), snapshot);
        // Nettoyer l'historique (garder 30 jours)
        const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
        for (const [timestamp] of this.trendHistory.keys()) {
            if (parseInt(timestamp) < thirtyDaysAgo) {
                this.trendHistory.delete(timestamp);
            }
        }
    }
    /**
     * Obtient l'historique d'un mot-clé
     */
    getKeywordHistory(keyword) {
        const history = [];
        for (const snapshot of this.trendHistory.values()) {
            const data = snapshot.find(t => t.keyword === keyword);
            if (data) {
                history.push(data);
            }
        }
        return history.sort((a, b) => a.lastUpdated - b.lastUpdated);
    }
    /**
     * Active la surveillance automatique
     */
    enableMonitoring(intervalMs = 3600000) {
        setInterval(() => {
            this.analyzeRSSFeeds([
                "https://www.reddit.com/r/gaming/new/.rss",
                "https://www.reddit.com/r/Games/new/.rss",
            ]);
            this.saveTrendHistory();
        }, intervalMs);
        logger_1.default.info(`[TrendDetection] Surveillance activée (intervalle: ${intervalMs}ms)`);
    }
    /**
     * Obtient les statistiques globales
     */
    getGlobalStats() {
        const trends = Array.from(this.currentTrends.values());
        const averageGrowthRate = trends.length > 0
            ? trends.reduce((sum, t) => sum + t.growthRate, 0) / trends.length
            : 0;
        const topKeywords = trends
            .sort((a, b) => b.mentions - a.mentions)
            .slice(0, 10)
            .map(t => t.keyword);
        return {
            totalTrends: trends.length,
            averageGrowthRate,
            topKeywords,
        };
    }
}
exports.trendDetectionService = new TrendDetectionService();
//# sourceMappingURL=trend-detection.js.map