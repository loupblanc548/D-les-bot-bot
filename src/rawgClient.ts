// src/rawgClient.ts
// Client RAWG.io avec cache, déduplication des requêtes en vol,
// cooldown sur 429, retry sur timeout interne et support AbortSignal.

export interface RawgGame {
  id: number;
  name: string;
  background_image: string | null;
}

interface RawgLogger {
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
  debug?: (...args: unknown[]) => void;
}

export interface RawgClientOptions {
  apiKey?: string;
  fetchImpl?: typeof globalThis.fetch;
  logger?: RawgLogger;
  timeoutMs?: number;
  cooldownMs?: number;
  baseUrl?: string;
}

interface SearchOptions {
  signal?: AbortSignal;
}

const NOOP_LOG: Required<RawgLogger> = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

export class RawgClient {
  private apiKey: string | undefined;
  private fetchImpl: typeof globalThis.fetch;
  private logger: Required<RawgLogger>;
  private timeoutMs: number;
  private cooldownMs: number;
  private baseUrl: string;

  private cache = new Map<string, RawgGame | null>();
  private inFlight = new Map<string, Promise<RawgGame | null>>();
  private _cooldownUntil = 0;

  constructor(options: RawgClientOptions = {}) {
    this.apiKey =
      "apiKey" in options ? options.apiKey : process.env.RAWG_API_KEY;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.logger = { ...NOOP_LOG, ...(options.logger ?? {}) };
    this.timeoutMs = options.timeoutMs ?? 8000;
    this.cooldownMs = options.cooldownMs ?? 60_000;
    this.baseUrl = options.baseUrl ?? "https://api.rawg.io/api/games";
  }

  isEnabled(): boolean {
    return Boolean(this.apiKey);
  }

  cacheSize(): number {
    return this.cache.size;
  }

  inFlightCount(): number {
    return this.inFlight.size;
  }

  cooldownUntil(): number {
    return this._cooldownUntil;
  }

  async searchByTitle(
    title: string,
    opts: SearchOptions = {},
  ): Promise<RawgGame | null> {
    if (!this.isEnabled()) return null;

    // Cache (inclut les valeurs null)
    if (this.cache.has(title)) {
      return this.cache.get(title) ?? null;
    }

    // Cooldown actif → ne pas appeler l'API
    if (Date.now() < this._cooldownUntil) {
      return null;
    }

    // Déduplication des requêtes concurrentes
    const existing = this.inFlight.get(title);
    if (existing) return existing;

    const promise = this.doSearch(title, opts).finally(() => {
      this.inFlight.delete(title);
    });
    this.inFlight.set(title, promise);
    return promise;
  }

  private async doSearch(
    title: string,
    opts: SearchOptions,
  ): Promise<RawgGame | null> {
    const result = await this.fetchWithRetry(title, opts, true);
    return result;
  }

  private async fetchWithRetry(
    title: string,
    opts: SearchOptions,
    allowRetry: boolean,
  ): Promise<RawgGame | null> {
    const internalController = new AbortController();
    const timer = setTimeout(() => internalController.abort(), this.timeoutMs);

    const onCallerAbort = () => internalController.abort();
    if (opts.signal) {
      if (opts.signal.aborted) internalController.abort();
      else opts.signal.addEventListener("abort", onCallerAbort, { once: true });
    }

    const url =
      `${this.baseUrl}?key=${encodeURIComponent(this.apiKey ?? "")}` +
      `&search=${encodeURIComponent(title)}&page_size=1`;

    try {
      const res = await this.fetchImpl(url, { signal: internalController.signal });

      if (res.status === 429) {
        this._cooldownUntil = Date.now() + this.cooldownMs;
        this.logger.warn?.(`[RawgClient] 429 rate limited — cooldown activé`);
        return null;
      }

      if (!res.ok) {
        this.logger.warn?.(`[RawgClient] HTTP ${res.status} pour "${title}"`);
        return null;
      }

      const data = (await res.json()) as { results?: RawgGame[] };
      const first = data?.results?.[0];
      const game: RawgGame | null = first
        ? {
            id: first.id,
            name: first.name,
            background_image: first.background_image ?? null,
          }
        : null;

      this.cache.set(title, game);
      return game;
    } catch (error) {
      const isAbort =
        error instanceof Error && error.name === "AbortError";

      // Abort déclenché par l'appelant → pas de retry
      if (isAbort && opts.signal?.aborted) {
        return null;
      }

      // Timeout interne → un seul retry
      if (isAbort && allowRetry) {
        return this.fetchWithRetry(title, opts, false);
      }

      this.logger.error?.(`[RawgClient] Erreur pour "${title}":`, error);
      return null;
    } finally {
      clearTimeout(timer);
      if (opts.signal) opts.signal.removeEventListener("abort", onCallerAbort);
    }
  }
}

export default RawgClient;
