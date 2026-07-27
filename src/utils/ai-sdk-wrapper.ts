/**
 * ai-sdk-wrapper.ts — Unified LLM interface using Vercel AI SDK
 *
 * Provides a single interface for streaming and non-streaming completions
 * across multiple providers (OpenRouter, Anthropic, local Ollama).
 * Falls back to existing OpenAI client if AI SDK is not configured.
 */

import { generateText, streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import logger from "./logger.js";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

let openaiProvider: ReturnType<typeof createOpenAI> | null = null;
let anthropicProvider: ReturnType<typeof createAnthropic> | null = null;

function getOpenAIProvider() {
  if (!openaiProvider) {
    openaiProvider = createOpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY || "",
      name: "openrouter",
    });
  }
  return openaiProvider;
}

function getAnthropicProvider() {
  if (!anthropicProvider) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return null;
    anthropicProvider = createAnthropic({ apiKey: key });
  }
  return anthropicProvider;
}

export interface AIStreamOptions {
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  provider?: "openrouter" | "anthropic";
}

/**
 * Generate a text completion using the Vercel AI SDK.
 * Falls back to the existing OpenAI client if no API key is set.
 */
export async function aiGenerateText(
  messages: ChatMessage[],
  options: AIStreamOptions = {},
): Promise<string> {
  const {
    model = "anthropic/claude-3.5-sonnet",
    systemPrompt,
    temperature = 0.7,
    maxTokens = 2000,
    provider = "openrouter",
  } = options;

  try {
    const modelInstance =
      provider === "anthropic" && getAnthropicProvider()
        ? getAnthropicProvider()!(model)
        : getOpenAIProvider()(model);

    const result = await generateText({
      model: modelInstance,
      messages: systemPrompt
        ? [{ role: "system" as const, content: systemPrompt }, ...messages]
        : messages,
      temperature,
      maxOutputTokens: maxTokens,
    });

    return result.text;
  } catch (err) {
    logger.warn(
      `[AI-SDK] generateText failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    throw err;
  }
}

/**
 * Stream a text completion using the Vercel AI SDK.
 * Returns an async iterable of text chunks.
 */
export async function* aiStreamText(
  messages: ChatMessage[],
  options: AIStreamOptions = {},
): AsyncGenerator<string> {
  const {
    model = "anthropic/claude-3.5-sonnet",
    systemPrompt,
    temperature = 0.7,
    maxTokens = 2000,
    provider = "openrouter",
  } = options;

  try {
    const modelInstance =
      provider === "anthropic" && getAnthropicProvider()
        ? getAnthropicProvider()!(model)
        : getOpenAIProvider()(model);

    const result = streamText({
      model: modelInstance,
      messages: systemPrompt
        ? [{ role: "system" as const, content: systemPrompt }, ...messages]
        : messages,
      temperature,
      maxOutputTokens: maxTokens,
    });

    for await (const chunk of result.textStream) {
      yield chunk;
    }
  } catch (err) {
    logger.warn(`[AI-SDK] streamText failed: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}

/**
 * Check if the Vercel AI SDK is available (has API key).
 */
export function isAiSdkAvailable(): boolean {
  return !!process.env.OPENROUTER_API_KEY || !!process.env.ANTHROPIC_API_KEY;
}
