import logger from "../utils/logger.js";

/**
 * Service de traduction basé sur l'API publique LibreTranslate.
 * - `translateText` : POST /translate avec détection automatique de la langue source.
 * - `detectLanguage` : GET /detect pour identifier la langue d'un texte.
 * - Cache mémoire (`Map`) pour éviter de retraduire la même chaîne.
 * - Timeout strict de 5 secondes via `AbortSignal.timeout(5000)`.
 * - En cas d'échec (réseau, timeout, 4xx/5xx), `translateText` renvoie le texte
 *   d'origine pour ne jamais casser les flows en aval.
 */

const LIBRETRANSLATE_BASE_URL = "https://libretranslate.com";
const REQUEST_TIMEOUT_MS = 5_000;

// ─── Cache en mémoire ─────────────────────────────────────────────
// Clé = `${targetLang}::${text}` — permet de réutiliser une même
// traduction peu importe la langue cible visée.
const translationCache = new Map<string, string>();

// Cap simple du cache : on évite une croissance mémoire infinie sur
// un bot longue durée (FIFO via insertion order de `Map`).
const MAX_CACHE_ENTRIES = 1_000;

function buildCacheKey(text: string, targetLang: string): string {
  return `${targetLang}::${text}`;
}

function rememberInCache(key: string, value: string): void {
  if (translationCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = translationCache.keys().next().value;
    if (oldestKey !== undefined) {
      translationCache.delete(oldestKey);
    }
  }
  translationCache.set(key, value);
}

// ─── Types de réponse LibreTranslate ───────────────────────────────
interface LibreTranslateResponse {
  translatedText?: string;
  detectedLanguage?: { language?: string; confidence?: number };
  [key: string]: unknown;
}

interface LibreTranslateDetectItem {
  confidence?: number;
  language?: string;
}

/**
 * Traduit un texte vers la langue cible via LibreTranslate.
 * Renvoie le texte d'origine si la requête échoue (timeout, erreur réseau, HTTP non-OK).
 * Les traductions sont mises en cache par couple (texte, langue cible).
 *
 * @param text       Texte source à traduire.
 * @param targetLang Code langue cible (ex: "en", "fr", "es").
 */
export async function translateText(text: string, targetLang: string): Promise<string> {
  if (!text || text.trim().length === 0) {
    return text;
  }
  if (!targetLang) {
    return text;
  }

  const cacheKey = buildCacheKey(text, targetLang);
  const cached = translationCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const response = await fetch(`${LIBRETRANSLATE_BASE_URL}/translate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        q: text,
        source: "auto",
        target: targetLang,
        format: "text",
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      logger.warn(
        `[translateService] HTTP ${response.status} sur /translate — fallback texte original`,
      );
      return text;
    }

    const payload = (await response.json()) as LibreTranslateResponse;
    const translated = typeof payload.translatedText === "string" ? payload.translatedText : text;

    rememberInCache(cacheKey, translated);
    return translated;
  } catch (error) {
    logger.warn(
      `[translateService] Échec traduction (${targetLang}): ${
        error instanceof Error ? error.message : String(error)
      } — fallback texte original`,
    );
    return text;
  }
}

/**
 * Détecte la langue dominante d'un texte via l'endpoint GET /detect de LibreTranslate.
 * Renvoie une chaîne vide en cas d'échec pour permettre une vérification simple côté appelant.
 *
 * @param text Texte dont on veut identifier la langue.
 */
export async function detectLanguage(text: string): Promise<string> {
  if (!text || text.trim().length === 0) {
    return "";
  }

  try {
    const url = new URL(`${LIBRETRANSLATE_BASE_URL}/detect`);
    url.searchParams.set("q", text);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      logger.warn(`[translateService] HTTP ${response.status} sur /detect`);
      return "";
    }

    const payload = (await response.json()) as unknown;
    const candidates: LibreTranslateDetectItem[] = Array.isArray(payload)
      ? (payload as LibreTranslateDetectItem[])
      : payload && typeof payload === "object"
        ? [payload as LibreTranslateDetectItem]
        : [];
    const top = candidates.find((item) => typeof item?.language === "string");
    return top?.language ?? "";
  } catch (error) {
    logger.warn(
      `[translateService] Échec détection: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return "";
  }
}
