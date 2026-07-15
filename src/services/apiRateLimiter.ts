/**
 * apiRateLimiter.ts — Rate limiting centralisé pour les APIs externes
 *
 * Utilise Bottleneck pour éviter les 429 Too Many Requests.
 * Chaque API a son propre limiter avec des limites adaptées.
 */

import Bottleneck from "bottleneck";
import logger from "../utils/logger.js";

// ─── Limiters par API ────────────────────────────────────────────────────────

const defaultLimiter = new Bottleneck({
  maxConcurrent: 5,
  minTime: 200,
});

const epicGamesLimiter = new Bottleneck({
  maxConcurrent: 2,
  minTime: 1000,
});

const steamLimiter = new Bottleneck({
  maxConcurrent: 3,
  minTime: 333,
});

const twitchLimiter = new Bottleneck({
  maxConcurrent: 2,
  minTime: 500,
});

const redditLimiter = new Bottleneck({
  maxConcurrent: 3,
  minTime: 2000,
});

const githubLimiter = new Bottleneck({
  maxConcurrent: 5,
  minTime: 500,
});

const jikanLimiter = new Bottleneck({
  maxConcurrent: 2,
  minTime: 600,
});

const openMeteoLimiter = new Bottleneck({
  maxConcurrent: 10,
  minTime: 100,
});

// ─── Mapping ──────────────────────────────────────────────────────────────────

const limiters = new Map<string, Bottleneck>([
  ["default", defaultLimiter],
  ["epicgames", epicGamesLimiter],
  ["steam", steamLimiter],
  ["twitch", twitchLimiter],
  ["reddit", redditLimiter],
  ["github", githubLimiter],
  ["jikan", jikanLimiter],
  ["openmeteo", openMeteoLimiter],
]);

// ─── API publique ─────────────────────────────────────────────────────────────

export function getLimiter(api: string): Bottleneck {
  return limiters.get(api) ?? defaultLimiter;
}

export async function rateLimited<T>(api: string, fn: () => Promise<T>): Promise<T> {
  const limiter = getLimiter(api);
  return limiter.schedule(fn);
}

export async function rateLimitedFetch(
  api: string,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  return rateLimited(api, () => fetch(url, init));
}

for (const [name, limiter] of limiters) {
  limiter.on("error", (err: Error) => {
    logger.warn(`[ApiRateLimiter:${name}] Error: ${err.message}`);
  });
  limiter.on("dropped", () => {
    logger.warn(`[ApiRateLimiter:${name}] Request dropped (queue full)`);
  });
}

logger.info("[ApiRateLimiter] Initialized — 8 API limiters configured");
