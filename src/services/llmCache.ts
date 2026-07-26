/**
 * llmCache.ts — Cache Redis des completions LLM (persistant, distribué)
 *
 * Clé = hash SHA256 du prompt + modèle, TTL configurable.
 * Évite les appels redondants pour des prompts identiques.
 *
 * Note: aiCache.ts (mémoire locale) gère le cache sémantique court-terme.
 * Ce module gère le cache Redis persistant pour les completions identiques.
 * Les deux sont complémentaires: aiCache = L1 (local), llmCache = L2 (Redis).
 */

import { createHash } from "node:crypto";
import { setCache, getCache } from "../utils/redis.js";
import logger from "../utils/logger.js";

const DEFAULT_TTL = 3600; // 1 heure
const CACHE_PREFIX = "llm:cache:";

function computeCacheKey(prompt: string, model: string): string {
  const hash = createHash("sha256")
    .update(`${model}:${prompt}`)
    .digest("hex")
    .slice(0, 32);
  return `${CACHE_PREFIX}${hash}`;
}

export async function getCachedCompletion<T = string>(
  prompt: string,
  model: string,
): Promise<T | null> {
  const key = computeCacheKey(prompt, model);
  try {
    return await getCache<T>(key);
  } catch {
    return null;
  }
}

export async function setCachedCompletion(
  prompt: string,
  model: string,
  completion: string,
  ttlSeconds = DEFAULT_TTL,
): Promise<void> {
  const key = computeCacheKey(prompt, model);
  try {
    await setCache(key, completion, ttlSeconds);
  } catch (err) {
    logger.debug(`[LLMCache] setCache failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Wrapper: exécute fn si pas en cache, sinon retourne le cache.
 */
export async function withLLMCache<T>(
  prompt: string,
  model: string,
  fn: () => Promise<T>,
  ttlSeconds = DEFAULT_TTL,
): Promise<T> {
  const cached = await getCachedCompletion<T>(prompt, model);
  if (cached !== null) {
    logger.debug(`[LLMCache] Hit for model=${model}`);
    return cached;
  }

  const result = await fn();
  if (typeof result === "string") {
    await setCachedCompletion(prompt, model, result, ttlSeconds);
  }
  return result;
}
