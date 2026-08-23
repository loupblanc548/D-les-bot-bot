/**
 * knowledgeSources.ts — Sources de connaissances gratuites (sans clé API)
 *
 * Fichier barrel — les fonctions sont maintenant splitées en modules:
 *  - knowledgeSources/geo.ts   — Séismes, IP Geo, Sunrise/Sunset, Air Quality, Holidays
 *  - knowledgeSources/tools.ts — QR Code, Calculator, Encode/Decode, Hash, UUID, Cron, Regex, Color, Placeholder, Lorem Ipsum
 *  - knowledgeSources/info.ts  — Dictionary, Scientific Articles, Fact Check, Trivia, Joke, Advice, TMDB, NASA APOD, This Day in History, Random User
 *  - knowledgeSources/web.ts   — Currency, Wayback, SSL Check, Open Graph, Unit Converter, Timezone, AbuseIPDB, VPN Detect, Robots.txt, Sitemap
 *
 * L'orchestrateur gatherFreeKnowledge() reste ici avec cache Redis + rate limiting.
 */

import logger from "../utils/logger.js";
import redisCache from "./redisCache.js";

// ─── Imports from sub-modules ────────────────────────────────────────────────
import {
  fetchEarthquakes,
  fetchIpGeo,
  fetchSunriseSunset,
  fetchAirQuality,
  fetchHolidays,
  fetchOpenSkyFlights,
} from "./knowledgeSources/geo.js";

import {
  fetchQrCode,
  fetchCalculator,
  fetchEncodeDecode,
  fetchHash,
  fetchUuid,
  fetchCronExplain,
  fetchRegexTester,
  fetchColorPalette,
  fetchPlaceholderImage,
  fetchLoremIpsum,
} from "./knowledgeSources/tools.js";

import {
  fetchDictionary,
  fetchScientificArticles,
  fetchFactCheck,
  fetchTrivia,
  fetchJoke,
  fetchAdvice,
  fetchTmdb,
  fetchNasaApod,
  fetchThisDayInHistory,
  fetchRandomUser,
} from "./knowledgeSources/info.js";

import {
  fetchCurrencyConversion,
  fetchWayback,
  fetchSslCheck,
  fetchOpenGraph,
  fetchUnitConverter,
  fetchTimezoneConverter,
  fetchAbuseIpDb,
  fetchVpnDetect,
  fetchRobotsTxt,
  fetchSitemap,
} from "./knowledgeSources/web.js";

// ─── ORCHESTRATEUR ──────────────────────────────────────────────────────────

// Rate limiting: max 1 call per source per 30s per user message hash
const RATE_LIMIT_WINDOW_MS = 30_000;
const rateLimitMap = new Map<string, number>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const last = rateLimitMap.get(key);
  if (last && now - last < RATE_LIMIT_WINDOW_MS) return false;
  rateLimitMap.set(key, now);
  // Cleanup old entries periodically
  if (rateLimitMap.size > 100) {
    for (const [k, v] of rateLimitMap) {
      if (now - v > RATE_LIMIT_WINDOW_MS) rateLimitMap.delete(k);
    }
  }
  return true;
}

export async function gatherFreeKnowledge(userMessage: string): Promise<string | null> {
  // Check Redis cache first
  const cacheKey = `knowledge:${Buffer.from(userMessage.slice(0, 200)).toString("base64")}`;
  try {
    const cached = await redisCache.get<string>(cacheKey);
    if (cached) {
      logger.info("[KnowledgeSources] Cache hit — returning cached result");
      return cached;
    }
  } catch { logger.error("[Silent catch]"); }

  // Rate limit: prevent spamming external APIs
  const rlKey = `rl:${userMessage.slice(0, 100)}`;
  if (!checkRateLimit(rlKey)) {
    logger.debug("[KnowledgeSources] Rate limited — skipping external fetch");
    return null;
  }

  const sources = [
    fetchEarthquakes,
    fetchCurrencyConversion,
    fetchDictionary,
    fetchScientificArticles,
    fetchFactCheck,
    fetchQrCode,
    fetchCalculator,
    fetchEncodeDecode,
    fetchHash,
    fetchUuid,
    fetchIpGeo,
    fetchWayback,
    fetchTrivia,
    fetchJoke,
    fetchAdvice,
    fetchTmdb,
    fetchNasaApod,
    fetchSslCheck,
    fetchOpenGraph,
    fetchUnitConverter,
    fetchTimezoneConverter,
    fetchAbuseIpDb,
    fetchVpnDetect,
    fetchThisDayInHistory,
    fetchHolidays,
    fetchSunriseSunset,
    fetchAirQuality,
    fetchPlaceholderImage,
    fetchLoremIpsum,
    fetchRandomUser,
    fetchCronExplain,
    fetchRegexTester,
    fetchColorPalette,
    fetchRobotsTxt,
    fetchSitemap,
    fetchOpenSkyFlights,
  ];

  for (const source of sources) {
    try {
      const result = await source(userMessage);
      if (result) {
        logger.info(`[KnowledgeSources] Source ${source.name} a répondu`);
        // Cache result for 5 minutes
        try {
          await redisCache.set(cacheKey, result, 300);
        } catch { logger.error("[Silent catch]"); }
        return result;
      }
    } catch (err) {
      logger.debug(`[KnowledgeSources] ${source.name} erreur: ${err}`);
    }
  }

  return null;
}
