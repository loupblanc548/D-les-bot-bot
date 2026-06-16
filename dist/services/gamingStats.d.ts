/**
 * Service d'intégration PSN/Xbox pour stats de joueurs
 * Récupère les statistiques de jeux et profils PlayStation et Xbox
 */
interface PSNProfile {
    onlineId: string;
    avatarUrl: string;
    level: number;
    progress: number;
    trophyCount: {
        bronze: number;
        silver: number;
        gold: number;
        platinum: number;
    };
    isOnline: boolean;
}
interface XboxProfile {
    gamertag: string;
    gamerscore: number;
    avatarUrl: string;
    tier: string;
    isOnline: boolean;
}
interface GameStats {
    gameId: string;
    gameName: string;
    playtime: number;
    achievements: number;
    lastPlayed: Date;
}
/**
 * Récupère le profil PSN d'un joueur
 */
export declare function getPSNProfile(onlineId: string): Promise<PSNProfile | null>;
/**
 * Récupère le profil Xbox d'un joueur
 */
export declare function getXboxProfile(gamertag: string): Promise<XboxProfile | null>;
/**
 * Récupère les stats d'un jeu spécifique sur PSN
 */
export declare function getPSNGameStats(onlineId: string, gameId: string): Promise<GameStats | null>;
/**
 * Récupère les stats d'un jeu spécifique sur Xbox
 */
export declare function getXboxGameStats(gamertag: string, gameId: string): Promise<GameStats | null>;
/**
 * Formate les stats PSN pour affichage Discord
 */
export declare function formatPSNStats(profile: PSNProfile): string;
/**
 * Formate les stats Xbox pour affichage Discord
 */
export declare function formatXboxStats(profile: XboxProfile): string;
/**
 * Nettoie le cache des profils
 */
export declare function clearProfileCache(): void;
export {};
//# sourceMappingURL=gamingStats.d.ts.map