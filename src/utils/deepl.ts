/**
 * deepl.ts — Integration DeepL API pour la traduction.
 *
 * Plan gratuit: 500 000 caracteres/mois.
 * Meilleure qualite que Google Translate, surtout pour le francais.
 *
 * Config: DEEPL_API_KEY dans .env
 * Si non configure, no-op (retourne le texte original).
 */

import logger from "./logger.js";

const API_KEY = process.env.DEEPL_API_KEY || "";
const BASE_URL = "https://api-free.deepl.com/v2/translate";

type DeepLLang = "FR" | "EN" | "DE" | "ES" | "IT" | "PT" | "NL" | "PL" | "RU" | "JA" | "KO" | "ZH";

interface DeepLResponse {
  translations: { text: string; detected_source_language: string }[];
}

/**
 * Traduit un texte via DeepL.
 * Retourne le texte original si l'API n'est pas configuree ou echoue.
 */
export async function translate(
  text: string,
  targetLang: DeepLLang = "FR",
  sourceLang?: DeepLLang,
): Promise<string> {
  if (!API_KEY) return text;
  if (!text || text.length === 0) return text;

  try {
    const params = new URLSearchParams({
      text: text.slice(0, 5000), // DeepL limite a ~128KB par requete
      target_lang: targetLang,
    });
    if (sourceLang) params.set("source_lang", sourceLang);

    const res = await fetch(BASE_URL, {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${API_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      logger.warn(`[DeepL] HTTP ${res.status}`);
      return text;
    }

    const data = (await res.json()) as DeepLResponse;
    if (data.translations && data.translations.length > 0) {
      return data.translations[0].text;
    }
    return text;
  } catch (err) {
    logger.debug(`[DeepL] Erreur: ${err instanceof Error ? err.message : String(err)}`);
    return text;
  }
}

/**
 * Detecte la langue d'un texte via DeepL.
 * Retourne null si l'API n'est pas configuree ou echoue.
 */
export async function detectLanguage(text: string): Promise<string | null> {
  if (!API_KEY || !text) return null;

  try {
    const res = await fetch(BASE_URL, {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${API_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ text: text.slice(0, 500), target_lang: "EN" }).toString(),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as DeepLResponse;
    return data.translations?.[0]?.detected_source_language || null;
  } catch {
    return null;
  }
}
