import { Client } from "discord.js";
/**
 * Active le mode maintenance (désactive les commandes)
 */
export declare function enableMaintenanceMode(client: Client): Promise<void>;
/**
 * Désactive le mode maintenance (réenregistre les commandes)
 */
export declare function disableMaintenanceMode(client: Client): Promise<void>;
/**
 * Recharge la configuration depuis les variables d'environnement
 */
export declare function reloadConfig(): void;
/**
 * Recharge les commandes Discord sans redémarrer le bot
 */
export declare function reloadCommands(client: Client): Promise<void>;
/**
 * Active le rechargement automatique des commandes
 */
export declare function enableAutoReload(client: Client, intervalMs?: number): void;
/**
 * Désactive le rechargement automatique
 */
export declare function disableAutoReload(): void;
/**
 * Obtient le statut du hot reload
 */
export declare function getHotReloadStatus(): {
    isReloading: boolean;
    autoReloadEnabled: boolean;
};
//# sourceMappingURL=hot-reload.d.ts.map