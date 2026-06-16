export declare function cachedGet<T>(key: string): Promise<T | null>;
export declare function cachedSet(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
export declare function cachedDelete(key: string): Promise<void>;
/**
 * Cache une fonction avec une clé donnée.
 * Usage: const data = await withCache("guild:123:config", 60, () => prisma.guildConfig.findUnique(...))
 */
export declare function withCache<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T>;
//# sourceMappingURL=redis-enhance.d.ts.map