declare const redis: any;
/**
 * Connecte Redis. Non-bloquant — si Redis est down, le bot continue sans cache.
 */
export declare function connectRedis(): Promise<void>;
/**
 * Stocke une valeur en cache avec TTL.
 */
export declare function setCache(key: string, value: unknown, ttlInSeconds: number): Promise<void>;
/**
 * Récupère une valeur depuis le cache.
 * Retourne null si la clé n'existe pas ou si Redis est down.
 */
export declare function getCache<T = unknown>(key: string): Promise<T | null>;
/**
 * Supprime une clé du cache.
 */
export declare function deleteCache(key: string): Promise<void>;
/**
 * Supprime plusieurs clés du cache (pattern).
 */
export declare function deleteCachePattern(pattern: string): Promise<void>;
/**
 * Incrémente un compteur dans le cache.
 */
export declare function incrementCache(key: string): Promise<number>;
/**
 * Décrémente un compteur dans le cache.
 */
export declare function decrementCache(key: string): Promise<number>;
/**
 * Vérifie si une clé existe dans le cache.
 */
export declare function cacheExists(key: string): Promise<boolean>;
/**
 * Définit une expiration sur une clé existante.
 */
export declare function setCacheExpire(key: string, ttlInSeconds: number): Promise<boolean>;
/**
 * Récupère le TTL restant d'une clé.
 */
export declare function getCacheTTL(key: string): Promise<number>;
/**
 * Déconnecte proprement Redis.
 */
export declare function disconnectRedis(): Promise<void>;
export default redis;
//# sourceMappingURL=redis.d.ts.map