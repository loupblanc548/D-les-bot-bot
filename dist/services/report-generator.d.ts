import { Client } from "discord.js";
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
    topUsers: Array<{
        userId: string;
        activity: number;
    }>;
    topTrends: Array<{
        keyword: string;
        mentions: number;
    }>;
    recommendations: string[];
}
declare class ReportGeneratorService {
    private reportCache;
    constructor();
    /**
     * Génère un rapport quotidien
     */
    generateDailyReport(client: Client): Promise<ReportData>;
    /**
     * Génère un rapport hebdomadaire
     */
    generateWeeklyReport(client: Client): Promise<ReportData>;
    /**
     * Génère un rapport mensuel
     */
    generateMonthlyReport(client: Client): Promise<ReportData>;
    /**
     * Génère un rapport
     */
    private generateReport;
    /**
     * Génère des recommandations basées sur les données
     */
    private generateRecommendations;
    /**
     * Envoie le rapport via Discord
     */
    sendReport(client: Client, reportData: ReportData): Promise<void>;
    /**
     * Génère et envoie un rapport PDF (simulé)
     */
    generatePDFReport(reportData: ReportData): Promise<string>;
    /**
     * Active la génération automatique de rapports
     */
    enableAutoReporting(client: Client, period: "daily" | "weekly" | "monthly"): void;
    /**
     * Obtient un rapport depuis le cache
     */
    getCachedReport(period: "daily" | "weekly" | "monthly", date: Date): ReportData | null;
    /**
     * Nettoie le cache des anciens rapports
     */
    cleanupOldReports(daysToKeep?: number): void;
}
export declare const reportGeneratorService: ReportGeneratorService;
export {};
//# sourceMappingURL=report-generator.d.ts.map