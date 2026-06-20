import { Client } from "discord.js";
/**
 * Service de tableau de bord de monitoring en temps reel
 * Affiche l'etat des services, les metriques et les performances
 *
 * Les metriques par periode (1h, 6h, 24h) utilisent l'agregation
 * temporelle basee sur les snapshots horodates (delta entre le premier
 * et le dernier snapshot de la periode = 60 min de donnees, pas 60 pts).
 */
export interface ServiceStatus {
    name: string;
    status: "online" | "warning" | "offline" | "maintenance";
    uptime: number;
    lastCheck: Date;
    responseTime?: number;
    errorCount?: number;
}
export interface SystemMetrics {
    cpu: number;
    memory: number;
    disk: number;
    network: {
        inbound: number;
        outbound: number;
    };
}
declare class MonitoringDashboard {
    private client;
    private services;
    private updateInterval;
    private readonly UPDATE_INTERVAL_MS;
    constructor(client: Client);
    /**
     * Initialise les services a surveiller
     */
    private initializeServices;
    /**
     * Met a jour le statut d'un service
     */
    updateServiceStatus(serviceName: string, status: "online" | "warning" | "offline" | "maintenance", metadata?: Partial<ServiceStatus>): void;
    /**
     * Obtient les metriques systeme
     */
    private getSystemMetrics;
    /**
     * Genere l'embed du tableau de bord
     */
    private generateDashboardEmbed;
    /**
     * Envoie le tableau de bord au canal de monitoring
     */
    private sendDashboard;
    /**
     * Demarre le monitoring automatique
     */
    start(): void;
    /**
     * Arrete le monitoring
     */
    stop(): void;
    /**
     * Envoie un rapport de sante rapide
     */
    sendHealthCheck(): Promise<void>;
    /**
     * Obtient le statut actuel des services
     */
    getServiceStatus(serviceName: string): ServiceStatus | undefined;
    /**
     * Obtient tous les services
     */
    getAllServices(): ServiceStatus[];
    /**
     * Reinitialise les compteurs d'erreurs
     */
    resetErrorCounters(): void;
}
export default MonitoringDashboard;
//# sourceMappingURL=monitoringDashboard.d.ts.map