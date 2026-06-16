import { Client } from "discord.js";
interface AlertEntry {
    key: string;
    severity: "low" | "medium" | "high" | "critical";
    count: number;
    firstAlert: number;
    lastAlert: number;
    data?: Record<string, unknown>;
}
/**
 * Envoie une alerte avec système d'escalation automatique
 * @param client Client Discord
 * @param key Clé unique pour l'alerte (ex: "spam", "raid", "phishing")
 * @param message Message de l'alerte
 * @param data Données additionnelles
 * @returns true si l'alerte a été envoyée, false sinon
 */
export declare function sendEscalatedAlert(client: Client, key: string, message: string, data?: Record<string, unknown>): Promise<boolean>;
/**
 * Réinitialise les alertes pour une clé donnée
 */
export declare function resetAlert(key: string): void;
/**
 * Réinitialise toutes les alertes
 */
export declare function resetAllAlerts(): void;
/**
 * Obtient les statistiques d'alertes
 */
export declare function getAlertStats(): Record<string, AlertEntry>;
export {};
//# sourceMappingURL=alert-escalation.d.ts.map