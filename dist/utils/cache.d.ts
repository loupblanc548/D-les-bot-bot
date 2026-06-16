declare class SimpleCache<T> {
    private cache;
    private defaultTtlMs;
    constructor(defaultTtlMs?: number);
    set(key: string, value: T, ttlMs?: number): void;
    get(key: string): T | undefined;
    has(key: string): boolean;
    delete(key: string): boolean;
    clear(): void;
    cleanup(): number;
    get size(): number;
}
export declare const dbCache: SimpleCache<boolean>;
export declare const rssCache: SimpleCache<any>;
export declare const apiCache: SimpleCache<any>;
export {};
//# sourceMappingURL=cache.d.ts.map