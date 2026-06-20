interface SteamProfile {
    steamId: string;
    personaName: string;
    avatarUrl: string;
    profileUrl: string;
    lastLogoff: number;
}
interface GameActivity {
    appId: string;
    name: string;
    playtimeForever: number;
    playtime2weeks: number;
    lastPlayed: number;
}
interface UserSteamLink {
    discordId: string;
    steamId: string;
    linkedAt: number;
}
declare class SteamActivityService {
    private apiKey;
    private userLinks;
    private activityCache;
    constructor();
    /**
     * Lie un compte Discord à un compte Steam
     */
    linkSteamAccount(discordId: string, steamId: string): Promise<boolean>;
    /**
     * Obtient le profil Steam d'un utilisateur
     */
    getSteamProfile(steamId: string): Promise<SteamProfile | null>;
    /**
     * Obtient les jeux d'un utilisateur Steam
     */
    getSteamGames(steamId: string): Promise<GameActivity[]>;
    /**
     * Obtient l'activité récente d'un utilisateur
     */
    getRecentActivity(discordId: string): Promise<{
        profile: SteamProfile | null;
        recentGames: GameActivity[];
        totalPlaytime: number;
    }>;
    /**
     * Corrèle l'activité Steam avec l'activité Discord
     */
    correlateActivity(discordId: string, discordActivity: {
        messageCount: number;
        activeChannels: string[];
        lastActive: number;
    }): Promise<{
        correlation: number;
        insights: string[];
    }>;
    /**
     * Charge les liens depuis Prisma
     */
    loadLinksFromPrisma(): Promise<void>;
    /**
     * Obtient tous les utilisateurs liés
     */
    getLinkedUsers(): UserSteamLink[];
    /**
     * Supprime un lien
     */
    unlinkSteamAccount(discordId: string): Promise<boolean>;
    /**
     * Obtient les statistiques globales
     */
    getGlobalStats(): {
        totalLinks: number;
        totalGamesTracked: number;
        averagePlaytime: number;
    };
}
export declare const steamActivityService: SteamActivityService;
export {};
//# sourceMappingURL=steam-activity.d.ts.map