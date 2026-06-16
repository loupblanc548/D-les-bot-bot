"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiCache = exports.rssCache = exports.dbCache = void 0;
/**
 * Simple in-memory cache with TTL support
 */
class CacheNode {
    value;
    expiresAt;
    constructor(value, ttlMs) {
        this.value = value;
        this.expiresAt = Date.now() + ttlMs;
    }
    isExpired() {
        return Date.now() > this.expiresAt;
    }
}
class SimpleCache {
    cache = new Map();
    defaultTtlMs;
    constructor(defaultTtlMs = 300000) {
        this.defaultTtlMs = defaultTtlMs;
    }
    set(key, value, ttlMs) {
        const ttl = ttlMs || this.defaultTtlMs;
        this.cache.set(key, new CacheNode(value, ttl));
    }
    get(key) {
        const node = this.cache.get(key);
        if (!node)
            return undefined;
        if (node.isExpired()) {
            this.cache.delete(key);
            return undefined;
        }
        return node.value;
    }
    has(key) {
        return this.get(key) !== undefined;
    }
    delete(key) {
        return this.cache.delete(key);
    }
    clear() {
        this.cache.clear();
    }
    // Clean up expired entries
    cleanup() {
        let removed = 0;
        for (const [key, node] of this.cache.entries()) {
            if (node.isExpired()) {
                this.cache.delete(key);
                removed++;
            }
        }
        return removed;
    }
    get size() {
        return this.cache.size;
    }
}
// Singleton instances for different cache types
exports.dbCache = new SimpleCache(60000); // 1 minute for DB queries
exports.rssCache = new SimpleCache(300000); // 5 minutes for RSS feeds
exports.apiCache = new SimpleCache(120000); // 2 minutes for API responses
// Cleanup expired entries every 5 minutes
setInterval(() => {
    exports.dbCache.cleanup();
    exports.rssCache.cleanup();
    exports.apiCache.cleanup();
}, 300000);
//# sourceMappingURL=cache.js.map