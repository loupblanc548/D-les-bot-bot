interface RateLimitConfig {
    maxRequests: number;
    windowMs: number;
    cooldownMs: number;
}
/**
 * Vérifie si un utilisateur est limité
 * @param userId - ID de l'utilisateur
 * @param type - Type de requête (ai_chat, translate, general)
 * @param guildId - ID du serveur (optionnel)
 * @returns { allowed: boolean, remaining: number, resetTime: number }
 */
export declare function checkRateLimit(userId: string, type?: string, guildId?: string): {
    allowed: boolean;
    remaining: number;
    resetTime: number;
};
/**
 * Réinitialise le rate limit pour un utilisateur
 */
export declare function resetRateLimit(userId: string, type?: string, guildId?: string): void;
/**
 * Réinitialise tous les rate limits pour un utilisateur
 */
export declare function resetAllRateLimitsForUser(userId: string, guildId?: string): void;
/**
 * Récupère les statistiques de rate limiting
 */
export declare function getRateLimitStats(): {
    totalEntries: number;
    entriesByType: Record<string, number>;
    oldestEntry: number | null;
};
/**
 * Nettoie les entrées expirées du rate limiting
 */
export declare function cleanupExpiredRateLimits(): void;
/**
 * Configure une limite personnalisée pour un type de requête
 */
export declare function configureRateLimit(type: string, config: RateLimitConfig): void;
export {};
//# sourceMappingURL=rateLimiter.d.ts.map