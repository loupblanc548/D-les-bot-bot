"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportGeneratorService = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
const discord_js_1 = require("discord.js");
const config_1 = require("../config");
const social_graph_1 = require("./social-graph");
const behavior_detection_1 = require("./behavior-detection");
const trend_detection_1 = require("./trend-detection");
const source_reputation_1 = require("./source-reputation");
class ReportGeneratorService {
    reportCache;
    constructor() {
        this.reportCache = new Map();
        logger_1.default.info("[ReportGenerator] Service initialisé");
    }
    /**
     * Génère un rapport quotidien
     */
    async generateDailyReport(client) {
        const startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
        return this.generateReport(client, "daily", startDate, endDate);
    }
    /**
     * Génère un rapport hebdomadaire
     */
    async generateWeeklyReport(client) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        return this.generateReport(client, "weekly", startDate, endDate);
    }
    /**
     * Génère un rapport mensuel
     */
    async generateMonthlyReport(client) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1);
        return this.generateReport(client, "monthly", startDate, endDate);
    }
    /**
     * Génère un rapport
     */
    async generateReport(client, period, startDate, endDate) {
        logger_1.default.info(`[ReportGenerator] Génération rapport ${period} du ${startDate.toISOString()} au ${endDate.toISOString()}`);
        // Collecter les données
        const graphReport = social_graph_1.socialGraphService.generateGraphReport();
        const behaviorAlerts = behavior_detection_1.behaviorDetectionService.getRecentAlerts(24);
        const trends = trend_detection_1.trendDetectionService.getCurrentTrends(10);
        const sourceStats = source_reputation_1.sourceReputationService.getGlobalStats();
        const reportData = {
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
    generateRecommendations(graphReport, behaviorAlerts, trends) {
        const recommendations = [];
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
        if (graphReport.totalNodes > 100) {
            recommendations.push("Considérer la création de sous-communautés pour mieux gérer la croissance");
        }
        return recommendations;
    }
    /**
     * Envoie le rapport via Discord
     */
    async sendReport(client, reportData) {
        if (!config_1.config.logChannel) {
            logger_1.default.error("[ReportGenerator] Channel de logs non configuré");
            return;
        }
        const channel = client.channels.cache.get(config_1.config.logChannel);
        if (!channel || !channel.isTextBased()) {
            logger_1.default.error("[ReportGenerator] Channel non disponible");
            return;
        }
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(`📊 Rapport ${reportData.period === "daily" ? "Quotidien" : reportData.period === "weekly" ? "Hebdomadaire" : "Mensuel"}`)
            .setDescription(`Période: ${reportData.startDate.toLocaleDateString()} - ${reportData.endDate.toLocaleDateString()}`)
            .setColor(0x00ff00)
            .addFields({
            name: "📈 Métriques",
            value: `
**Utilisateurs actifs**: ${reportData.metrics.activeUsers}
**Alertes déclenchées**: ${reportData.metrics.alertsTriggered}
**Offres détectées**: ${reportData.metrics.dealsDetected}
          `.trim(),
            inline: false,
        }, {
            name: "👥 Top Utilisateurs",
            value: reportData.topUsers.slice(0, 5)
                .map(u => `<@${u.userId}>: ${u.activity} connexions`)
                .join("\n") || "Aucune donnée",
            inline: true,
        }, {
            name: "🔥 Top Tendances",
            value: reportData.topTrends.slice(0, 5)
                .map(t => `${t.keyword}: ${t.mentions} mentions`)
                .join("\n") || "Aucune donnée",
            inline: true,
        })
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
            logger_1.default.info(`[ReportGenerator] Rapport ${reportData.period} envoyé`);
        }
        catch (error) {
            logger_1.default.error("[ReportGenerator] Erreur lors de l'envoi du rapport:", error);
        }
    }
    /**
     * Génère et envoie un rapport PDF (simulé)
     */
    async generatePDFReport(reportData) {
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
        logger_1.default.info("[ReportGenerator] Rapport PDF généré (simulé)");
        return reportContent;
    }
    /**
     * Active la génération automatique de rapports
     */
    enableAutoReporting(client, period) {
        let intervalMs;
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
            let reportData;
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
        logger_1.default.info(`[ReportGenerator] Auto-reporting activé (période: ${period})`);
    }
    /**
     * Obtient un rapport depuis le cache
     */
    getCachedReport(period, date) {
        const cacheKey = `${period}-${date.toISOString()}`;
        return this.reportCache.get(cacheKey) || null;
    }
    /**
     * Nettoie le cache des anciens rapports
     */
    cleanupOldReports(daysToKeep = 30) {
        const cutoff = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
        for (const [key, report] of this.reportCache.entries()) {
            if (report.endDate.getTime() < cutoff) {
                this.reportCache.delete(key);
            }
        }
        logger_1.default.debug(`[ReportGenerator] Cache nettoyé (rapports > ${daysToKeep} jours supprimés)`);
    }
}
exports.reportGeneratorService = new ReportGeneratorService();
//# sourceMappingURL=report-generator.js.map