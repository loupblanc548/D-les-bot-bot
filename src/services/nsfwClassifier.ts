/**
 * nsfwClassifier.ts — Classification NSFW dédiée pour images
 *
 * Utilise Sightengine API (modèle nudity-2.0) en complément du
 * modèle de vision généraliste (Gemini) déjà en place.
 *
 * Avantages par rapport au modèle généraliste:
 * - Spécialisé pour la détection de contenu explicite
 * - Scores précis par catégorie (raw, partial, suggestive)
 * - Gratuit jusqu'à 2000 req/mois
 *
 * Garde-fous:
 * - Rate-limit: 1 req / 2s (évite saturation quota)
 * - Cache LRU pour éviter de re-analyser la même image
 * - Fallback: si Sightengine non configuré, utilise Gemini Vision
 */

import logger from "../utils/logger.js";

interface NsfwResult {
  isNsfw: boolean;
  confidence: number;
  categories: {
    raw: number;
    partial: number;
    suggestive: number;
  };
  source: "sightengine" | "gemini-fallback" | "disabled";
  action: "block" | "warn" | "allow";
}

const SIGHTENGINE_API_URL = "https://api.sightengine.com/1.0/check.json";
const CACHE_MAX = 100;
const RATE_LIMIT_MS = 2000;

const cache = new Map<string, NsfwResult>();
let lastRequestAt = 0;

function getCached(url: string): NsfwResult | null {
  const result = cache.get(url);
  if (result) {
    cache.delete(url);
    cache.set(url, result);
    return result;
  }
  return null;
}

function setCache(url: string, result: NsfwResult): void {
  if (cache.size >= CACHE_MAX) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(url, result);
}

export async function classifyNsfw(
  imageUrl: string,
  options?: { threshold?: number; strict?: boolean },
): Promise<NsfwResult> {
  const threshold = options?.threshold ?? 0.5;
  const strict = options?.strict ?? false;

  const cached = getCached(imageUrl);
  if (cached) return cached;

  const apiKey = process.env.SIGHTENGINE_API_KEY;
  const apiUser = process.env.SIGHTENGINE_API_USER;

  if (!apiKey || !apiUser) {
    return classifyViaGemini(imageUrl, threshold);
  }

  // Rate-limit
  const now = Date.now();
  const wait = RATE_LIMIT_MS - (now - lastRequestAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();

  try {
    const params = new URLSearchParams({
      url: imageUrl,
      models: "nudity-2.0",
      api_user: apiUser,
      api_secret: apiKey,
    });

    const res = await fetch(`${SIGHTENGINE_API_URL}?${params.toString()}`, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      logger.warn(`[NSFW] Sightengine API error: ${res.status}`);
      return classifyViaGemini(imageUrl, threshold);
    }

    const data = (await res.json()) as {
      nudity?: {
        raw?: number;
        partial?: number;
        suggestive?: number;
      };
    };

    const raw = data.nudity?.raw ?? 0;
    const partial = data.nudity?.partial ?? 0;
    const suggestive = data.nudity?.suggestive ?? 0;

    const maxScore = Math.max(raw, partial, suggestive);
    const isNsfw = maxScore >= threshold;

    let action: NsfwResult["action"] = "allow";
    if (raw >= threshold || (strict && suggestive >= threshold)) {
      action = "block";
    } else if (partial >= threshold || suggestive >= threshold) {
      action = "warn";
    }

    const result: NsfwResult = {
      isNsfw,
      confidence: maxScore,
      categories: { raw, partial, suggestive },
      source: "sightengine",
      action,
    };

    setCache(imageUrl, result);
    logger.info(
      `[NSFW] ${imageUrl.slice(0, 60)}... → raw=${raw} partial=${partial} suggestive=${suggestive} action=${action}`,
    );
    return result;
  } catch (err) {
    logger.warn(`[NSFW] Sightengine failed: ${err instanceof Error ? err.message : String(err)}`);
    return classifyViaGemini(imageUrl, threshold);
  }
}

async function classifyViaGemini(imageUrl: string, threshold: number): Promise<NsfwResult> {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!geminiKey) {
    return {
      isNsfw: false,
      confidence: 0,
      categories: { raw: 0, partial: 0, suggestive: 0 },
      source: "disabled",
      action: "allow",
    };
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: 'Analyze this image for NSFW content. Respond ONLY with a JSON object: {"raw": 0.0-1.0, "partial": 0.0-1.0, "suggestive": 0.0-1.0}. raw = explicit nudity, partial = partial nudity, suggestive = suggestive but not explicit. 0.0 = none, 1.0 = maximum.',
                },
                { file_data: { mime_type: "image/jpeg", file_uri: imageUrl } },
              ],
            },
          ],
          generationConfig: { temperature: 0.1, maxOutputTokens: 100 },
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!res.ok) {
      return {
        isNsfw: false,
        confidence: 0,
        categories: { raw: 0, partial: 0, suggestive: 0 },
        source: "disabled",
        action: "allow",
      };
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const match = text.match(/\{[^}]+\}/);
    if (!match) {
      return {
        isNsfw: false,
        confidence: 0,
        categories: { raw: 0, partial: 0, suggestive: 0 },
        source: "disabled",
        action: "allow",
      };
    }

    const parsed = JSON.parse(match[0]) as { raw?: number; partial?: number; suggestive?: number };
    const raw = Math.min(1, Math.max(0, parsed.raw ?? 0));
    const partial = Math.min(1, Math.max(0, parsed.partial ?? 0));
    const suggestive = Math.min(1, Math.max(0, parsed.suggestive ?? 0));

    const maxScore = Math.max(raw, partial, suggestive);
    const isNsfw = maxScore >= threshold;

    let action: NsfwResult["action"] = "allow";
    if (raw >= threshold) action = "block";
    else if (partial >= threshold || suggestive >= threshold) action = "warn";

    const result: NsfwResult = {
      isNsfw,
      confidence: maxScore,
      categories: { raw, partial, suggestive },
      source: "gemini-fallback",
      action,
    };

    setCache(imageUrl, result);
    return result;
  } catch {
    return {
      isNsfw: false,
      confidence: 0,
      categories: { raw: 0, partial: 0, suggestive: 0 },
      source: "disabled",
      action: "allow",
    };
  }
}

export function clearNsfwCache(): void {
  cache.clear();
}
