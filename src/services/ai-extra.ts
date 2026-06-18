import logger from "../utils/logger.js";
import { getOpenAIClient } from "./ai.js";
import { config } from "../config.js";

const SUPPORTED_LANGUAGES: Record<string, string> = {
  fr: "Français",
  en: "Anglais",
  es: "Espagnol",
  de: "Allemand",
  it: "Italien",
  pt: "Portugais",
  ru: "Russe",
  ja: "Japonais",
  ko: "Coréen",
  zh: "Chinois",
  ar: "Arabe",
  nl: "Néerlandais",
  pl: "Polonais",
  tr: "Turc",
  hi: "Hindi",
};

export function getSupportedLanguages(): typeof SUPPORTED_LANGUAGES {
  return SUPPORTED_LANGUAGES;
}

export function getLanguageName(code: string): string {
  return SUPPORTED_LANGUAGES[code] || code;
}

export async function translateText(
  text: string,
  targetLang: string
): Promise<{
  translation: string;
  detectedSource: string;
  targetLanguage: string;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.aiTimeoutMs);

  try {
    const client = getOpenAIClient();
    const langName = getLanguageName(targetLang);

    const completion = await client.chat.completions.create(
      {
        model: config.openRouterModel,
        messages: [
          {
            role: "system",
            content: `Tu es un traducteur professionnel. Traduis le texte fourni en ${langName}. Réponds UNIQUEMENT avec un objet JSON au format : {"translation": "texte traduit", "detectedSource": "code langue source (ex: fr, en, es)"}. Ne mets pas le JSON dans un bloc de code.`,
          },
          { role: "user", content: text },
        ],
        max_tokens: 4096,
        temperature: 0.3,
      },
      { signal: controller.signal }
    );

    const raw = completion.choices[0]?.message?.content?.trim() || "";

    let parsed: { translation?: string; detectedSource?: string };
    try {
      const cleaned = raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
      parsed = JSON.parse(cleaned);
    } catch {
      return {
        translation: raw,
        detectedSource: "inconnue",
        targetLanguage: langName,
      };
    }

    return {
      translation: parsed.translation || raw,
      detectedSource: parsed.detectedSource || "inconnue",
      targetLanguage: langName,
    };
  } catch (error) {
    logger.error("[AI-Translate] Erreur:", String(error));
    if ((error as Error).name === "AbortError") {
      throw new Error("La traduction a pris trop de temps. Réessayez.", { cause: error });
    }
    throw new Error("Erreur lors de la traduction.", { cause: error });
  } finally {
    clearTimeout(timeout);
  }
}

export async function summarizeMessages(
  messages: { author: string; content: string }[]
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.aiSummarizeTimeoutMs);

  try {
    const client = getOpenAIClient();
    const conversation = messages
      .map((m) => `[${m.author}]: ${m.content}`)
      .join("\n");

    const completion = await client.chat.completions.create(
      {
        model: config.openRouterModel,
        messages: [
          {
            role: "system",
            content:
              "Tu es un assistant qui résume les conversations Discord de façon concise et structurée. " +
              "Fais un résumé en français (5-10 lignes max) avec : les sujets principaux abordés, " +
              "les décisions prises, et les points importants. Utilise des emojis et des tirets.",
          },
          {
            role: "user",
            content: `Résume cette conversation :\n\n${conversation}`,
          },
        ],
        max_tokens: 800,
        temperature: 0.5,
      },
      { signal: controller.signal }
    );

    return (
      completion.choices[0]?.message?.content ||
      "Impossible de générer un résumé."
    );
  } catch (error) {
    logger.error("[AI-Summarize] Erreur:", String(error));
    if ((error as Error).name === "AbortError") {
      throw new Error("Le résumé a pris trop de temps. Réessayez avec moins de messages.", { cause: error });
    }
    throw new Error("Erreur lors du résumé.", { cause: error });
  } finally {
    clearTimeout(timeout);
  }
}
