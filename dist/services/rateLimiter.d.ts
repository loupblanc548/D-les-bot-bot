interface RateLimitConfig {
    maxRequests: number;
    windowMs: number;
    cooldownMs: number;
}
interface GuildRateLimitConfig {
    enabled: boolean;
    configs: Record<string, RateLimitConfig>;
    adminBypass: boolean;
    adminRoles: string[];
}
/**
 * Configure une limite personnalisée pour un serveur
 */
export declare function configureGuildRateLimit(guildId: string, config: Partial<GuildRateLimitConfig>): void;
/**
 * Vérifie si un utilisateur a le bypass admin pour un serveur
 */
export declare function hasAdminBypass(userId: string, guildId: string, userRoles?: string[]): boolean;
/**
 * Récupère la configuration de rate limit pour un serveur
 */
export declare function getGuildRateLimitConfig(guildId: string): GuildRateLimitConfig | null;
/**
 * Désactive le rate limiting pour un serveur
 */
export declare function disableGuildRateLimit(guildId: string): void;
/**
 * Active le rate limiting pour un serveur
 */
export declare function enableGuildRateLimit(guildId: string): void;
/**
 * Vérifie si un utilisateur est limité (avec support serveur)
 * @param userId - ID de l'utilisateur
 * @param type - Type de requête (ai_chat, translate, general)
 * @param guildId - ID du serveur (optionnel)
 * @param userRoles - Rôles de l'utilisateur pour le bypass admin
 * @returns { allowed: boolean, remaining: number, resetTime: number }
 */
export declare function checkRateLimit(userId: string, type?: string, guildId?: string, userRoles?: string[]): {
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