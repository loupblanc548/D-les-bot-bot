/**
 * groq.ts — Groq API integration (ultra-fast LLM inference)
 *
 * Free tier: 30 req/min, 14,400 req/day
 * Uses LPU (Language Processing Unit) for ~500 tokens/s
 * SDK: OpenAI-compatible (baseURL swap)
 *
 * Primary use: low-latency tasks (personality engine, moderation, relevance check)
 * Fallback chain: OpenRouter → Groq → Gemini → HuggingFace
 */

import OpenAI from "openai";
import logger from "../utils/logger.js";
import { config } from "../config.js";

let groqClient: OpenAI | null = null;

export function getGroqClient(): OpenAI | null {
  if (!config.groqApiKey) return null;
  if (!groqClient) {
    groqClient = new OpenAI({
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: config.groqApiKey,
      timeout: 10_000,
      maxRetries: 1,
    });
  }
  return groqClient;
}

export function isGroqAvailable(): boolean {
  return !!config.groqApiKey;
}

interface ChatOptions {
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

export async function chatWithGroq(opts: ChatOptions): Promise<string | null> {
  const client = getGroqClient();
  if (!client) return null;

  try {
    const completion = await client.chat.completions.create(
      {
        model: opts.model || config.groqModel,
        messages: [
          { role: "system", content: opts.systemPrompt },
          { role: "user", content: opts.userMessage },
        ],
        max_tokens: opts.maxTokens || 500,
        temperature: opts.temperature ?? 0.7,
      },
      { timeout: 8_000 },
    );
    return completion.choices[0]?.message?.content?.trim() || null;
  } catch (error) {
    logger.debug(`[Groq] Chat failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Fast JSON-mode completion (for relevance checks, moderation decisions, etc.)
 */
export async function chatWithGroqJSON(opts: ChatOptions): Promise<Record<string, unknown> | null> {
  const client = getGroqClient();
  if (!client) return null;

  try {
    const completion = await client.chat.completions.create(
      {
        model: opts.model || config.groqModel,
        messages: [
          { role: "system", content: opts.systemPrompt },
          { role: "user", content: opts.userMessage },
        ],
        max_tokens: opts.maxTokens || 200,
        temperature: opts.temperature ?? 0.3,
        response_format: { type: "json_object" },
      },
      { timeout: 8_000 },
    );
    const raw = completion.choices[0]?.message?.content ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  } catch (error) {
    logger.debug(`[Groq] JSON chat failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
