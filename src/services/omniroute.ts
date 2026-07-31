/**
 * omniroute.ts — OmniRoute AI Gateway integration
 *
 * OmniRoute is a free AI gateway that aggregates 290+ providers (90+ free)
 * behind a single OpenAI-compatible endpoint with automatic failover.
 *
 * Base URL: http://localhost:20128/v1 (configurable via OMNIROUTE_URL)
 * Auth: Bearer token (OMNIROUTE_API_KEY)
 *
 * Free models available: Kimi K2, Qwen3-Max, DeepSeek V3.2, GLM-4.7, etc.
 * All support function calling via OpenAI-compatible /v1/chat/completions
 */

import OpenAI from "openai";
import logger from "../utils/logger.js";
import { config } from "../config.js";

let omnirouteClient: OpenAI | null = null;

export function getOmnirouteClient(): OpenAI | null {
  if (!config.omnirouteApiKey) return null;
  if (!omnirouteClient) {
    omnirouteClient = new OpenAI({
      baseURL: config.omnirouteUrl,
      apiKey: config.omnirouteApiKey,
      timeout: 15_000,
      maxRetries: 1,
    });
  }
  return omnirouteClient;
}

export function isOmnirouteAvailable(): boolean {
  return !!config.omnirouteApiKey;
}

/**
 * Free OmniRoute models with function calling support.
 * Prefixes: if/ (Qoder), kr/ (Kiro), qwen/ (Qwen), z-ai/ (GLM), etc.
 */
export const OMNIROUTE_FREE_MODELS = [
  "if/kimi-k2",              // Kimi K2, free, tools ✅
  "if/qwen3-max",            // Qwen3 Max, free, tools ✅
  "if/qwen3-235b",           // Qwen3 235B, free, tools ✅
  "if/deepseek-v3.2",        // DeepSeek V3.2, free, tools ✅
  "if/deepseek-r1",          // DeepSeek R1, free, tools ✅
  "kr/claude-sonnet-4.5",    // Claude Sonnet 4.5 via Kiro, free, tools ✅
  "kr/claude-haiku-4",       // Claude Haiku 4 via Kiro, free, tools ✅
  "kr/deepseek-3.2",         // DeepSeek 3.2 via Kiro, free, tools ✅
  "kr/glm-5",                // GLM-5 via Kiro, free, tools ✅
  "kr/qwen3-coder-next",     // Qwen3 Coder via Kiro, free, tools ✅
  "z-ai/glm-4.7",            // GLM-4.7, free forever, tools ✅
  "z-ai/glm-4.5-flash",      // GLM-4.5 Flash, free forever, tools ✅
];

/**
 * Check if a model name is an OmniRoute model (has a / prefix like if/, kr/, z-ai/)
 */
export function isOmnirouteModel(modelName: string): boolean {
  if (!isOmnirouteAvailable()) return false;
  return OMNIROUTE_FREE_MODELS.some((m) => modelName === m) ||
    modelName.startsWith("if/") ||
    modelName.startsWith("kr/") ||
    modelName.startsWith("z-ai/") ||
    modelName.startsWith("qwen/qwen3");
}

interface ChatOptions {
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

export async function chatWithOmniroute(opts: ChatOptions): Promise<string | null> {
  const client = getOmnirouteClient();
  if (!client) return null;

  try {
    const completion = await client.chat.completions.create({
      model: opts.model || "if/kimi-k2",
      messages: [
        { role: "system", content: opts.systemPrompt },
        { role: "user", content: opts.userMessage },
      ],
      max_tokens: opts.maxTokens || 800,
      temperature: opts.temperature ?? 0.7,
    });
    return completion.choices[0]?.message?.content?.trim() || null;
  } catch (error) {
    logger.debug(`[OmniRoute] Chat failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
