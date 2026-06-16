import { Client } from "discord.js";
/**
 * Système de personnalisation utilisateur
 * Permet aux utilisateurs de personnaliser leur expérience avec le bot
 */
export interface UserPreferences {
    userId: string;
    guildId?: string;
    theme: "light" | "dark" | "auto";
    language: "fr" | "en" | "es" | "de";
    notifications: {
        mentions: boolean;
        updates: boolean;
        alerts: boolean;
        digest: boolean;
    };
    privacy: {
        showActivity: boolean;
        showStats: boolean;
        allowDataCollection: boolean;
    };
    customSettings: Record<string, any>;
}
export interface UserProfile {
    userId: string;
    username: string;
    avatar?: string;
    banner?: string;
    bio?: string;
    badges: string[];
    level: number;
    xp: number;
    createdAt: Date;
}
declare class UserPersonalizationService {
    private client;
    private preferencesCache;
    private profileCache;
    constructor(client: Client);
    /**
     * Obtient les préférences d'un utilisateur
     */
    getUserPreferences(userId: string, guildId?: string): Promise<UserPreferences>;
    /**
     * Met à jour les préférences d'un utilisateur
     */
    updateUserPreferences(userId: string, preferences: Partial<UserPreferences>, guildId?: string): Promise<void>;
    /**
     * Obtient le profil d'un utilisateur
     */
    getUserProfile(userId: string): Promise<UserProfile>;
    /**
     * Met à jour le profil d'un utilisateur
     */
    updateUserProfile(userId: string, updates: Partial<UserProfile>): Promise<void>;
    /**
     * Calcule les badges d'un utilisateur
     */
    private calculateBadges;
    /**
     * Calcule le niveau d'un utilisateur
     */
    private calculateLevel;
    /**
     * Calcule l'XP d'un utilisateur
     */
    private calculateXP;
    /**
     * Obtient les préférences par défaut
     */
    private getDefaultPreferences;
    /**
     * Obtient le profil par défaut
     */
    private getDefaultProfile;
    /**
     * Réinitialise les préférences d'un utilisateur
     */
    resetUserPreferences(userId: string, guildId?: string): Promise<void>;
    /**
     * Exporte les préférences d'un utilisateur
     */
    exportPreferences(userId: string, guildId?: string): Promise<string>;
    /**
     * Importe les préférences d'un utilisateur
     */
    importPreferences(userId: string, preferencesJson: string, guildId?: string): Promise<void>;
    /**
     * Obtient les statistiques de personnalisation
     */
    getPersonalizationStats(): Promise<{
        totalUsers: number;
        activeUsers: number;
        themeDistribution: Record<string, number>;
        languageDistribution: Record<string, number>;
    }>;
    /**
     * Vide le cache des préférences
     */
    clearCache(): void;
    /**
     * Obtient les utilisateurs avec des préférences spécifiques
     */
    getUsersWithPreference(key: string, value: unknown): Promise<UserPreferences[]>;
    /**
     * Synchronise les préférences avec la base de données
     */
    syncWithDatabase(): Promise<void>;
}
export default UserPersonalizationService;
/**
 * Commandes de personnalisation
 */
export declare const PERSONALIZATION_COMMANDS: {
    setTheme: string;
    setLanguage: string;
    toggleNotifications: string;
    setPrivacy: string;
    exportPrefs: string;
    importPrefs: string;
    resetPrefs: string;
    viewProfile: string;
    editProfile: string;
    viewBadges: string;
};
/**
 * Thèmes disponibles
 */
export declare const AVAILABLE_THEMES: {
    light: {
        name: string;
        description: string;
        colors: {
            primary: number;
            secondary: number;
            background: number;
            text: number;
        };
    };
    dark: {
        name: string;
        description: string;
        colors: {
            primary: number;
            secondary: number;
            background: number;
            text: number;
        };
    };
    auto: {
        name: string;
        description: string;
        colors: {
            primary: number;
            secondary: number;
            background: number;
            text: number;
        };
    };
};
/**
 * Langues disponibles
 */
export declare const AVAILABLE_LANGUAGES: {
    fr: {
        name: string;
        flag: string;
    };
    en: {
        name: string;
        flag: string;
    };
    es: {
        name: string;
        flag: string;
    };
    de: {
        name: string;
        flag: string;
    };
};
//# sourceMappingURL=userPersonalization.d.ts.map