import { Client } from "discord.js";
/**
 * Service de suivi des dates de sortie de jeux
 * Surveille les sorties à venir et notifie les utilisateurs
 */
interface GameRelease {
    appId: string;
    gameName: string;
    platform: string;
    releaseDate: Date;
    imageUrl?: string;
    url: string;
    notified: boolean;
    addedAt: Date;
}
/**
 * Ajoute un jeu à surveiller pour sa sortie
 */
export declare function addGameRelease(appId: string, gameName: string, platform: string, releaseDate: Date, imageUrl?: string, url?: string): void;
/**
 * S'abonne aux notifications de sortie pour un jeu
 */
export declare function subscribeToRelease(userId: string, appId: string, platform: string, guildId?: string): void;
/**
 * Vérifie les sorties à venir et notifie si nécessaire
 */
export declare function checkReleases(client: Client): Promise<void>;
/**
 * Récupère les sorties à venir
 */
export declare function getUpcomingReleases(days?: number): GameRelease[];
/**
 * Nettoie les anciennes sorties (plus de 7 jours après la sortie)
 */
export declare function cleanupOldReleases(): void;
export {};
//# sourceMappingURL=releaseTracker.d.ts.map