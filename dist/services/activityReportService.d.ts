import { Client, EmbedBuilder } from "discord.js";
/**
 * Service de rapports d'activité avec statistiques
 * Génère des rapports détaillés sur l'utilisation du bot
 */
export interface CommandUsage {
    name: string;
    uses: number;
    successRate: number;
    avgResponseTime: number;
}
export interface UserActivity {
    userId: string;
    username: string;
    commandCount: number;
    lastActive: Date;
}
export interface ActivityReport {
    period: string;
    totalCommands: number;
    uniqueUsers: number;
    topCommands: CommandUsage[];
    topUsers: UserActivity[];
    errorRate: number;
    avgResponseTime: number;
}
declare class ActivityReportService {
    private client;
    constructor(client: Client);
    /**
     * Génère un rapport d'activité pour une période donnée
     */
    generateReport(hours: number): Promise<ActivityReport>;
    /**
     * Obtient le nom d'utilisateur à partir de l'ID
     */
    private getUsername;
    /**
     * Obtient un rapport vide en cas d'erreur
     */
    private getEmptyReport;
    /**
     * Génère l'embed du rapport d'activité
     */
    generateReportEmbed(report: ActivityReport): EmbedBuilder;
    /**
     * Génère un graphique ASCII simple pour les commandes
     */
    private generateCommandChart;
    /**
     * Envoie le rapport au canal de log
     */
    sendReport(hours?: number): Promise<void>;
    /**
     * Envoie un rapport comparatif entre deux périodes
     */
    sendComparativeReport(hours1: number, hours2: number): Promise<void>;
    /**
     * Obtient les tendances d'utilisation
     */
    getUsageTrends(days?: number): Promise<Array<{
        date: string;
        commands: number;
    }>>;
}
export default ActivityReportService;
//# sourceMappingURL=activityReportService.d.ts.map