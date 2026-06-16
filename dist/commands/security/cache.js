"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ANTI_PHISHING_CACHE_TTL_MS = exports.antiPhishingCache = exports.ANTI_RAID_CACHE_TTL_MS = exports.antiRaidCache = void 0;
exports.startAntiRaidCacheSweeper = startAntiRaidCacheSweeper;
exports.stopAntiRaidCacheSweeper = stopAntiRaidCacheSweeper;
exports.stopAntiPhishingCacheSweeper = stopAntiPhishingCacheSweeper;
exports.antiRaidCache = new Map();
exports.ANTI_RAID_CACHE_TTL_MS = 30_000;
// Sweeper periode : nettoie les entrees expirees du cache toutes les 30 secondes
let antiRaidInterval = null;
function startAntiRaidCacheSweeper() {
    if (antiRaidInterval)
        return;
    if (process.env.NODE_ENV !== 'test') {
        antiRaidInterval = setInterval(() => {
            const now = Date.now();
            for (const [guildId, entry] of exports.antiRaidCache) {
                if (now - entry.cachedAt > exports.ANTI_RAID_CACHE_TTL_MS) {
                    exports.antiRaidCache.delete(guildId);
                }
            }
        }, exports.ANTI_RAID_CACHE_TTL_MS);
    }
}
function stopAntiRaidCacheSweeper() {
    if (antiRaidInterval) {
        clearInterval(antiRaidInterval);
        antiRaidInterval = null;
    }
}
exports.antiPhishingCache = new Map();
exports.ANTI_PHISHING_CACHE_TTL_MS = 30_000;
let antiPhishingInterval = null;
if (process.env.NODE_ENV !== "test") {
    antiPhishingInterval = setInterval(() => {
        const now = Date.now();
        for (const [guildId, entry] of exports.antiPhishingCache) {
            if (now - entry.cachedAt > exports.ANTI_PHISHING_CACHE_TTL_MS) {
                exports.antiPhishingCache.delete(guildId);
            }
        }
    }, exports.ANTI_PHISHING_CACHE_TTL_MS);
}
function stopAntiPhishingCacheSweeper() {
    if (antiPhishingInterval) {
        clearInterval(antiPhishingInterval);
        antiPhishingInterval = null;
    }
}
//# sourceMappingURL=cache.js.map