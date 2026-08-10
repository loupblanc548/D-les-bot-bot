/**
 * colabLlm.ts — Dynamic LLM client for Google Colab backend.
 *
 * Polls a file or webhook for the current ngrok URL, reconnects when it changes.
 * Falls back to cloud API (OpenAI/OpenRouter) when Colab is unavailable.
 */

import OpenAI from "openai";
import logger from "../utils/logger.js";
import { fetchWithRetry, createCircuitBreaker } from "../utils/httpClient.js";
import { ConcurrencyPool } from "../utils/concurrencyPool.js";
import fs from "fs";

const COLAB_ENABLED = process.env.LLM_DYNAMIC_URL === "true";
const URL_FILE = process.env.LLM_DYNAMIC_URL_FILE || "/opt/bot/data/colab_url.txt";
const URL_POLL_MS = parseInt(process.env.LLM_DYNAMIC_URL_POLL_MS || "30000", 10);
const COLAB_MODEL = process.env.LOCAL_LLM_MODEL || "qwen2.5:7b";
const COLAB_TIMEOUT = parseInt(process.env.LLM_TIMEOUT_LOCAL_MS || "60000", 10);
const MAX_CONCURRENCY = parseInt(process.env.LLM_MAX_CONCURRENCY_LOCAL || "4", 10);

const colabPool = new ConcurrencyPool(MAX_CONCURRENCY);

let currentUrl: string | null = null;
let colabClient: OpenAI | null = null;
let available = false;
let pollInterval: ReturnType<typeof setInterval> | null = null;

/** Read the Colab URL from file (written by webhook or external script). */
function readColabUrl(): string | null {
  try {
    const content = fs.readFileSync(URL_FILE, "utf-8").trim();
    if (content && content.startsWith("http")) return content;
  } catch {
    // File doesn't exist yet — Colab not started
  }
  return null;
}

/** Ping the Colab Ollama instance to verify it's alive. */
async function pingColab(url: string): Promise<boolean> {
  try {
    const data = await fetchWithRetry(`${url}/api/tags`, {
      timeoutMs: 5_000,
      retries: 1,
      parseJson: true,
      retryOn: (s) => s >= 500,
    });
    return !!data?.models?.some((m: { name: string }) => m.name === COLAB_MODEL);
  } catch {
    return false;
  }
}

/** Update the Colab URL if it changed. Called by poll loop and webhook. */
export async function updateColabUrl(): Promise<boolean> {
  if (!COLAB_ENABLED) return false;

  const newUrl = readColabUrl();
  if (!newUrl) {
    if (available) {
      logger.info("[ColabLLM] URL file empty — Colab session ended, marking unavailable");
    }
    available = false;
    return false;
  }

  if (newUrl === currentUrl && available) return true; // No change

  // URL changed or first connect — verify it's alive
  const isAlive = await pingColab(newUrl);
  if (isAlive) {
    if (currentUrl !== newUrl) {
      logger.info(`[ColabLLM] ✅ Colab URL updated: ${newUrl}`);
    }
    currentUrl = newUrl;
    colabClient = new OpenAI({
      apiKey: "ollama",
      baseURL: `${newUrl}/v1`,
      maxRetries: 0,
      timeout: COLAB_TIMEOUT,
    });
    available = true;
    return true;
  } else {
    if (available) {
      logger.warn(`[ColabLLM] Ping failed for ${newUrl} — marking unavailable`);
    }
    available = false;
    return false;
  }
}

/** Webhook handler — called when Colab sends a new URL. */
export async function setColabUrl(url: string): Promise<void> {
  if (!COLAB_ENABLED) return;
  try {
    fs.writeFileSync(URL_FILE, url, "utf-8");
    logger.info(`[ColabLLM] URL written to file: ${url}`);
    await updateColabUrl();
  } catch (err) {
    logger.error("[ColabLLM] Failed to write URL file:", err);
  }
}

/** Check if Colab LLM is available. */
export function isColabLlmAvailable(): boolean {
  return COLAB_ENABLED && available;
}

/** Start polling for URL changes. */
export function startColabPolling(): void {
  if (!COLAB_ENABLED || pollInterval) return;

  // Initial check
  updateColabUrl();

  pollInterval = setInterval(async () => {
    await updateColabUrl();
  }, URL_POLL_MS);

  logger.info(`[ColabLLM] Polling started (every ${URL_POLL_MS / 1000}s, file: ${URL_FILE})`);
}

/** Stop polling. */
export function stopColabPolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

/** Chat with the Colab LLM. Returns response text or null on failure. */
export async function chatWithColabLlm(
  messages: Array<{ role: string; content: string }>,
  options?: { maxTokens?: number; temperature?: number },
): Promise<string | null> {
  if (!isColabLlmAvailable() || !colabClient) return null;

  const lastMsg = messages[messages.length - 1]?.content || "";
  const isShort = lastMsg.length < 100;
  const maxTokens = options?.maxTokens ?? (isShort ? 200 : 500);

  try {
    const response = await colabPool.run(() =>
      colabClient!.chat.completions.create({
        model: COLAB_MODEL,
        messages: messages as never,
        max_tokens: maxTokens,
        temperature: options?.temperature ?? 0.7,
        stream: false,
      }),
    );

    const text = response.choices?.[0]?.message?.content;
    if (!text) {
      logger.warn("[ColabLLM] Empty response");
      return null;
    }
    logger.info(`[ColabLLM] ✅ Response (${text.length} chars) — ${COLAB_MODEL}`);
    return text.trim();
  } catch (err) {
    const isTimeout = err instanceof Error && err.message.includes("timeout");
    if (isTimeout) {
      logger.info("[ColabLLM] Timeout — task too heavy for Colab GPU");
    } else {
      logger.warn(`[ColabLLM] Failed: ${err instanceof Error ? err.message : String(err)}`);
      available = false;
    }
    return null;
  }
}

/** Chat with tools (function calling). */
export async function chatWithColabLlmTools(
  messages: Array<{ role: string; content: string }>,
  tools: unknown[],
  options?: { maxTokens?: number; temperature?: number },
): Promise<{ text: string | null; toolCalls: unknown[] | null } | null> {
  if (!isColabLlmAvailable() || !colabClient) return null;

  try {
    const response = await colabPool.run(() =>
      colabClient!.chat.completions.create({
        model: COLAB_MODEL,
        messages: messages as never,
        tools: tools as never,
        max_tokens: options?.maxTokens ?? 500,
        temperature: options?.temperature ?? 0.7,
        stream: false,
      }),
    );

    const choice = response.choices?.[0];
    if (!choice) return null;

    const text = choice.message?.content?.trim() || null;
    const toolCalls = choice.message?.tool_calls || null;

    logger.info(
      `[ColabLLM] ✅ Tools response — ${toolCalls ? `${toolCalls.length} tool calls` : "text only"}`,
    );
    return { text, toolCalls };
  } catch (err) {
    logger.warn(`[ColabLLM] Tools failed: ${err instanceof Error ? err.message : String(err)}`);
    available = false;
    return null;
  }
}

export const COLAB_MODEL_NAME = COLAB_MODEL;
