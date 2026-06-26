// src/rawgClient.js
// @ts-check
/**
 * rawgClient.js — client RAWG.io pour fallback images de jeux vidéo.
 *
 * Politique de rate-limit :
 *   - 429 → active un cooldown (60 s) : les recherches suivantes court-circuitent l'API.
 *   - Dedup in-flight : si searchByTitle('X') est 2 fois en parallèle,
 *     une seule requête HTTP sort. Les autres await la même Promise.
 *   - Cache LRU (~500 entrées, TTL infini) : hit direct.
 *   - Timeout (4 s) → AbortController ; retry unique après 1 s.
 */

import { setTimeout as wait } from 'node:timers/promises';

const ENDPOINT_BASE = 'https://api.rawg.io/api';
const DEFAULT_TIMEOUT_MS = 4000;
const DEFAULT_MAX_ENTRIES = 500;
const DEFAULT_COOLDOWN_MS = 60000;

class LruMap {
  /** @param {number} max */
  constructor(max) {
    if (!Number.isFinite(max) || max < 1) throw new Error('LruMap: max must be >= 1');
    this.max = max;
    this.map = new Map();
  }
  /** @param {string} key */
  get(key) {
    if (!this.map.has(key)) return undefined;
    const v = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, v);
    return v;
  }
  /** @param {string} key */
  has(key) { return this.map.has(key); }
  /**
   * @param {string} key
   * @param {*} value
   */
  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }
  clear() { this.map.clear(); }
  get size() { return this.map.size; }
}

export class RawgClient {
  /** @param {Record<string, any>} [options] */
  constructor(options = {}) {
    this.apiKey = options.apiKey !== undefined ? options.apiKey : process.env.RAWG_API_KEY;
    this.timeoutMs = options.timeoutMs !== undefined ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
    this.maxEntries = options.maxEntries !== undefined ? options.maxEntries : DEFAULT_MAX_ENTRIES;
    this.cooldownMs = options.cooldownMs !== undefined ? options.cooldownMs : DEFAULT_COOLDOWN_MS;
    this.userAgent = options.userAgent || 'discord-rss-tracker/2.0 (+bot)';
    this.logger = options.logger || console;
    this.fetchImpl = options.fetchImpl ||
      (globalThis.fetch ? globalThis.fetch.bind(globalThis) : function () { return Promise.reject(new Error('fetch indisponible')); });
    this.cache = new LruMap(this.maxEntries);
    this._inFlight = new Map();
    this._cooldownUntil = 0;
    this.disabled = !this.apiKey;
    if (this.disabled) {
      this.logger.warn ? this.logger.warn('[rawgClient] RAWG_API_KEY absent — fallback RAWG désactivé.') : null;
    }
  }

  isEnabled() { return !this.disabled; }
  cacheSize() { return this.cache.size; }
  cooldownUntil() { return this._cooldownUntil; }
  inFlightCount() { return this._inFlight.size; }

  /**
   * @param {string} title
   * @param {{ signal?: AbortSignal }} [options]
   */
  searchByTitle(title, options) {
    if (this.disabled) return Promise.resolve(null);
    options = options || {};
    const cleaned = String(title || '').trim();
    if (!cleaned) return Promise.resolve(null);

    if (Date.now() < this._cooldownUntil) {
      if (this.logger.info) this.logger.info('[rawgClient] en cooldown jusqu\'a ' + new Date(this._cooldownUntil).toISOString() + ' — skip.');
      return Promise.resolve(null);
    }
    const key = this.cacheKey(cleaned);

    if (this.cache.has(key)) return Promise.resolve(this.cache.get(key));
    const existing = this._inFlight.get(key);
    if (existing) return existing;

    const self = this;
    const job = (async () => {
      const url = new URL(ENDPOINT_BASE + '/games');
      url.searchParams.set('search', cleaned);
      url.searchParams.set('page_size', '1');
      url.searchParams.set('key', String(self.apiKey));

      let lastError = null;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(function () { controller.abort(); }, self.timeoutMs);
        const signal = options.signal ? composeAbortSignal(options.signal, controller.signal) : controller.signal;
        try {
          const res = await self.fetchImpl(url.toString(), {
            method: 'GET',
            signal: signal,
            headers: { 'User-Agent': self.userAgent, 'Accept': 'application/json' },
          });
          clearTimeout(timer);

          if (res.status === 429) {
            self._cooldownUntil = Date.now() + self.cooldownMs;
            if (self.logger.warn) self.logger.warn('[rawgClient] 429 — cooldown activé jusqu\'a ' + new Date(self._cooldownUntil).toISOString() + '.');
            return null;
          }
          if (!res.ok) {
            if (self.logger.warn) self.logger.warn('[rawgClient] HTTP ' + res.status + ' pour ' + self.short(cleaned));
            return null;
          }
          const json = await res.json().catch(function () { return null; });
          const first = json && Array.isArray(json.results) ? json.results[0] : null;
          if (!first || typeof first !== 'object') {
            if (self.logger.info) self.logger.info('[rawgClient] aucun résultat pour ' + self.short(cleaned));
            self.cache.set(key, null);
            return null;
          }
          const backgroundImage = typeof first.background_image === 'string'
            ? first.background_image
            : (typeof first.background_image_additional === 'string' ? first.background_image_additional : null);
          if (typeof backgroundImage !== 'string' || backgroundImage.length === 0) {
            self.cache.set(key, null);
            return null;
          }
          const result = {
            id: Number(first.id) || 0,
            name: typeof first.name === 'string' ? first.name : cleaned,
            background_image: backgroundImage,
          };
          self.cache.set(key, result);
          return result;
        } catch (err) {
          clearTimeout(timer);
          lastError = err instanceof Error ? err : new Error(String(err));
          const isTimeout = lastError.name === 'AbortError' || lastError.name === 'TimeoutError' ||
            String(lastError.message || '').toLowerCase().indexOf('abort') !== -1;
          if (isTimeout && attempt < 2) {
            if (self.logger.warn) self.logger.warn('[rawgClient] timeout, retry dans 1 s pour ' + self.short(cleaned));
            await wait(1000);
            continue;
          }
          if (options.signal && options.signal.aborted) {
            if (self.logger.info) self.logger.info('[rawgClient] annulé par l\'appelant pour ' + self.short(cleaned));
            return null;
          }
          if (self.logger.warn) self.logger.warn('[rawgClient] échec pour ' + self.short(cleaned) + ' : ' + (lastError.message || lastError));
          return null;
        }
      }
      if (self.logger.warn) self.logger.warn('[rawgClient] abandonné après 2 tentatives pour ' + self.short(cleaned) + ' : ' + (lastError && lastError.message));
      return null;
    })().finally(function () {
      self._inFlight.delete(key);
    });
    self._inFlight.set(key, job);
    return job;
  }

  /** @param {string} title */
  cacheKey(title) {
    return title.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 120);
  }
  /** @param {string} title */
  short(title) { return title.slice(0, 60); }
}

/**
 * @param {AbortSignal} a
 * @param {AbortSignal} b
 */
function composeAbortSignal(a, b) {
  if (a.aborted) return a;
  if (b.aborted) return b;
  const ctrl = new AbortController();
  const onA = function () { ctrl.abort(); };
  const onB = function () { ctrl.abort(); };
  a.addEventListener('abort', onA, { once: true });
  b.addEventListener('abort', onB, { once: true });
  return ctrl.signal;
}

export default { RawgClient: RawgClient };
