import logger from "../utils/logger.js";
import prisma from "../prisma.js";
import { sentimentAnalysisService } from "./sentiment-analysis.js";
class RecommendationSystem {
    userProfiles;
    gameDatabase;
    constructor() {
        this.userProfiles = new Map();
        this.gameDatabase = new Map();
        logger.info("[RecommendationSystem] Service initialisé");
    }
    async initializeUserProfile(userId) {
        try {
            const profile = {
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
        }
        catch (error) {
            logger.error("[RecommendationSystem] Erreur lors de l'initialisation:", error);
        }
    }
    updateUserPreferences(userId, preferences) {
        const profile = this.userProfiles.get(userId);
        if (!profile)
            return;
        profile.preferences = { ...profile.preferences, ...preferences };
        this.userProfiles.set(userId, profile);
    }
    addInteraction(userId, gameId, interactionType) {
        const profile = this.userProfiles.get(userId);
        if (!profile)
            return;
        profile.history.games.push(gameId);
        profile.history.interactions.push(`${interactionType}:${gameId}`);
        if (interactionType === "like") {
            profile.activityScore += 10;
        }
        else if (interactionType === "dislike") {
            profile.activityScore -= 5;
        }
        else {
            profile.activityScore += 1;
        }
        this.userProfiles.set(userId, profile);
    }
    async generateRecommendations(userId, count = 5) {
        const profile = this.userProfiles.get(userId);
        if (!profile) {
            logger.warn(`[RecommendationSystem] Profil non trouvé pour ${userId}`);
            return [];
        }
        const recommendations = [];
        const availableGames = await this.getAvailableGames();
        for (const game of availableGames) {
            if (profile.history.games.includes(game.id))
                continue;
            const matchScore = this.calculateMatchScore(profile, game);
            const reasons = this.generateReasons(profile, game);
            let sentiment;
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
    calculateMatchScore(profile, game) {
        let score = 0;
        const genreMatches = game.genres.filter((g) => profile.preferences.genres.includes(g)).length;
        score += genreMatches * 20;
        if (profile.preferences.platforms.includes(game.platform)) {
            score += 30;
        }
        if (game.price >= profile.preferences.priceRange.min &&
            game.price <= profile.preferences.priceRange.max) {
            score += 15;
        }
        if (game.popularity > 80) {
            score += 10;
        }
        return Math.min(score, 100);
    }
    generateReasons(profile, game) {
        const reasons = [];
        const genreMatches = game.genres.filter((g) => profile.preferences.genres.includes(g));
        if (genreMatches.length > 0) {
            reasons.push(`Correspond à vos genres: ${genreMatches.join(", ")}`);
        }
        if (profile.preferences.platforms.includes(game.platform)) {
            reasons.push(`Disponible sur ${game.platform}`);
        }
        if (game.price <= profile.preferences.priceRange.max) {
            reasons.push(`Prix dans votre budget: ${game.price}€`);
        }
        if (game.popularity > 80) {
            reasons.push("Très populaire parmi les joueurs");
        }
        return reasons;
    }
    async getAvailableGames() {
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
    async learnFromInteractions(userId) {
        const profile = this.userProfiles.get(userId);
        if (!profile)
            return;
        const likedGenres = new Set();
        const likedPlatforms = new Set();
        for (const interaction of profile.history.interactions) {
            const [type, gameId] = interaction.split(":");
            if (type === "like") {
                const game = this.gameDatabase.get(gameId);
                if (game) {
                    game.genres.forEach((g) => likedGenres.add(g));
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
    getUserProfile(userId) {
        return this.userProfiles.get(userId) || null;
    }
    async saveProfile(userId) {
        const profile = this.userProfiles.get(userId);
        if (!profile)
            return;
        await prisma.userProfile.upsert({
            where: { userId },
            create: profile,
            update: profile,
        });
    }
    async loadProfilesFromPrisma() {
        const profiles = await prisma.userProfile.findMany();
        for (const profile of profiles) {
            this.userProfiles.set(profile.userId, profile);
        }
        logger.info(`[RecommendationSystem] ${profiles.length} profil(s) chargé(s) depuis Prisma`);
    }
}
export const recommendationSystem = new RecommendationSystem();
//# sourceMappingURL=recommendation-system.js.map