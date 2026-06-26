import { Client, User, GuildMember } from "discord.js";
import logger from "../utils/logger.js";

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

class UserPersonalizationService {
  private client: Client;
  private preferencesCache: Map<string, UserPreferences> = new Map();
  private profileCache: Map<string, UserProfile> = new Map();

  constructor(client: Client) {
    this.client = client;
  }

  /**
   * Obtient les préférences d'un utilisateur
   */
  async getUserPreferences(userId: string, guildId?: string): Promise<UserPreferences> {
    const cacheKey = `${userId}-${guildId || "global"}`;

    // Vérifier le cache
    if (this.preferencesCache.has(cacheKey)) {
      return this.preferencesCache.get(cacheKey)!;
    }

    try {
      // Essayer de récupérer depuis la base de données
      // Note: Vous devrez peut-être créer un modèle UserPreferences dans Prisma
      // Pour l'instant, on utilise des valeurs par défaut
      const defaultPreferences: UserPreferences = {
        userId,
        guildId,
        theme: "dark",
        language: "fr",
        notifications: {
          mentions: true,
          updates: true,
          alerts: true,
          digest: false,
        },
        privacy: {
          showActivity: true,
          showStats: true,
          allowDataCollection: false,
        },
        customSettings: {},
      };

      this.preferencesCache.set(cacheKey, defaultPreferences);
      return defaultPreferences;
    } catch (error) {
      logger.error(`[UserPersonalization] Erreur récupération préférences: ${error}`);
      return this.getDefaultPreferences(userId, guildId);
    }
  }

  /**
   * Met à jour les préférences d'un utilisateur
   */
  async updateUserPreferences(
    userId: string,
    preferences: Partial<UserPreferences>,
    guildId?: string,
  ): Promise<void> {
    const current = await this.getUserPreferences(userId, guildId);
    const updated = { ...current, ...preferences };

    const cacheKey = `${userId}-${guildId || "global"}`;
    this.preferencesCache.set(cacheKey, updated);

    // Sauvegarder dans la base de données
    // Note: Implémenter la sauvegarde Prisma quand le modèle sera créé
    logger.info(`[UserPersonalization] Préférences mises à jour pour ${userId}`);
  }

  /**
   * Obtient le profil d'un utilisateur
   */
  async getUserProfile(userId: string): Promise<UserProfile> {
    // Vérifier le cache
    if (this.profileCache.has(userId)) {
      return this.profileCache.get(userId)!;
    }

    try {
      const user = await this.client.users.fetch(userId);
      const member = await this.client.guilds.cache
        .first()
        ?.members.fetch(userId)
        .catch(() => null);

      const profile: UserProfile = {
        userId,
        username: user.username,
        avatar: user.displayAvatarURL(),
        banner: member?.banner ? member.bannerURL() || undefined : undefined,
        bio: undefined, // À implémenter avec une base de données
        badges: this.calculateBadges(user, member || null),
        level: this.calculateLevel(member || null),
        xp: this.calculateXP(member || null),
        createdAt: user.createdAt,
      };

      this.profileCache.set(userId, profile);
      return profile;
    } catch (error) {
      logger.error(`[UserPersonalization] Erreur récupération profil: ${error}`);
      return this.getDefaultProfile(userId);
    }
  }

  /**
   * Met à jour le profil d'un utilisateur
   */
  async updateUserProfile(userId: string, updates: Partial<UserProfile>): Promise<void> {
    const current = await this.getUserProfile(userId);
    const updated = { ...current, ...updates };

    this.profileCache.set(userId, updated);
    logger.info(`[UserPersonalization] Profil mis à jour pour ${userId}`);
  }

