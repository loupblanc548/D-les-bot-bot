export const antiRaidCache = new Map();
export const ANTI_RAID_CACHE_TTL_MS = 30_000;
// Sweeper periode : nettoie les entrees expirees du cache toutes les 30 secondes
let antiRaidInterval = null;
export function startAntiRaidCacheSweeper() {
    if (antiRaidInterval)
        return;
    if (process.env.NODE_ENV !== 'test') {
        antiRaidInterval = setInterval(() => {
            const now = Date.now();
            for (const [guildId, entry] of antiRaidCache) {
                if (now - entry.cachedAt > ANTI_RAID_CACHE_TTL_MS) {
                    antiRaidCache.delete(guildId);
                }
            }
        }, ANTI_RAID_CACHE_TTL_MS);
    }
}
export function stopAntiRaidCacheSweeper() {
    if (antiRaidInterval) {
        clearInterval(antiRaidInterval);
        antiRaidInterval = null;
    }
}
export const antiPhishingCache = new Map();
export const ANTI_PHISHING_CACHE_TTL_MS = 30_000;
let antiPhishingInterval = null;
if (process.env.NODE_ENV !== "test") {
    antiPhishingInterval = setInterval(() => {
        const now = Date.now();
        for (const [guildId, entry] of antiPhishingCache) {
            if (now - entry.cachedAt > ANTI_PHISHING_CACHE_TTL_MS) {
                antiPhishingCache.delete(guildId);
            }
        }
    }, ANTI_PHISHING_CACHE_TTL_MS);
}
export function stopAntiPhishingCacheSweeper() {
    if (antiPhishingInterval) {
        clearInterval(antiPhishingInterval);
        antiPhishingInterval = null;
    }
}
//# sourceMappingURL=cache.js.map