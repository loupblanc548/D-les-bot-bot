import { Client } from "discord.js";
/**
 * Service de surveillance des prix de jeux
 * Surveille les prix sur Steam, Epic Games Store et PlayStation Store
 */
interface GamePrice {
    appId: string;
    platform: "steam" | "epic" | "psn";
    gameName: string;
    currentPrice: number;
    originalPrice: number;
    discount: number;
    currency: string;
    url: string;
    imageUrl?: string;
    lastChecked: number;
}
/**
 * Récupère le prix d'un jeu sur une plateforme spécifique
 */
export declare function getGamePrice(appId: string, platform: "steam" | "epic" | "psn"): Promise<GamePrice | null>;
/**
 * Ajoute une alerte de prix pour un utilisateur
 */
export declare function addPriceAlert(userId: string, appId: string, platform: string, targetPrice: number, guildId?: string): void;
/**
 * Vérifie les alertes de prix et notifie si le prix cible est atteint
 */
export declare function checkPriceAlerts(client: Client): Promise<void>;
/**
 * Nettoie les anciennes alertes (plus de 30 jours)
 */
export declare function cleanupOldAlerts(): void;
export {};
//# sourceMappingURL=priceTracker.d.ts.map