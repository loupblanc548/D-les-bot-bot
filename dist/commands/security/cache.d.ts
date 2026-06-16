type AntiRaidCacheEntry = {
    seuilHeures: number;
    active: boolean;
    cachedAt: number;
};
export declare const antiRaidCache: Map<string, AntiRaidCacheEntry>;
export declare const ANTI_RAID_CACHE_TTL_MS = 30000;
export declare function startAntiRaidCacheSweeper(): void;
export declare function stopAntiRaidCacheSweeper(): void;
type AntiPhishingCacheEntry = {
    active: boolean;
    cachedAt: number;
};
export declare const antiPhishingCache: Map<string, AntiPhishingCacheEntry>;
export declare const ANTI_PHISHING_CACHE_TTL_MS = 30000;
export declare function stopAntiPhishingCacheSweeper(): void;
export {};
//# sourceMappingURL=cache.d.ts.map