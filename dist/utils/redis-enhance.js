import { getCache, setCache, deleteCache } from "../utils/redis.js";
/**
 * Cache avec fallback: utilise Redis si dispo, sinon un Map en mémoire.
 */
const memoryFallback = new Map();
const MAX_MEMORY_ENTRIES = 1000;
export async function cachedGet(key) {
    try {
        const result = await getCache(key);
        if (result !== null)
            return result;
    }
    catch {
        // Redis down, fallback to memory
    }
    const entry = memoryFallback.get(key);
    if (entry && Date.now() < entry.expiresAt) {
        return entry.value;
    }
    if (entry)
        memoryFallback.delete(key);
    return null;
}
export async function cachedSet(key, value, ttlSeconds = 300) {
    try {
        await setCache(key, value, ttlSeconds);
    }
    catch {
        // Redis down, fallback to memory
    }
    memoryFallback.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}
export async function cachedDelete(key) {
    try {
        await deleteCache(key);
    }
    catch { /* ignore */ }
    memoryFallback.delete(key);
}
/**
 * Cache une fonction avec une clé donnée.
 * Usage: const data = await withCache("guild:123:config", 60, () => prisma.guildConfig.findUnique(...))
 */
export async function withCache(key, ttlSeconds, fetcher) {
    const cached = await cachedGet(key);
    if (cached !== null)
        return cached;
    const fresh = await fetcher();
    await cachedSet(key, fresh, ttlSeconds);
    return fresh;
}
// Nettoyage périodique du fallback mémoire
const _pruneInterval = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of memoryFallback) {
        if (now >= v.expiresAt || memoryFallback.size > MAX_MEMORY_ENTRIES)
            memoryFallback.delete(k);
    }
}, 60_000);
if (_pruneInterval.unref)
    _pruneInterval.unref();
//# sourceMappingURL=redis-enhance.js.map