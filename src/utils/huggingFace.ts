/**
 * huggingFace.ts — Integration Hugging Face Inference API (fallback AI gratuit).
 *
 * Utilise des modeles open-source heberges par Hugging Face.
 * Plan gratuit: 1000 requetes/jour, pas de cle requise pour les modeles publics.
 *
 * Si HF_API_TOKEN est configure, utilise le token pour des limites plus elevees.
 * Utilise comme fallback ultime si OpenRouter est down.
 */

import logger from "./logger.js";

const API_TOKEN = process.env.HF_API_TOKEN || "";
const BASE_URL = "https://api-inference.huggingface.co/models";

// Modeles gratuits pour differents cas d'usage
const MODELS = {
  chat: "mistralai/Mistral-7B-Instruct-v0.3",
  sentiment: "cardiffnlp/twitter-roberta-base-sentiment-latest",
  toxicity: "unitary/toxic-bert",
} as const;

interface HFResponse {
  generated_text?: string;
  label?: string;
  score?: number;
}

/**
 * Genere une reponse de chat via un modele open-source (Mistral-7B).
 * Retourne null si l'API echoue.
 */
export async function chatWithHF(
  message: string,
  systemPrompt: string = "Tu es un assistant Discord utile et amical.",
): Promise<string | null> {
  const model = MODELS.chat;
  const prompt = `<s>[INST] ${systemPrompt}\n\n${message} [/INST]`;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (API_TOKEN) {
      headers["Authorization"] = `Bearer ${API_TOKEN}`;
    }

    const response = await fetch(`${BASE_URL}/${model}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 200,
          temperature: 0.7,
          return_full_text: false,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      logger.warn(`[HuggingFace] HTTP ${response.status} pour ${model}`);
      return null;
    }

    const data = (await response.json()) as HFResponse[];
    if (Array.isArray(data) && data[0]?.generated_text) {
      return data[0].generated_text.trim();
    }
    return null;
  } catch (err) {
    logger.debug(`[HuggingFace] Erreur chat: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Analyse le sentiment d'un texte (positif/neutre/negatif).
 * Retourne null si l'API echoue.
 */
export async function analyzeSentiment(
  text: string,
): Promise<{ label: string; score: number } | null> {
  const model = MODELS.sentiment;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (API_TOKEN) {
      headers["Authorization"] = `Bearer ${API_TOKEN}`;
    }

    const response = await fetch(`${BASE_URL}/${model}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ inputs: text }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as HFResponse[];
    if (Array.isArray(data) && data[0]) {
      return { label: data[0].label || "unknown", score: data[0].score || 0 };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Detecte la toxicite d'un texte (score 0-1).
 * Retourne null si l'API echoue.
 */
export async function detectToxicity(text: string): Promise<number | null> {
  const model = MODELS.toxicity;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (API_TOKEN) {
      headers["Authorization"] = `Bearer ${API_TOKEN}`;
    }

    const response = await fetch(`${BASE_URL}/${model}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ inputs: text }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as HFResponse[];
    if (Array.isArray(data) && data[0]) {
      return data[0].score ?? 0;
    }
    return null;
  } catch {
    return null;
  }
}
