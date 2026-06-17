// src/rawgClient.d.ts
export interface RawgGameResult {
  id: number;
  name: string;
  background_image: string;
}

export interface RawgClientOptions {
  /** Override RAWG_API_KEY env. */
  apiKey?: string;
  /** Timeout par requ\u00eate HTTP (ms). D\u00e9faut 4000. */
  timeoutMs?: number;
  /** Capacit\u00e9 max du cache LRU (entr\u00e9es). D\u00e9faut 500. */
  maxEntries?: number;
  userAgent?: string;
  logger?: {
    info?: (...args: unknown[]) => void;
    warn?: (...args: unknown[]) => void;
    error?: (...args: unknown[]) => void;
  };
  /** Permet d'injecter un fetch mock\u00e9 dans les tests. */
  fetchImpl?: typeof globalThis.fetch;
  cooldownMs?: number;
}

export class RawgClient {
  constructor(options?: RawgClientOptions);
  isEnabled(): boolean;
  cacheSize(): number;
  cooldownUntil(): number;
  inFlightCount(): number;
  /** Retourne le premier match RAWG ou `null` (404 / 429 / timeout / pas de cl\u00e9). */
  searchByTitle(title: string, options?: { signal?: AbortSignal }): Promise<RawgGameResult | null>;
}

/** Test-only interface for accessing internal state */
export interface RawgClientInternals {
  cacheSize(): number;
  cooldownUntil(): number;
  inFlightCount(): number;
}

export default { RawgClient };
