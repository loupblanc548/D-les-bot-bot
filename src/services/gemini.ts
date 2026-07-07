/**
 * gemini.ts — Google Gemini API integration (multimodal + long context)
 *
 * Free tier: 15 req/min, 1500 req/day (Gemini 1.5 Flash)
 * Multimodal: text + vision (images) in same request
 * Context: up to 1M tokens
 *
 * Primary use:
 *  - Image analysis (analyze_image tool) — vision native
 *  - Long conversation summaries (1M token context)
 *  - Fallback LLM when OpenRouter + Groq are down
 */

import logger from "../utils/logger.js";
import { config } from "../config.js";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export function isGeminiAvailable(): boolean {
  return !!config.geminiApiKey;
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  error?: { message: string };
}

async function callGemini(
  contents: Array<{ role: string; parts: GeminiPart[] }>,
  systemInstruction?: string,
  maxTokens?: number,
): Promise<string | null> {
  if (!config.geminiApiKey) return null;

  try {
    const url = `${GEMINI_BASE_URL}/models/${config.geminiModel}:generateContent?key=${config.geminiApiKey}`;
    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        maxOutputTokens: maxTokens || 800,
        temperature: 0.7,
      },
    };
    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      logger.debug(`[Gemini] HTTP ${res.status}: ${errText.slice(0, 200)}`);
      return null;
    }

    const data = (await res.json()) as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return text?.trim() || null;
  } catch (error) {
    logger.debug(`[Gemini] Call failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Text-only chat with Gemini
 */
export async function chatWithGemini(
  systemPrompt: string,
  userMessage: string,
  maxTokens?: number,
): Promise<string | null> {
  return callGemini(
    [{ role: "user", parts: [{ text: userMessage }] }],
    systemPrompt,
    maxTokens,
  );
}

/**
 * Analyze an image with Gemini Vision (multimodal)
 * @param imageUrl URL of the image to analyze
 * @param question Question about the image
 * @returns Analysis text or null
 */
export async function analyzeImageWithGemini(
  imageUrl: string,
  question: string,
): Promise<string | null> {
  if (!config.geminiApiKey) return null;

  try {
    // Fetch the image and convert to base64
    const imgRes = await fetch(imageUrl, {
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!imgRes.ok) return null;

    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const base64 = buffer.toString("base64");
    const mimeType = imgRes.headers.get("content-type") || "image/jpeg";

    if (buffer.length < 100) return null;

    return callGemini(
      [
        {
          role: "user",
          parts: [
            { text: question },
            { inlineData: { mimeType, data: base64 } },
          ],
        },
      ],
      "Tu es un analyste d'images expert. Réponds en français, sois concis et précis.",
      500,
    );
  } catch (error) {
    logger.debug(`[Gemini] Image analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Summarize a long conversation (leverages Gemini's 1M token context)
 * @param conversationText Full conversation text (can be very long)
 * @param maxTokens Output token limit
 * @returns Summary text or null
 */
export async function summarizeWithGemini(
  conversationText: string,
  maxTokens = 500,
): Promise<string | null> {
  const systemPrompt =
    "Tu es un assistant qui résume des conversations Discord. " +
    "Fais un résumé concis en français avec: " +
    "1) Les sujets principaux discutés " +
    "2) Les décisions prises " +
    "3) Les points en suspens. Format: bullet points.";

  return callGemini(
    [{ role: "user", parts: [{ text: `Résume cette conversation:\n\n${conversationText}` }] }],
    systemPrompt,
    maxTokens,
  );
}
