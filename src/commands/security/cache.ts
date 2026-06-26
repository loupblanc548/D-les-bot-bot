// ── Cache anti-raid (evite un appel DB par membre qui rejoint) ──────────────
type AntiRaidCacheEntry = { seuilHeures: number; active: boolean; cachedAt: number };
export const antiRaidCache = new Map<string, AntiRaidCacheEntry>();
export const ANTI_RAID_CACHE_TTL_MS = 30_000;

// Sweeper periode : nettoie les entrees expirees du cache toutes les 30 secondes
let antiRaidInterval: NodeJS.Timeout | null = null;

export function startAntiRaidCacheSweeper() {
  if (antiRaidInterval) return;
  if (process.env.NODE_ENV !== "test") {
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

// Cache anti-phishing
type AntiPhishingCacheEntry = { active: boolean; cachedAt: number };
export const antiPhishingCache = new Map<string, AntiPhishingCacheEntry>();
export const ANTI_PHISHING_CACHE_TTL_MS = 30_000;
let antiPhishingInterval: NodeJS.Timeout | null = null;

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
