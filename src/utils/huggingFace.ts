/**
 * huggingFace.ts — Integration Hugging Face (fallback AI gratuit).
 *
 * Utilise le HF Router (OpenAI-compatible) pour le chat LLM.
 * Utilise l'Inference API pour les modeles specialises (sentiment, toxicite).
 *
 * Plan gratuit: 1000 requetes/jour avec token.
 * Utilise comme fallback ultime si OpenRouter + Groq + Gemini sont down.
 */

import OpenAI from "openai";
import logger from "./logger.js";
import { config } from "../config.js";

const HF_ROUTER_URL = "https://router.huggingface.co/v1";
const HF_INFERENCE_URL = "https://api-inference.huggingface.co/models";

const CHAT_MODEL = "moonshotai/Kimi-K2-Instruct-0905";

const INFERENCE_MODELS = {
  sentiment: "cardiffnlp/twitter-roberta-base-sentiment-latest",
  toxicity: "unitary/toxic-bert",
} as const;

function getRouterClient(): OpenAI | null {
  if (!config.hfApiKey) return null;
  return new OpenAI({
    baseURL: HF_ROUTER_URL,
    apiKey: config.hfApiKey,
    timeout: 15_000,
    maxRetries: 1,
  });
}

interface HFInferenceResponse {
  generated_text?: string;
  label?: string;
  score?: number;
}

/**
 * Genere une reponse de chat via le HF Router (OpenAI-compatible).
 * Retourne null si l'API echoue.
 */
export async function chatWithHF(
  message: string,
  systemPrompt: string = "Tu es un assistant Discord utile et amical.",
): Promise<string | null> {
  const client = getRouterClient();
  if (!client) {
    logger.debug("[HuggingFace] Pas de cle HF_API_KEY configuree");
    return null;
  }

  try {
    const completion = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    const text = completion.choices[0]?.message?.content;
    return text?.trim() || null;
  } catch (err) {
    logger.warn(`[HuggingFace] Chat error: ${err instanceof Error ? err.message : String(err)}`);
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
  if (!config.hfApiKey) return null;

  try {
    const response = await fetch(`${HF_INFERENCE_URL}/${INFERENCE_MODELS.sentiment}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.hfApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: text }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as HFInferenceResponse[];
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
  if (!config.hfApiKey) return null;

  try {
    const response = await fetch(`${HF_INFERENCE_URL}/${INFERENCE_MODELS.toxicity}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.hfApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: text }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as HFInferenceResponse[];
    if (Array.isArray(data) && data[0]) {
      return data[0].score ?? 0;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Genere une image a partir d'un prompt texte via FLUX.1-dev.
 * Retourne un Buffer PNG ou null si l'API echoue.
 *
 * @param prompt Description de l'image a generer
 * @returns Buffer PNG ou null
 */
export async function textToImage(prompt: string): Promise<Buffer | null> {
  if (!config.hfApiKey) return null;

  try {
    const response = await fetch(
      `${HF_INFERENCE_URL}/black-forest-labs/FLUX.1-dev`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.hfApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs: prompt }),
        signal: AbortSignal.timeout(30_000),
      },
    );

    if (!response.ok) {
      logger.warn(`[HuggingFace] textToImage HTTP ${response.status}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    logger.warn(`[HuggingFace] textToImage error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
