/**
 * Récupère une réponse mise en cache
 */
export declare function getCachedResponse(message: string, context?: string): string | null;
/**
 * Met en cache une réponse IA
 */
export declare function cacheResponse(message: string, response: string, context?: string): void;
/**
 * Efface le cache pour un message spécifique
 */
export declare function clearCacheEntry(message: string, context?: string): void;
/**
 * Efface tout le cache
 */
export declare function clearAllCache(): void;
/**
 * Récupère les statistiques du cache
 */
export declare function getCacheStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    oldestEntry: number | null;
    newestEntry: number | null;
};
/**
 * Nettoie les entrées expirées du cache
 */
export declare function cleanupExpiredCache(): void;
//# sourceMappingURL=aiCache.d.ts.map