/**
 * cerebras.ts — Cerebras API integration (ultra-fast LLM inference)
 *
 * Free tier: https://inference.cerebras.ai
 * Uses CS-3 wafer-scale chips for ~1000 tokens/s
 * SDK: OpenAI-compatible (baseURL swap)
 *
 * Models:
 *  - llama3.1-8b      (8B, ultra fast, ~1000 tok/s)
 *  - llama3.1-70b     (70B, fast, ~400 tok/s)
 *  - llama-3.3-70b    (70B, latest, ~400 tok/s)
 */

import OpenAI from "openai";
import logger from "../utils/logger.js";

const CEREBRAS_BASE_URL = "https://api.cerebras.ai/v1";

let client: OpenAI | null = null;

export function isCerebrasAvailable(): boolean {
  return !!process.env.CEREBRAS_API_KEY;
}

export function getCerebrasClient(): OpenAI | null {
  if (!isCerebrasAvailable()) return null;
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.CEREBRAS_API_KEY!,
      baseURL: CEREBRAS_BASE_URL,
      maxRetries: 0,
      timeout: 15_000,
    });
    logger.info("[Cerebras] Client initialisé — inference ultra-rapide disponible");
  }
  return client;
}

export const CEREBRAS_MODELS = ["llama3.1-8b", "llama3.1-70b", "llama-3.3-70b"];

export function isCerebrasModel(modelName: string): boolean {
  return CEREBRAS_MODELS.includes(modelName);
}

export function getCerebrasModel(): string {
  return process.env.CEREBRAS_MODEL || "llama3.1-70b";
}

interface ChatOptions {
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

export async function chatWithCerebras(opts: ChatOptions): Promise<string | null> {
  const c = getCerebrasClient();
  if (!c) return null;

  try {
    const completion = await c.chat.completions.create(
      {
        model: opts.model || getCerebrasModel(),
        messages: [
          { role: "system", content: opts.systemPrompt },
          { role: "user", content: opts.userMessage },
        ],
        max_tokens: opts.maxTokens || 500,
        temperature: opts.temperature ?? 0.7,
      },
      { timeout: 10_000 },
    );
    return completion.choices[0]?.message?.content?.trim() || null;
  } catch (error) {
    logger.debug(
      `[Cerebras] Chat failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}
