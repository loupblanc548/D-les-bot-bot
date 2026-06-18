import logger from "../utils/logger.js";
import { Client, User } from "discord.js";
import prisma from "../prisma.js";
import { sentimentAnalysisService } from "./sentiment-analysis.js";
import { aiPredictionService } from "./ai-prediction.js";

interface UserProfile {
  userId: string;
  preferences: {
    genres: string[];
    platforms: string[];
    priceRange: { min: number; max: number };
  };
  history: {
    games: string[];
    interactions: string[];
  };
  activityScore: number;
}

interface GameRecommendation {
  gameId: string;
  gameName: string;
  platform: string;
  price: number;
  matchScore: number;
  reasons: string[];
  sentiment?: "buy" | "wait" | "avoid";
}

class RecommendationSystem {
  private userProfiles: Map<string, UserProfile>;
  private gameDatabase: Map<string, any>;

  constructor() {
    this.userProfiles = new Map();
    this.gameDatabase = new Map();
    logger.info("[RecommendationSystem] Service initialisé");
  }

  async initializeUserProfile(userId: string): Promise<void> {
    try {
      const profile: UserProfile = {
        userId,
        preferences: {
          genres: [],
          platforms: [],
          priceRange: { min: 0, max: 100 },
        },
        history: {
          games: [],
          interactions: [],
        },
        activityScore: 0,
      };

      this.userProfiles.set(userId, profile);
      logger.info(`[RecommendationSystem] Profil initialisé pour ${userId}`);
    } catch (error) {
      logger.error("[RecommendationSystem] Erreur lors de l'initialisation:", error);
    }
  }

  updateUserPreferences(userId: string, preferences: Partial<UserProfile["preferences"]>): void {
    const profile = this.userProfiles.get(userId);
    if (!profile) return;

    profile.preferences = { ...profile.preferences, ...preferences };
    this.userProfiles.set(userId, profile);
  }

  addInteraction(userId: string, gameId: string, interactionType: "view" | "like" | "dislike"): void {
    const profile = this.userProfiles.get(userId);
    if (!profile) return;

    profile.history.games.push(gameId);
    profile.history.interactions.push(`${interactionType}:${gameId}`);

    if (interactionType === "like") {
      profile.activityScore += 10;
    } else if (interactionType === "dislike") {
      profile.activityScore -= 5;
    } else {
      profile.activityScore += 1;
    }

    this.userProfiles.set(userId, profile);
  }

  async generateRecommendations(userId: string, count: number = 5): Promise<GameRecommendation[]> {
    const profile = this.userProfiles.get(userId);
    if (!profile) {
      logger.warn(`[RecommendationSystem] Profil non trouvé pour ${userId}`);
      return [];
    }

    const recommendations: GameRecommendation[] = [];
    const availableGames = await this.getAvailableGames();

    for (const game of availableGames) {
      if (profile.history.games.includes(game.id)) continue;

      const matchScore = this.calculateMatchScore(profile, game);
      const reasons = this.generateReasons(profile, game);

      let sentiment: "buy" | "wait" | "avoid" | undefined;
      const review = sentimentAnalysisService.getCachedReview(game.id);
      if (review) {
        sentiment = review.recommendation;
      }

      recommendations.push({
        gameId: game.id,
        gameName: game.name,
        platform: game.platform,
        price: game.price,
        matchScore,
        reasons,
        sentiment,
      });
    }

    recommendations.sort((a, b) => b.matchScore - a.matchScore);
    return recommendations.slice(0, count);
  }

  private calculateMatchScore(profile: UserProfile, game: Record<string, unknown>): number {
    let score = 0;

    const genreMatches = (game.genres as string[]).filter((g: string) => 
      profile.preferences.genres.includes(g)
    ).length;
    score += genreMatches * 20;

    if (profile.preferences.platforms.includes(game.platform as string)) {
      score += 30;
    }

    if ((game.price as number) >= profile.preferences.priceRange.min && 
        (game.price as number) <= profile.preferences.priceRange.max) {
      score += 15;
    }

    if ((game.popularity as number) > 80) {
      score += 10;
    }

    return Math.min(score, 100);
  }

  private generateReasons(profile: UserProfile, game: Record<string, unknown>): string[] {
    const reasons: string[] = [];

    const genreMatches = (game.genres as string[]).filter((g: string) => 
      profile.preferences.genres.includes(g)
    );

    if (genreMatches.length > 0) {
      reasons.push(`Correspond à vos genres: ${genreMatches.join(", ")}`);
    }

    if (profile.preferences.platforms.includes(game.platform as string)) {
      reasons.push(`Disponible sur ${game.platform}`);
    }

    if ((game.price as number) <= profile.preferences.priceRange.max) {
      reasons.push(`Prix dans votre budget: ${game.price}€`);
    }

    if ((game.popularity as number) > 80) {
      reasons.push("Très populaire parmi les joueurs");
    }

    return reasons;
  }

  private async getAvailableGames(): Promise<any[]> {
    return [
      {
        id: "game1", name: "Cyberpunk 2077", platform: "Steam", price: 59.99,
        genres: ["RPG", "Action"], popularity: 85,
      },
      {
        id: "game2", name: "Elden Ring", platform: "Steam", price: 59.99,
        genres: ["RPG", "Action"], popularity: 95,
      },
      {
        id: "game3", name: "Hades", platform: "Epic Games", price: 24.99,
        genres: ["Roguelike", "Action"], popularity: 90,
      },
    ];
  }

  async learnFromInteractions(userId: string): Promise<void> {
    const profile = this.userProfiles.get(userId);
    if (!profile) return;

    const likedGenres = new Set<string>();
    const likedPlatforms = new Set<string>();

    for (const interaction of profile.history.interactions) {
      const [type, gameId] = interaction.split(":");
      
      if (type === "like") {
        const game = this.gameDatabase.get(gameId);
        if (game) {
          game.genres.forEach((g: string) => likedGenres.add(g));
          likedPlatforms.add(game.platform);
        }
      }
    }

    if (likedGenres.size > 0) {
      profile.preferences.genres = Array.from(likedGenres);
    }

    if (likedPlatforms.size > 0) {
      profile.preferences.platforms = Array.from(likedPlatforms);
    }

    this.userProfiles.set(userId, profile);
    logger.info(`[RecommendationSystem] Préférences mises à jour pour ${userId}`);
  }

  getUserProfile(userId: string): UserProfile | null {
    return this.userProfiles.get(userId) || null;
  }

  async saveProfile(userId: string): Promise<void> {
    const profile = this.userProfiles.get(userId);
    if (!profile) return;

    await prisma.userProfile.upsert({
      where: { userId },
      create: profile as any,
      update: profile as any,
    });
  }

  async loadProfilesFromPrisma(): Promise<void> {
    const profiles = await prisma.userProfile.findMany();
    
    for (const profile of profiles) {
      this.userProfiles.set(profile.userId, profile as unknown as UserProfile);
    }

    logger.info(`[RecommendationSystem] ${profiles.length} profil(s) chargé(s) depuis Prisma`);
  }
}

export const recommendationSystem = new RecommendationSystem();