  /**
   * Calcule les badges d'un utilisateur
   */
  private calculateBadges(user: User, member: GuildMember | null): string[] {
    const badges: string[] = [];

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
  private calculateLevel(member: GuildMember | null): number {
    if (!member) return 1;

    const joinDate = member.joinedAt || member.user.createdAt;
    const daysSinceJoin = Math.floor((Date.now() - joinDate.getTime()) / (1000 * 60 * 60 * 24));

    // Formule simple: 1 niveau tous les 30 jours
    return Math.floor(daysSinceJoin / 30) + 1;
  }

  /**
   * Calcule l'XP d'un utilisateur
   */
  private calculateXP(member: GuildMember | null): number {
    if (!member) return 0;

    const level = this.calculateLevel(member);
    // XP basé sur le niveau
    return level * 100;
  }

  /**
   * Obtient les préférences par défaut
   */
  private getDefaultPreferences(userId: string, guildId?: string): UserPreferences {
    return {
      userId,
      guildId,
      theme: "dark",
      language: "fr",
      notifications: {
        mentions: true,
        updates: true,
        alerts: true,
        digest: false,
      },
      privacy: {
        showActivity: true,
        showStats: true,
        allowDataCollection: false,
      },
      customSettings: {},
    };
  }

  /**
   * Obtient le profil par défaut
   */
  private getDefaultProfile(userId: string): UserProfile {
    return {
      userId,
      username: "Utilisateur",
      badges: [],
      level: 1,
      xp: 0,
      createdAt: new Date(),
    };
  }

  /**
   * Réinitialise les préférences d'un utilisateur
   */
  async resetUserPreferences(userId: string, guildId?: string): Promise<void> {
    const defaultPrefs = this.getDefaultPreferences(userId, guildId);
    const cacheKey = `${userId}-${guildId || "global"}`;
    this.preferencesCache.set(cacheKey, defaultPrefs);

    logger.info(`[UserPersonalization] Préférences réinitialisées pour ${userId}`);
  }

  /**
   * Exporte les préférences d'un utilisateur
   */
  async exportPreferences(userId: string, guildId?: string): Promise<string> {
    const preferences = await this.getUserPreferences(userId, guildId);
    return JSON.stringify(preferences, null, 2);
  }

  /**
   * Importe les préférences d'un utilisateur
   */
  async importPreferences(
    userId: string,
    preferencesJson: string,
    guildId?: string,
  ): Promise<void> {
    try {
      const preferences = JSON.parse(preferencesJson) as Partial<UserPreferences>;
      await this.updateUserPreferences(userId, preferences, guildId);
      logger.info(`[UserPersonalization] Préférences importées pour ${userId}`);
    } catch (error) {
      logger.error(`[UserPersonalization] Erreur import préférences: ${error}`);
      throw new Error("Format de préférences invalide", { cause: error });
    }
  }

  /**
   * Obtient les statistiques de personnalisation
   */
  async getPersonalizationStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    themeDistribution: Record<string, number>;
    languageDistribution: Record<string, number>;
  }> {
    const totalUsers = this.preferencesCache.size;
    const activeUsers = Array.from(this.preferencesCache.values()).filter(
      (p) => p.notifications.mentions || p.notifications.updates,
    ).length;

    const themeDistribution: Record<string, number> = { light: 0, dark: 0, auto: 0 };
    const languageDistribution: Record<string, number> = { fr: 0, en: 0, es: 0, de: 0 };

    for (const prefs of this.preferencesCache.values()) {
      themeDistribution[prefs.theme]++;
      languageDistribution[prefs.language]++;
    }

    return {
      totalUsers,
      activeUsers,
      themeDistribution,
      languageDistribution,
    };
  }

  /**
   * Vide le cache des préférences
   */
  clearCache(): void {
    this.preferencesCache.clear();
    this.profileCache.clear();
    logger.info("[UserPersonalization] Cache vidé");
  }

  /**
   * Obtient les utilisateurs avec des préférences spécifiques
   */
  async getUsersWithPreference(key: string, value: unknown): Promise<UserPreferences[]> {
    return Array.from(this.preferencesCache.values()).filter((p) => {
      if (key.includes(".")) {
        const keys = key.split(".");
        let current: any = p;
        for (const k of keys) {
          current = current?.[k];
        }
        return current === value;
      }
      return (p as any)[key] === value;
    });
  }

  /**
   * Synchronise les préférences avec la base de données
   */
  async syncWithDatabase(): Promise<void> {
    // Implémenter la synchronisation avec Prisma quand le modèle sera créé
    logger.info("[UserPersonalization] Synchronisation avec la base de données");
  }
}

export default UserPersonalizationService;

/**
 * Commandes de personnalisation
 */
export const PERSONALIZATION_COMMANDS = {
  setTheme: "Définit le thème (light/dark/auto)",
  setLanguage: "Définit la langue (fr/en/es/de)",
  toggleNotifications: "Active/désactive les notifications",
  setPrivacy: "Configure les paramètres de confidentialité",
  exportPrefs: "Exporte vos préférences",
  importPrefs: "Importe vos préférences",
  resetPrefs: "Réinitialise vos préférences",
  viewProfile: "Affiche votre profil",
  editProfile: "Modifie votre profil",
  viewBadges: "Affiche vos badges",
};

/**
 * Thèmes disponibles
 */
export const AVAILABLE_THEMES = {
  light: {
    name: "Clair",
    description: "Thème clair pour une meilleure lisibilité",
    colors: {
      primary: 0x0099ff,
      secondary: 0x00ccff,
      background: 0xffffff,
      text: 0x000000,
    },
  },
  dark: {
    name: "Sombre",
    description: "Thème sombre pour réduire la fatigue oculaire",
    colors: {
      primary: 0x0099ff,
      secondary: 0x0066cc,
      background: 0x1a1a1a,
      text: 0xffffff,
    },
  },
  auto: {
    name: "Automatique",
    description: "S'adapte aux préférences système",
    colors: {
      primary: 0x0099ff,
      secondary: 0x00ccff,
      background: 0x2a2a2a,
      text: 0xffffff,
    },
  },
};

/**
 * Langues disponibles
 */
export const AVAILABLE_LANGUAGES = {
  fr: { name: "Français", flag: "🇫🇷" },
  en: { name: "English", flag: "🇬🇧" },
  es: { name: "Español", flag: "🇪🇸" },
  de: { name: "Deutsch", flag: "🇩🇪" },
};
