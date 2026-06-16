import { Client } from "discord.js";
interface GroupedAlert {
    key: string;
    severity: "low" | "medium" | "high" | "critical";
    messages: string[];
    firstTimestamp: number;
    lastTimestamp: number;
    count: number;
}
/**
 * Ajoute une alerte au buffer pour groupement
 * @param key Clé de groupement (ex: "spam", "raid", "api_error")
 * @param message Message de l'alerte
 * @param severity Sévérité de l'alerte
 */
export declare function addAlertToBuffer(key: string, message: string, severity?: "low" | "medium" | "high" | "critical"): void;
/**
 * Active le traitement automatique des alertes groupées
 */
export declare function enableSmartAlerts(client: Client, intervalMs?: number): void;
/**
 * Désactive le traitement automatique
 */
export declare function disableSmartAlerts(): void;
/**
 * Force le traitement immédiat des alertes groupées
 */
export declare function flushAlertBuffer(client: Client): Promise<void>;
/**
 * Obtient les statistiques du buffer
 */
export declare function getBufferStats(): Record<string, GroupedAlert>;
export {};
//# sourceMappingURL=smart-alerts.d.ts.map