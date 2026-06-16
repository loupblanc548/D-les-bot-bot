import logger from "../utils/logger";
import { Client, TextChannel, EmbedBuilder } from "discord.js";
import { config } from "../config";
import { socialGraphService } from "./social-graph";
import { behaviorDetectionService } from "./behavior-detection";
import { trendDetectionService } from "./trend-detection";
import { sourceReputationService } from "./source-reputation";

interface ReportData {
  period: "daily" | "weekly" | "monthly";
  startDate: Date;
  endDate: Date;
  metrics: {
    totalMessages: number;
    activeUsers: number;
    newMembers: number;
    alertsTriggered: number;
    dealsDetected: number;
  };
  topUsers: Array<{ userId: string; activity: number }>;
  topTrends: Array<{ keyword: string; mentions: number }>;
  recommendations: string[];
}


interface BehaviorAlert {
  severity: string;
  keyword?: string;
}

interface TrendData {
  growthRate: number;
  keyword: string;
}

class ReportGeneratorService {
  private reportCache: Map<string, ReportData>;

  constructor() {
    this.reportCache = new Map();
    logger.info("[ReportGenerator] Service initialisé");
  }

  /**
   * Génère un rapport quotidien
   */
  async generateDailyReport(client: Client): Promise<ReportData> {
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    return this.generateReport(client, "daily", startDate, endDate);
  }

