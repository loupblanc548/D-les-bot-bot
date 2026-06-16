interface UserProfile {
    userId: string;
    preferences: {
        genres: string[];
        platforms: string[];
        priceRange: {
            min: number;
            max: number;
        };
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
declare class RecommendationSystem {
    private userProfiles;
    private gameDatabase;
    constructor();
    initializeUserProfile(userId: string): Promise<void>;
    updateUserPreferences(userId: string, preferences: Partial<UserProfile["preferences"]>): void;
    addInteraction(userId: string, gameId: string, interactionType: "view" | "like" | "dislike"): void;
    generateRecommendations(userId: string, count?: number): Promise<GameRecommendation[]>;
    private calculateMatchScore;
    private generateReasons;
    private getAvailableGames;
    learnFromInteractions(userId: string): Promise<void>;
    getUserProfile(userId: string): UserProfile | null;
    saveProfile(userId: string): Promise<void>;
    loadProfilesFromPrisma(): Promise<void>;
}
export declare const recommendationSystem: RecommendationSystem;
export {};
//# sourceMappingURL=recommendation-system.d.ts.map