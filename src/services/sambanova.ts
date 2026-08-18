/**
 * sambanova.ts — SambaNova API integration (fast LLM inference)
 *
 * Free tier: https://cloud.samba.ai
 * Uses RDU (Reconfigurable Dataflow Unit) for ~200 tokens/s
 * SDK: OpenAI-compatible (baseURL swap)
 *
 * Models:
 *  - Meta-Llama-3.1-70B-Instruct     (70B, tools ✅)
 *  - Meta-Llama-3.1-405B-Instruct     (405B — largest open-source model, tools ✅)
 *  - Meta-Llama-3.2-1B-Instruct       (1B, ultra light)
 *  - Meta-Llama-3.2-3B-Instruct       (3B, light)
 */

import OpenAI from "openai";
import logger from "../utils/logger.js";

const SAMBANOVA_BASE_URL = "https://api.sambanova.ai/v1";

let client: OpenAI | null = null;

export function isSambaNovaAvailable(): boolean {
  return !!process.env.SAMBANOVA_API_KEY;
}

export function getSambaNovaClient(): OpenAI | null {
  if (!isSambaNovaAvailable()) return null;
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.SAMBANOVA_API_KEY!,
      baseURL: SAMBANOVA_BASE_URL,
      maxRetries: 0,
      timeout: 20_000,
    });
    logger.info("[SambaNova] Client initialisé — modèles Llama 405B disponibles");
  }
  return client;
}

export const SAMBANOVA_MODELS = [
  "Meta-Llama-3.1-70B-Instruct",
  "Meta-Llama-3.1-405B-Instruct",
  "Meta-Llama-3.2-3B-Instruct",
  "Meta-Llama-3.2-1B-Instruct",
];

export function isSambaNovaModel(modelName: string): boolean {
  return SAMBANOVA_MODELS.includes(modelName);
}

export function getSambaNovaModel(): string {
  return process.env.SAMBANOVA_MODEL || "Meta-Llama-3.1-70B-Instruct";
}

interface ChatOptions {
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

export async function chatWithSambaNova(opts: ChatOptions): Promise<string | null> {
  const c = getSambaNovaClient();
  if (!c) return null;

  try {
    const completion = await c.chat.completions.create(
      {
        model: opts.model || getSambaNovaModel(),
        messages: [
          { role: "system", content: opts.systemPrompt },
          { role: "user", content: opts.userMessage },
        ],
        max_tokens: opts.maxTokens || 800,
        temperature: opts.temperature ?? 0.7,
      },
      { timeout: 15_000 },
    );
    return completion.choices[0]?.message?.content?.trim() || null;
  } catch (error) {
    logger.debug(
      `[SambaNova] Chat failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}
