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

let geminiBlocked = false;
let geminiBlockedAt = 0;
const GEMINI_BLOCK_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

export function isGeminiAvailable(): boolean {
  // Gemini permanently disabled — API key blocked (403 PERMISSION_DENIED)
  // Groq 70B replaces Gemini as free fallback
  return false;
}

export function markGeminiBlocked(): void {
  geminiBlocked = true;
  geminiBlockedAt = Date.now();
  logger.warn("[Gemini] API bloquée (403) — Gemini désactivé pendant 5 minutes");
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
      if (res.status === 403) {
        markGeminiBlocked();
      }
      logger.error(`[Gemini] HTTP ${res.status}: ${errText.slice(0, 300)}`);
      return null;
    }

    const data = (await res.json()) as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      logger.error(`[Gemini] No text in response: ${JSON.stringify(data).slice(0, 300)}`);
    }
    return text?.trim() || null;
  } catch (error) {
    logger.error(`[Gemini] Call failed: ${error instanceof Error ? error.message : String(error)}`);
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
    logger.error(`[Gemini] Image analysis failed: ${error instanceof Error ? error.message : String(error)}`);
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
