import type { Middleware } from "./compose.js";
export interface RateLimitConfig {
    /** Fenêtre de temps (en secondes) pendant laquelle les requêtes sont comptées. */
    windowSeconds: number;
    /** Nombre maximum de requêtes autorisées dans la fenêtre. */
    maxRequests: number;
    /** Si vrai, les administrateurs et le propriétaire du bot ne sont pas limités. */
    bypassAdmins: boolean;
}
export declare const DEFAULT_RATE_LIMIT: RateLimitConfig;
/**
 * Middleware de rate-limiting (fenêtre fixe) basé sur Redis.
 * - Clé = `rl:{guildId|dms}:{userId}:{commandName}`.
 * - Bypass configurable pour les admins et le propriétaire du serveur.
 * - Tolère l'indisponibilité de Redis (log warn + laisse passer la requête).
 */
export declare function createRateLimitMiddleware(override?: Partial<RateLimitConfig>): Middleware;
//# sourceMappingURL=rateLimit.d.ts.map