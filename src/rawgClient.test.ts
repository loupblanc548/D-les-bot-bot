// src/rawgClient.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RawgClient } from './rawgClient.js';

const noopLog = { info: () => {}, warn: () => {}, error: () => {} };

/** @returns {typeof fetch} */
function fakeFetch(body: any, status = 200): Promise<any> {
  return /** @type {any} */ (vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers(),
    url: '',
    redirected: false,
    body: null,
    bodyUsed: false,
    text: async () => JSON.stringify(body),
    json: async () => body,
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob(),
    formData: async () => new FormData(),
    clone: () => ({ ok: status >= 200 && status < 300, status, json: async () => body })
  })) as unknown as Response);;
}

describe('RawgClient', () => {
  const originalKey = process.env.RAWG_API_KEY;

  beforeEach(() => {
    process.env.RAWG_API_KEY = 'test-key';
  });
  afterEach(() => {
    process.env.RAWG_API_KEY = originalKey;
    vi.useRealTimers();
  });

  it('isEnabled reflects apiKey presence; cacheSize starts at 0', () => {
    const c = new RawgClient({ logger: noopLog });
    expect(c.isEnabled()).toBe(true);
    expect(c.cacheSize()).toBe(0);
  });

  it('disabled when no apiKey in env', () => {
    delete process.env.RAWG_API_KEY;
    const c = new RawgClient({ apiKey: undefined, logger: noopLog });
    expect(c.isEnabled()).toBe(false);
  });

  it('returns image on success and populates cache', async () => {
    const fetchImpl = fakeFetch({
      results: [{ id: 123, name: 'Fortnite', background_image: 'https://cdn.rawg.example/fortnite.jpg' }],
    });
    const c = new RawgClient({ fetchImpl, logger: noopLog });
    const r = await c.searchByTitle('Fortnite');
    expect(r?.background_image).toBe('https://cdn.rawg.example/fortnite.jpg');
    expect(c.cacheSize()).toBe(1);
  });

  it('returns from cache without re-fetching', async () => {
    const fetchImpl = fakeFetch({ results: [{ id: 1, name: 'X', background_image: 'https://x.jpg' }] });
    const c = new RawgClient({ fetchImpl, logger: noopLog });
    await c.searchByTitle('X');
    const f = fetchImpl;
    f.mockClear();
    const r2 = await c.searchByTitle('X');
    expect(r2?.background_image).toBe('https://x.jpg');
    expect(f).not.toHaveBeenCalled();
  });

  it('returns null on 429', async () => {
    const fetchImpl = fakeFetch(null, 429);
    const c = new RawgClient({ fetchImpl, logger: noopLog });
    const r = await c.searchByTitle('Whatever');
    expect(r).toBeNull();
  });

  it('returns null when results array empty (cached as null)', async () => {
    const fetchImpl = fakeFetch({ results: [] });
    const c = new RawgClient({ fetchImpl, logger: noopLog });
    const r = await c.searchByTitle('Nothing');
    expect(r).toBeNull();
    const f = fetchImpl;
    f.mockClear();
    const r2 = await c.searchByTitle('Nothing');
    expect(r2).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it('retries once on timeout', async () => {
    let calls = 0;
    const fetchImpl = /** @type {any} */ (vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ results: [{ id: 9, name: 'AfterRetry', background_image: 'https://r.jpg' }] }),
      };
    }));
    const c = new RawgClient({ fetchImpl, logger: noopLog, timeoutMs: 50 });
    const r = await c.searchByTitle('AfterRetry');
    expect(r?.background_image).toBe('https://r.jpg');
    expect(calls).toBe(2);
  });

  it('activates cooldown on 429 and skips subsequent API calls within the window', async () => {
    const fetchImpl = fakeFetch(null, 429);
    const c = new RawgClient({
      fetchImpl,
      logger: noopLog,
      cooldownMs: 60_000,
    });
    expect(await c.searchByTitle('Whatever')).toBeNull();
    expect(c.cooldownUntil()).toBeGreaterThan(Date.now());

    const f = fetchImpl;
    f.mockClear();
    expect(await c.searchByTitle('Other')).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent in-flight requests for the same title', async () => {
    let calls = 0;
    const fetchImpl = /** @type {any} */ (vi.fn(async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return {
        ok: true,
        status: 200,
        json: async () => ({ results: [{ id: 5, name: 'Concurrent', background_image: 'https://concur.jpg' }] }),
      };
    }));
    const c = new RawgClient({ fetchImpl, logger: noopLog });
    const [r1, r2, r3] = await Promise.all([
      c.searchByTitle('Concurrent'),
      c.searchByTitle('Concurrent'),
      c.searchByTitle('Concurrent'),
    ]);
    expect(r1?.name).toBe('Concurrent');
    expect(r2?.id).toBe(r1?.id);
    expect(r3?.id).toBe(r1?.id);
    expect(calls).toBe(1);
    expect(c.inFlightCount()).toBe(0);
  });

  it('caller AbortSignal cancels the fetch', async () => {
    const fetchImpl = /** @type {any} */ (vi.fn(async (_url, init) => {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, 1000);
        if (init && init.signal) {
          init.signal.addEventListener('abort', () => {
            clearTimeout(t);
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
      return { ok: true, status: 200, json: async () => ({}) };
    }));
    const c = new RawgClient({ fetchImpl, logger: noopLog });
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 20);
    const r = await c.searchByTitle('ToCancel', { signal: ctrl.signal });
    expect(r).toBeNull();
  });
});
