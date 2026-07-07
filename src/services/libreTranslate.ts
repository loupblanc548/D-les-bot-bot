import axios from "axios";
import logger from "../utils/logger.js";
import { translateText as googleTranslate, detectLanguage as googleDetect } from "./googleCloudServices.js";

const LIBRETRANSLATE_URL = process.env.LIBRETRANSLATE_URL || "https://libretranslate.com";
const LIBRETRANSLATE_API_KEY = process.env.LIBRETRANSLATE_API_KEY || "";

export interface TranslationResult {
  translatedText: string; detectedSourceLanguage: string; targetLanguage: string;
  confidence: number; provider: "google" | "libre" | "none";
}

export async function translateAny(text: string, targetLang = "fr", sourceLang?: string): Promise<TranslationResult> {
  if (!text || text.length < 2) return { translatedText: text, detectedSourceLanguage: "unknown", targetLanguage: targetLang, confidence: 0, provider: "none" };

  const googleResult = await googleTranslate(text, targetLang, sourceLang).catch(() => null);
  if (googleResult && googleResult.confidence > 0) {
    return { ...googleResult, provider: "google" };
  }

  const libreResult = await libreTranslate(text, targetLang, sourceLang).catch(() => null);
  if (libreResult) return { ...libreResult, provider: "libre" };

  return { translatedText: text, detectedSourceLanguage: sourceLang ?? "unknown", targetLanguage: targetLang, confidence: 0, provider: "none" };
}

async function libreTranslate(text: string, targetLang: string, sourceLang?: string): Promise<TranslationResult | null> {
  try {
    const res = await axios.post(`${LIBRETRANSLATE_URL}/translate`, {
      q: text.slice(0, 5000), source: sourceLang || "auto", target: targetLang, format: "text",
      ...(LIBRETRANSLATE_API_KEY ? { api_key: LIBRETRANSLATE_API_KEY } : {}),
    }, { timeout: 10000, headers: { "Content-Type": "application/json" } });
    if (res.data?.translatedText) {
      return {
        translatedText: String(res.data.translatedText),
        detectedSourceLanguage: String(res.data.detectedLanguage?.language || sourceLang || "unknown"),
        targetLanguage: targetLang, confidence: 0.8, provider: "libre",
      };
    }
    return null;
  } catch (err) { logger.error(`[LibreTranslate] ${err instanceof Error ? err.message : String(err)}`); return null; }
}

export async function detectLanguageAuto(text: string): Promise<{ language: string; confidence: number; provider: string }> {
  const googleResult = await googleDetect(text).catch(() => null);
  if (googleResult && googleResult.confidence > 0) return { language: googleResult.language, confidence: googleResult.confidence, provider: "google" };
  try {
    const res = await axios.post(`${LIBRETRANSLATE_URL}/detect`, { q: text.slice(0, 1000) }, { timeout: 8000 });
    if (Array.isArray(res.data) && res.data.length > 0) {
      return { language: String(res.data[0].language || "unknown"), confidence: Number(res.data[0].confidence || 0), provider: "libre" };
    }
  } catch { /* silent */ }
  return { language: "unknown", confidence: 0, provider: "none" };
}

export async function autoTranslateIfNeeded(text: string, targetLang = "fr"): Promise<{ translated: boolean; original: string; translated_text: string; source_lang: string; provider: string }> {
  const detection = await detectLanguageAuto(text);
  if (detection.language === targetLang || detection.language === "unknown" || detection.confidence < 0.5) {
    return { translated: false, original: text, translated_text: text, source_lang: detection.language, provider: detection.provider };
  }
  const result = await translateAny(text, targetLang, detection.language);
  return { translated: result.provider !== "none", original: text, translated_text: result.translatedText, source_lang: result.detectedSourceLanguage, provider: result.provider };
}

export function isLibreTranslateConfigured(): boolean { return LIBRETRANSLATE_URL.length > 0; }

export const SUPPORTED_LANGUAGES = [
  "fr", "en", "es", "de", "it", "pt", "ru", "ja", "ko", "zh", "ar", "hi", "tr", "nl", "pl", "sv", "da", "fi", "no", "cs", "el", "he", "hu", "id", "ro", "th", "uk", "vi",
];
