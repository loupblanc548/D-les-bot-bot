import { Client } from "discord.js";
import { AlertPriority } from "../components/embedBuilder.js";
/**
 * Service d'alertes priorisées par couleur
 * Gère l'envoi d'alertes avec différents niveaux de priorité et couleurs
 */
export interface AlertOptions {
    title: string;
    message: string;
    priority: AlertPriority;
    category?: "system" | "gaming" | "moderation" | "security" | "performance";
    source?: string;
    metadata?: Record<string, any>;
    mentionRoles?: string[];
    mentionUsers?: string[];
}
export declare class AlertService {
    private client;
    private alertHistory;
    private readonly COOLDOWN_MS;
    constructor(client: Client);
    /**
     * Envoie une alerte avec le niveau de priorité spécifié
     */
    sendAlert(options: AlertOptions): Promise<void>;
    /**
     * Envoie une alerte critique
     */
    sendCriticalAlert(title: string, message: string, options?: Partial<AlertOptions>): Promise<void>;
    /**
     * Envoie une alerte haute priorité
     */
    sendHighAlert(title: string, message: string, options?: Partial<AlertOptions>): Promise<void>;
    /**
     * Envoie une alerte moyenne priorité
     */
    sendMediumAlert(title: string, message: string, options?: Partial<AlertOptions>): Promise<void>;
    /**
     * Envoie une alerte basse priorité
     */
    sendLowAlert(title: string, message: string, options?: Partial<AlertOptions>): Promise<void>;
    /**
     * Envoie une alerte information
     */
    sendInfoAlert(title: string, message: string, options?: Partial<AlertOptions>): Promise<void>;
    /**
     * Envoie un tableau de bord des alertes récentes
     */
    sendAlertDashboard(): Promise<void>;
    /**
     * Nettoie l'historique des alertes anciennes
     */
    cleanupOldAlerts(): void;
    /**
     * Obtient l'emoji pour le niveau de priorité
     */
    private getPriorityEmoji;
    /**
     * Obtient l'emoji pour la catégorie
     */
    private getCategoryEmoji;
    /**
     * Envoie l'embed au canal de log
     */
    private sendToLogChannel;
    /**
     * Démarre le nettoyage automatique des alertes anciennes
     */
    startAutoCleanup(): void;
}
export default AlertService;
//# sourceMappingURL=alertService.d.ts.map