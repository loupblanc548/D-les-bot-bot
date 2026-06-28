/**
 * Simple in-memory cache with TTL support
 */
class CacheNode<T> {
  value: T;
  expiresAt: number;

  constructor(value: T, ttlMs: number) {
    this.value = value;
    this.expiresAt = Date.now() + ttlMs;
  }

  isExpired(): boolean {
    return Date.now() > this.expiresAt;
  }
}

class SimpleCache<T> {
  private cache: Map<string, CacheNode<T>> = new Map();
  private defaultTtlMs: number;
  private maxEntries: number;

  constructor(defaultTtlMs: number = 300000, maxEntries: number = 500) {
    this.defaultTtlMs = defaultTtlMs;
    this.maxEntries = maxEntries;
  }

  set(key: string, value: T, ttlMs?: number): void {
    const ttl = ttlMs || this.defaultTtlMs;
    // LRU eviction: remove oldest entry if at capacity
    if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    this.cache.set(key, new CacheNode(value, ttl));
  }

  get(key: string): T | undefined {
    const node = this.cache.get(key);
    if (!node) return undefined;

    if (node.isExpired()) {
      this.cache.delete(key);
      return undefined;
    }

    return node.value;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  // Clean up expired entries
  cleanup(): number {
    let removed = 0;
    for (const [key, node] of this.cache.entries()) {
      if (node.isExpired()) {
        this.cache.delete(key);
        removed++;
      }
    }
    return removed;
  }

  get size(): number {
    return this.cache.size;
  }
}

// Singleton instances for different cache types
export const dbCache = new SimpleCache<boolean>(60000, 200); // 1 min TTL, 200 max entries
export const rssCache = new SimpleCache<unknown>(300000, 100); // 5 min TTL, 100 max entries
export const apiCache = new SimpleCache<unknown>(120000, 150); // 2 min TTL, 150 max entries

// Cleanup expired entries every 5 minutes
const _cacheCleanup = setInterval(() => {
  dbCache.cleanup();
  rssCache.cleanup();
  apiCache.cleanup();
}, 300000);
if (_cacheCleanup.unref) _cacheCleanup.unref();
