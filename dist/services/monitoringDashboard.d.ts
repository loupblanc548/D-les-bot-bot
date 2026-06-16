import { Client } from "discord.js";
/**
 * Service de tableau de bord de monitoring en temps réel
 * Affiche l'état des services, les métriques et les performances
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
     * Initialise les services à surveiller
     */
    private initializeServices;
    /**
     * Met à jour le statut d'un service
     */
    updateServiceStatus(serviceName: string, status: "online" | "warning" | "offline" | "maintenance", metadata?: Partial<ServiceStatus>): void;
    /**
     * Obtient les métriques système
     */
    private getSystemMetrics;
    /**
     * Génère l'embed du tableau de bord
     */
    private generateDashboardEmbed;
    /**
     * Envoie le tableau de bord au canal de monitoring
     */
    private sendDashboard;
    /**
     * Démarre le monitoring automatique
     */
    start(): void;
    /**
     * Arrête le monitoring
     */
    stop(): void;
    /**
     * Envoie un rapport de santé rapide
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
     * Réinitialise les compteurs d'erreurs
     */
    resetErrorCounters(): void;
}
export default MonitoringDashboard;
//# sourceMappingURL=monitoringDashboard.d.ts.map