  /**
   * Génère un rapport hebdomadaire
   */
  async generateWeeklyReport(client: Client): Promise<ReportData> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    return this.generateReport(client, "weekly", startDate, endDate);
  }

  /**
   * Génère un rapport mensuel
   */
  async generateMonthlyReport(client: Client): Promise<ReportData> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 1);

    return this.generateReport(client, "monthly", startDate, endDate);
  }

  /**
   * Génère un rapport
   */
  private async generateReport(
    client: Client,
    period: "daily" | "weekly" | "monthly",
    startDate: Date,
    endDate: Date
  ): Promise<ReportData> {
    logger.info(`[ReportGenerator] Génération rapport ${period} du ${startDate.toISOString()} au ${endDate.toISOString()}`);

    // Collecter les données
    const graphReport = socialGraphService.generateGraphReport();
    const behaviorAlerts = behaviorDetectionService.getRecentAlerts(24);
    const trends = trendDetectionService.getCurrentTrends(10);
    const sourceStats = sourceReputationService.getGlobalStats();

    const reportData: ReportData = {
      period,
      startDate,
      endDate,
      metrics: {
        totalMessages: 0, // À implémenter avec tracking des messages
        activeUsers: graphReport.totalNodes,
        newMembers: 0, // À implémenter avec tracking des joins
        alertsTriggered: behaviorAlerts.length,
        dealsDetected: sourceStats.totalDeals,
      },
      topUsers: graphReport.mostConnectedUsers.map(u => ({
        userId: u.id,
        activity: u.connections,
      })),
      topTrends: trends.map(t => ({
        keyword: t.keyword,
        mentions: t.mentions,
      })),
      recommendations: this.generateRecommendations(graphReport, behaviorAlerts, trends),
    };

    // Mettre en cache
    const cacheKey = `${period}-${startDate.toISOString()}`;
    this.reportCache.set(cacheKey, reportData);

    return reportData;
  }

  /**
   * Génère des recommandations basées sur les données
   */
  private generateRecommendations(
    graphReport: Record<string, unknown>,
    behaviorAlerts: BehaviorAlert[],
    trends: TrendData[]
  ): string[] {
    const recommendations: string[] = [];

    // Recommandations basées sur les alertes
    const criticalAlerts = behaviorAlerts.filter(a => a.severity === "critical");
    if (criticalAlerts.length > 0) {
      recommendations.push(`${criticalAlerts.length} alerte(s) critique(s) nécessitent une attention immédiate`);
    }

    // Recommandations basées sur les tendances
    const fastGrowingTrends = trends.filter(t => t.growthRate > 100);
    if (fastGrowingTrends.length > 0) {
      recommendations.push(`Surveiller les tendances en croissance rapide: ${fastGrowingTrends.map(t => t.keyword).join(", ")}`);
    }

    // Recommandations basées sur le graphe
    if ((graphReport as Record<string, any>).totalNodes > 100) {
      recommendations.push("Considérer la création de sous-communautés pour mieux gérer la croissance");
    }

    return recommendations;
  }

  /**
   * Envoie le rapport via Discord
   */
  async sendReport(client: Client, reportData: ReportData): Promise<void> {
    if (!config.logChannel) {
      logger.error("[ReportGenerator] Channel de logs non configuré");
      return;
    }

    const channel = client.channels.cache.get(config.logChannel) as TextChannel;
    if (!channel || !channel.isTextBased()) {
      logger.error("[ReportGenerator] Channel non disponible");
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`📊 Rapport ${reportData.period === "daily" ? "Quotidien" : reportData.period === "weekly" ? "Hebdomadaire" : "Mensuel"}`)
      .setDescription(`Période: ${reportData.startDate.toLocaleDateString()} - ${reportData.endDate.toLocaleDateString()}`)
      .setColor(0x00ff00)
      .addFields(
        {
          name: "📈 Métriques",
          value: `
**Utilisateurs actifs**: ${reportData.metrics.activeUsers}
**Alertes déclenchées**: ${reportData.metrics.alertsTriggered}
**Offres détectées**: ${reportData.metrics.dealsDetected}
          `.trim(),
          inline: false,
        },
        {
          name: "👥 Top Utilisateurs",
          value: reportData.topUsers.slice(0, 5)
            .map(u => `<@${u.userId}>: ${u.activity} connexions`)
            .join("\n") || "Aucune donnée",
          inline: true,
        },
        {
          name: "🔥 Top Tendances",
          value: reportData.topTrends.slice(0, 5)
            .map(t => `${t.keyword}: ${t.mentions} mentions`)
            .join("\n") || "Aucune donnée",
          inline: true,
        }
      )
      .setTimestamp()
      .setFooter({ text: "Rapport généré automatiquement" });

    if (reportData.recommendations.length > 0) {
      embed.addFields({
        name: "💡 Recommandations",
        value: reportData.recommendations.join("\n"),
        inline: false,
      });
    }

    try {
      await channel.send({ embeds: [embed] });
      logger.info(`[ReportGenerator] Rapport ${reportData.period} envoyé`);
    } catch (error) {
      logger.error("[ReportGenerator] Erreur lors de l'envoi du rapport:", error);
    }
  }

  /**
   * Génère et envoie un rapport PDF (simulé)
   */
  async generatePDFReport(reportData: ReportData): Promise<string> {
    // Dans une vraie implémentation, utiliser une librairie comme pdfkit ou puppeteer
    const reportContent = `
RAPPORT ${reportData.period.toUpperCase()}
=============================

Période: ${reportData.startDate.toISOString()} - ${reportData.endDate.toISOString()}

MÉTRIQUES
---------
Utilisateurs actifs: ${reportData.metrics.activeUsers}
Alertes déclenchées: ${reportData.metrics.alertsTriggered}
Offres détectées: ${reportData.metrics.dealsDetected}

TOP UTILISATEURS
----------------
${reportData.topUsers.map(u => `- ${u.userId}: ${u.activity} connexions`).join("\n")}

TOP TENDANCES
-------------
${reportData.topTrends.map(t => `- ${t.keyword}: ${t.mentions} mentions`).join("\n")}

RECOMMANDATIONS
---------------
${reportData.recommendations.join("\n")}
    `.trim();

    logger.info("[ReportGenerator] Rapport PDF généré (simulé)");
    return reportContent;
  }

  /**
   * Active la génération automatique de rapports
   */
  enableAutoReporting(client: Client, period: "daily" | "weekly" | "monthly"): void {
    let intervalMs: number;

    switch (period) {
      case "daily":
        intervalMs = 24 * 60 * 60 * 1000;
        break;
      case "weekly":
        intervalMs = 7 * 24 * 60 * 60 * 1000;
        break;
      case "monthly":
        intervalMs = 30 * 24 * 60 * 60 * 1000;
        break;
    }

    setInterval(async () => {
      let reportData: ReportData;

      switch (period) {
        case "daily":
          reportData = await this.generateDailyReport(client);
          break;
        case "weekly":
          reportData = await this.generateWeeklyReport(client);
          break;
        case "monthly":
          reportData = await this.generateMonthlyReport(client);
          break;
      }

      await this.sendReport(client, reportData);
    }, intervalMs);

    logger.info(`[ReportGenerator] Auto-reporting activé (période: ${period})`);
  }

  /**
   * Obtient un rapport depuis le cache
   */
  getCachedReport(period: "daily" | "weekly" | "monthly", date: Date): ReportData | null {
    const cacheKey = `${period}-${date.toISOString()}`;
    return this.reportCache.get(cacheKey) || null;
  }

  /**
   * Nettoie le cache des anciens rapports
   */
  cleanupOldReports(daysToKeep: number = 30): void {
    const cutoff = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;

    for (const [key, report] of this.reportCache.entries()) {
      if (report.endDate.getTime() < cutoff) {
        this.reportCache.delete(key);
      }
    }

    logger.debug(`[ReportGenerator] Cache nettoyé (rapports > ${daysToKeep} jours supprimés)`);
  }
}

export const reportGeneratorService = new ReportGeneratorService();
