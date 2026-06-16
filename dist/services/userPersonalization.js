"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AVAILABLE_LANGUAGES = exports.AVAILABLE_THEMES = exports.PERSONALIZATION_COMMANDS = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
class UserPersonalizationService {
    client;
    preferencesCache = new Map();
    profileCache = new Map();
    constructor(client) {
        this.client = client;
    }
    /**
     * Obtient les préférences d'un utilisateur
     */
    async getUserPreferences(userId, guildId) {
        const cacheKey = `${userId}-${guildId || 'global'}`;
        // Vérifier le cache
        if (this.preferencesCache.has(cacheKey)) {
            return this.preferencesCache.get(cacheKey);
        }
        try {
            // Essayer de récupérer depuis la base de données
            // Note: Vous devrez peut-être créer un modèle UserPreferences dans Prisma
            // Pour l'instant, on utilise des valeurs par défaut
            const defaultPreferences = {
                userId,
                guildId,
                theme: "dark",
                language: "fr",
                notifications: {
                    mentions: true,
                    updates: true,
                    alerts: true,
                    digest: false
                },
                privacy: {
                    showActivity: true,
                    showStats: true,
                    allowDataCollection: false
                },
                customSettings: {}
            };
            this.preferencesCache.set(cacheKey, defaultPreferences);
            return defaultPreferences;
        }
        catch (error) {
            logger_1.default.error(`[UserPersonalization] Erreur récupération préférences: ${error}`);
            return this.getDefaultPreferences(userId, guildId);
        }
    }
    /**
     * Met à jour les préférences d'un utilisateur
     */
    async updateUserPreferences(userId, preferences, guildId) {
        const current = await this.getUserPreferences(userId, guildId);
        const updated = { ...current, ...preferences };
        const cacheKey = `${userId}-${guildId || 'global'}`;
        this.preferencesCache.set(cacheKey, updated);
        // Sauvegarder dans la base de données
        // Note: Implémenter la sauvegarde Prisma quand le modèle sera créé
        logger_1.default.info(`[UserPersonalization] Préférences mises à jour pour ${userId}`);
    }
    /**
     * Obtient le profil d'un utilisateur
     */
    async getUserProfile(userId) {
        // Vérifier le cache
        if (this.profileCache.has(userId)) {
            return this.profileCache.get(userId);
        }
        try {
            const user = await this.client.users.fetch(userId);
            const member = await this.client.guilds.cache.first()?.members.fetch(userId).catch(() => null);
            const profile = {
                userId,
                username: user.username,
                avatar: user.displayAvatarURL(),
                banner: member?.banner ? (member.bannerURL() || undefined) : undefined,
                bio: undefined, // À implémenter avec une base de données
                badges: this.calculateBadges(user, member || null),
                level: this.calculateLevel(member || null),
                xp: this.calculateXP(member || null),
                createdAt: user.createdAt
            };
            this.profileCache.set(userId, profile);
            return profile;
        }
        catch (error) {
            logger_1.default.error(`[UserPersonalization] Erreur récupération profil: ${error}`);
            return this.getDefaultProfile(userId);
        }
    }
    /**
     * Met à jour le profil d'un utilisateur
     */
    async updateUserProfile(userId, updates) {
        const current = await this.getUserProfile(userId);
        const updated = { ...current, ...updates };
        this.profileCache.set(userId, updated);
        logger_1.default.info(`[UserPersonalization] Profil mis à jour pour ${userId}`);
    }
    /**
     * Calcule les badges d'un utilisateur
     */
    calculateBadges(user, member) {
        const badges = [];
        if (user.bot) {
            badges.push("🤖 Bot");
        }
        if (member) {
            if (member.premiumSince) {
                badges.push("💎 Nitro");
            }
            if (member.permissions.has("Administrator")) {
                badges.push("👑 Admin");
            }
            if (member.permissions.has("ModerateMembers")) {
                badges.push("🛡️ Modérateur");
            }
        }
        // Badges basés sur l'activité (à implémenter avec des données réelles)
        const joinDate = member?.joinedAt || user.createdAt;
        const daysSinceJoin = Math.floor((Date.now() - joinDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceJoin > 365) {
            badges.push("🎂 Ancien");
        }
        if (daysSinceJoin > 30) {
            badges.push("✨ Actif");
        }
        return badges;
    }
    /**
     * Calcule le niveau d'un utilisateur
     */
    calculateLevel(member) {
        if (!member)
            return 1;
        const joinDate = member.joinedAt || member.user.createdAt;
        const daysSinceJoin = Math.floor((Date.now() - joinDate.getTime()) / (1000 * 60 * 60 * 24));
        // Formule simple: 1 niveau tous les 30 jours
        return Math.floor(daysSinceJoin / 30) + 1;
    }
    /**
     * Calcule l'XP d'un utilisateur
     */
    calculateXP(member) {
        if (!member)
            return 0;
        const level = this.calculateLevel(member);
        // XP basé sur le niveau
        return level * 100;
    }
    /**
     * Obtient les préférences par défaut
     */
    getDefaultPreferences(userId, guildId) {
        return {
            userId,
            guildId,
            theme: "dark",
            language: "fr",
            notifications: {
                mentions: true,
                updates: true,
                alerts: true,
                digest: false
            },
            privacy: {
                showActivity: true,
                showStats: true,
                allowDataCollection: false
            },
            customSettings: {}
        };
    }
    /**
     * Obtient le profil par défaut
     */
    getDefaultProfile(userId) {
        return {
            userId,
            username: "Utilisateur",
            badges: [],
            level: 1,
            xp: 0,
            createdAt: new Date()
        };
    }
    /**
     * Réinitialise les préférences d'un utilisateur
     */
    async resetUserPreferences(userId, guildId) {
        const defaultPrefs = this.getDefaultPreferences(userId, guildId);
        const cacheKey = `${userId}-${guildId || 'global'}`;
        this.preferencesCache.set(cacheKey, defaultPrefs);
        logger_1.default.info(`[UserPersonalization] Préférences réinitialisées pour ${userId}`);
    }
    /**
     * Exporte les préférences d'un utilisateur
     */
    async exportPreferences(userId, guildId) {
        const preferences = await this.getUserPreferences(userId, guildId);
        return JSON.stringify(preferences, null, 2);
    }
    /**
     * Importe les préférences d'un utilisateur
     */
    async importPreferences(userId, preferencesJson, guildId) {
        try {
            const preferences = JSON.parse(preferencesJson);
            await this.updateUserPreferences(userId, preferences, guildId);
            logger_1.default.info(`[UserPersonalization] Préférences importées pour ${userId}`);
        }
        catch (error) {
            logger_1.default.error(`[UserPersonalization] Erreur import préférences: ${error}`);
            throw new Error("Format de préférences invalide");
        }
    }
    /**
     * Obtient les statistiques de personnalisation
     */
    async getPersonalizationStats() {
        const totalUsers = this.preferencesCache.size;
        const activeUsers = Array.from(this.preferencesCache.values()).filter(p => p.notifications.mentions || p.notifications.updates).length;
        const themeDistribution = { light: 0, dark: 0, auto: 0 };
        const languageDistribution = { fr: 0, en: 0, es: 0, de: 0 };
        for (const prefs of this.preferencesCache.values()) {
            themeDistribution[prefs.theme]++;
            languageDistribution[prefs.language]++;
        }
        return {
            totalUsers,
            activeUsers,
            themeDistribution,
            languageDistribution
        };
    }
    /**
     * Vide le cache des préférences
     */
    clearCache() {
        this.preferencesCache.clear();
        this.profileCache.clear();
        logger_1.default.info("[UserPersonalization] Cache vidé");
    }
    /**
     * Obtient les utilisateurs avec des préférences spécifiques
     */
    async getUsersWithPreference(key, value) {
        return Array.from(this.preferencesCache.values()).filter(p => {
            if (key.includes('.')) {
                const keys = key.split('.');
                let current = p;
                for (const k of keys) {
                    current = current?.[k];
                }
                return current === value;
            }
            return p[key] === value;
        });
    }
    /**
     * Synchronise les préférences avec la base de données
     */
    async syncWithDatabase() {
        // Implémenter la synchronisation avec Prisma quand le modèle sera créé
        logger_1.default.info("[UserPersonalization] Synchronisation avec la base de données");
    }
}
exports.default = UserPersonalizationService;
/**
 * Commandes de personnalisation
 */
exports.PERSONALIZATION_COMMANDS = {
    setTheme: "Définit le thème (light/dark/auto)",
    setLanguage: "Définit la langue (fr/en/es/de)",
    toggleNotifications: "Active/désactive les notifications",
    setPrivacy: "Configure les paramètres de confidentialité",
    exportPrefs: "Exporte vos préférences",
    importPrefs: "Importe vos préférences",
    resetPrefs: "Réinitialise vos préférences",
    viewProfile: "Affiche votre profil",
    editProfile: "Modifie votre profil",
    viewBadges: "Affiche vos badges"
};
/**
 * Thèmes disponibles
 */
exports.AVAILABLE_THEMES = {
    light: {
        name: "Clair",
        description: "Thème clair pour une meilleure lisibilité",
        colors: {
            primary: 0x0099ff,
            secondary: 0x00ccff,
            background: 0xffffff,
            text: 0x000000
        }
    },
    dark: {
        name: "Sombre",
        description: "Thème sombre pour réduire la fatigue oculaire",
        colors: {
            primary: 0x0099ff,
            secondary: 0x0066cc,
            background: 0x1a1a1a,
            text: 0xffffff
        }
    },
    auto: {
        name: "Automatique",
        description: "S'adapte aux préférences système",
        colors: {
            primary: 0x0099ff,
            secondary: 0x00ccff,
            background: 0x2a2a2a,
            text: 0xffffff
        }
    }
};
/**
 * Langues disponibles
 */
exports.AVAILABLE_LANGUAGES = {
    fr: { name: "Français", flag: "🇫🇷" },
    en: { name: "English", flag: "🇬🇧" },
    es: { name: "Español", flag: "🇪🇸" },
    de: { name: "Deutsch", flag: "🇩🇪" }
};
//# sourceMappingURL=userPersonalization.js.map