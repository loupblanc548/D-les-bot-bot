import logger from "../utils/logger";
import Parser from "rss-parser";
import { OpenAI } from "openai";

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

class ViralDetectionService {
  private openai: OpenAI | null = null;
  private contentCache: Map<string, ViralContent>;
  private viralThreshold: number = 70;

  constructor() {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (apiKey) {
      this.openai = new OpenAI({
        apiKey,
        baseURL: "https://openrouter.ai/api/v1",
      });
      logger.info("[ViralDetection] Service initialisé avec OpenRouter");
    } else {
      logger.warn("[ViralDetection] OPENROUTER_API_KEY non configuré, service limité");
    }
    this.contentCache = new Map();
  }

  /**
   * Analyse un contenu pour prédire son potentiel viral
   */
  async analyzeViralPotential(content: {
    title: string;
    content?: string;
    platform: string;
    url: string;
  }): Promise<ViralContent> {
    const contentId = this.generateContentId(content.url);

    if (!this.openai) {
      // Fallback sans IA
      return {
        contentId,
        title: content.title,
        url: content.url,
        platform: content.platform,
        viralScore: 50,
        predictedReach: 1000,
        engagementRate: 5,
        timestamp: Date.now(),
        metadata: {},
      };
    }

    try {
      const prompt = `
En tant qu'expert en marketing viral et analyse de contenu, évalue le potentiel viral de ce contenu :

Titre: "${content.title}"
Plateforme: ${content.platform}
Contenu: "${content.content?.substring(0, 500) || "Non disponible"}"

Analyse les facteurs suivants :
- Originalité du titre
- Pertinence pour l'audience cible
- Potentiel de partage
- Émotionnalité du contenu
- Timing actuel

Fournis ta réponse au format JSON :
{
  "viralScore": 0-100,
  "predictedReach": nombre estimé de vues,
  "engagementRate": pourcentage estimé d'engagement,
  "factors": ["facteur1", "facteur2", "facteur3"],
  "recommendation": "conseil pour maximiser le potentiel viral"
}
      `.trim();

      const response = await this.openai.chat.completions.create({
        model: "anthropic/claude-3-haiku",
        messages: [
          {
            role: "system",
            content: "Tu es un expert en analyse de contenu viral. Réponds uniquement en JSON valide.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 500,
      });

      const parsed = JSON.parse(response.choices[0]?.message?.content || "{}");

      const viralContent: ViralContent = {
        contentId,
        title: content.title,
        url: content.url,
        platform: content.platform,
        viralScore: parsed.viralScore || 50,
        predictedReach: parsed.predictedReach || 1000,
        engagementRate: parsed.engagementRate || 5,
        timestamp: Date.now(),
        metadata: {
          factors: parsed.factors || [],
          recommendation: parsed.recommendation || "",
        },
      };

      this.contentCache.set(contentId, viralContent);
      return viralContent;

    } catch (error) {
      logger.error("[ViralDetection] Erreur lors de l'analyse IA:", error);
      
      // Fallback
      const fallbackContent: ViralContent = {
        contentId,
        title: content.title,
        url: content.url,
        platform: content.platform,
        viralScore: 50,
        predictedReach: 1000,
        engagementRate: 5,
        timestamp: Date.now(),
        metadata: {},
      };

      this.contentCache.set(contentId, fallbackContent);
      return fallbackContent;
    }
  }

  /**
   * Analyse les flux RSS pour détecter le contenu viral potentiel
   */
  async scanRSSFeeds(feedUrls: string[]): Promise<ViralContent[]> {
    const parser = new Parser();
    const viralContents: ViralContent[] = [];

    for (const feedUrl of feedUrls) {
      try {
        const feed = await parser.parseURL(feedUrl);
        
        if (!feed.items) continue;

        for (const item of feed.items.slice(0, 5)) {
          const content = await this.analyzeViralPotential({
            title: item.title || "",
            content: item.contentSnippet || item.content,
            platform: this.extractPlatform(feedUrl),
            url: item.link || "",
          });

          if (content.viralScore >= this.viralThreshold) {
            viralContents.push(content);
          }
        }

      } catch (error) {
        logger.error(`[ViralDetection] Erreur lors de l'analyse de ${feedUrl}:`, error);
      }
    }

    logger.info(`[ViralDetection] ${viralContents.length} contenu(s) viral(aux) détecté(s)`);
    return viralContents.sort((a, b) => b.viralScore - a.viralScore);
  }

  /**
   * Extrait la plateforme depuis l'URL
   */
  private extractPlatform(url: string): string {
    if (url.includes("reddit")) return "Reddit";
    if (url.includes("twitter")) return "Twitter";
    if (url.includes("youtube")) return "YouTube";
    return "Unknown";
  }

  /**
   * Génère un ID de contenu
   */
  private generateContentId(url: string): string {
    return Buffer.from(url).toString("base64").substring(0, 30);
  }

  /**
   * Obtient le contenu viral depuis le cache
   */
  getCachedViralContent(contentId: string): ViralContent | null {
    return this.contentCache.get(contentId) || null;
  }

  /**
   * Obtient tout le contenu viral du cache
   */
  getAllViralContent(threshold: number = 70): ViralContent[] {
    return Array.from(this.contentCache.values())
      .filter(c => c.viralScore >= threshold)
      .sort((a, b) => b.viralScore - a.viralScore);
  }

  /**
   * Met à jour le seuil de viralité
   */
  setViralThreshold(threshold: number): void {
    this.viralThreshold = Math.max(0, Math.min(100, threshold));
    logger.info(`[ViralDetection] Seuil de viralité mis à jour: ${this.viralThreshold}`);
  }

  /**
   * Obtient les statistiques du cache
   */
  getCacheStats(): {
    totalContent: number;
    viralContent: number;
    averageViralScore: number;
    topPlatforms: Record<string, number>;
  } {
    const contents = Array.from(this.contentCache.values());
    
    const viralContent = contents.filter(c => c.viralScore >= this.viralThreshold);
    const averageViralScore = contents.length > 0
      ? contents.reduce((sum, c) => sum + c.viralScore, 0) / contents.length
      : 0;

    const topPlatforms: Record<string, number> = {};
    for (const content of contents) {
      topPlatforms[content.platform] = (topPlatforms[content.platform] || 0) + 1;
    }

    return {
      totalContent: contents.length,
      viralContent: viralContent.length,
      averageViralScore,
      topPlatforms,
    };
  }

  /**
   * Nettoie le cache des anciens contenus (plus de 7 jours)
   */
  cleanupOldContent(daysToKeep: number = 7): void {
    const cutoff = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;

    for (const [id, content] of this.contentCache.entries()) {
      if (content.timestamp < cutoff) {
        this.contentCache.delete(id);
      }
    }

    logger.debug(`[ViralDetection] Cache nettoyé (contenus > ${daysToKeep} jours supprimés)`);
  }

  /**
   * Active la surveillance automatique
   */
  enableMonitoring(feedUrls: string[], intervalMs: number = 3600000): void {
    setInterval(() => {
      this.scanRSSFeeds(feedUrls);
      this.cleanupOldContent();
    }, intervalMs);

    logger.info(`[ViralDetection] Surveillance activée (intervalle: ${intervalMs}ms)`);
  }
}

export const viralDetectionService = new ViralDetectionService();
