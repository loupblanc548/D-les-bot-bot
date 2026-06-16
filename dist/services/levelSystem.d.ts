import { Client } from "discord.js";
interface UserLevelData {
    userId: string;
    guildId: string;
    xp: number;
    level: number;
    lastMessageDate: Date;
}
/**
 * Calcule le niveau à partir de l'XP
 */
export declare function calculateLevel(xp: number): number;
/**
 * Calcule l'XP requis pour un niveau
 */
export declare function getXPForLevel(level: number): number;
/**
 * Récupère les données de niveau d'un utilisateur
 */
export declare function getUserLevelData(userId: string, guildId: string): Promise<UserLevelData>;
/**
 * Ajoute de l'XP à un utilisateur
 */
export declare function addXP(userId: string, guildId: string, amount: number): Promise<{
    newLevel: number;
    leveledUp: boolean;
}>;
/**
 * Vérifie si un utilisateur peut gagner de l'XP (cooldown)
 */
export declare function canGainXP(userId: string, guildId: string): boolean;
/**
 * Attribue automatiquement les rôles basés sur le niveau
 */
export declare function assignLevelRoles(userId: string, guildId: string, client: Client): Promise<void>;
/**
 * Récupère le classement du serveur
 */
export declare function getGuildLeaderboard(guildId: string, limit?: number): Promise<UserLevelData[]>;
/**
 * Configure les rôles pour les niveaux
 */
export declare function configureLevelRoles(guildId: string, roleConfigs: {
    level: number;
    roleId: string;
}[]): void;
export {};
//# sourceMappingURL=levelSystem.d.ts.map