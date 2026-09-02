/**
 * localLlm.ts — LLM local via Ollama (OpenAI-compatible API)
 *
 * Qwen (3B / 7B / 14B) is on standby by default: weights stay on disk,
 * nothing is loaded into RAM. Cloud APIs handle chat until a later Llama install.
 *
 * Wake-up (mini PC): LOCAL_LLM_ENABLED=true and OLLAMA_STANDBY=false.
 * See src/utils/localLlmGate.ts and docs/LOCAL_LLM_SETUP.md.
 */

import OpenAI from "openai";
import logger from "../utils/logger.js";
import { shouldUseLocalOllama } from "../utils/localLlmGate.js";

const LOCAL_LLM_URL = process.env.LOCAL_LLM_URL || "http://127.0.0.1:11434/v1";
const LOCAL_LLM_MODEL = process.env.LOCAL_LLM_MODEL || "qwen2.5:14b";
// Optional vision model (for example qwen2.5vl:7b or llava:latest).
// The text model is never sent an image unless it is explicitly configured as a vision model.
const LOCAL_LLM_VISION_MODEL = process.env.LOCAL_LLM_VISION_MODEL?.trim() || "";

export type LocalLlmContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } }
    >;

export interface LocalLlmMessage {
  role: string;
  content: LocalLlmContent;
}

function contentToText(content: LocalLlmContent): string {
  if (typeof content === "string") return content;
  return content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join(" ");
}

let client: OpenAI | null = null;
let availabilityChecked = false;
let available = false;
let visionAvailable = false;

/**
 * Vérifie si Ollama est accessible (cache le résultat pour éviter les ping à chaque appel).
 */
export function isLocalLlmAvailable(): boolean {
  if (!shouldUseLocalOllama()) return false;
  if (!availabilityChecked) return false;
  return available;
}

/** Returns true only when an explicitly configured local vision model is installed. */
export function isLocalLlmVisionAvailable(): boolean {
  return shouldUseLocalOllama() && availabilityChecked && visionAvailable;
}

export function getLocalLlmVisionModelName(): string | null {
  return isLocalLlmVisionAvailable() ? LOCAL_LLM_VISION_MODEL : null;
}

/**
 * Ping Ollama pour vérifier qu'il est en ligne. Met en cache le résultat.
 * À appeler au démarrage du bot et périodiquement.
 */
export async function checkLocalLlmAvailability(): Promise<boolean> {
  if (!shouldUseLocalOllama()) {
    available = false;
    visionAvailable = false;
    availabilityChecked = true;
    logger.info(
      "[LocalLLM] ⏸ Ollama en standby — Qwen/GLM locaux non chargés (fichiers conservés). APIs cloud uniquement. Llama plus tard: LOCAL_LLM_ENABLED=true OLLAMA_STANDBY=false",
    );
    return false;
  }
  try {
    const res = await fetch(`${LOCAL_LLM_URL.replace("/v1", "")}/api/tags`, {
      signal: AbortSignal.timeout(3_000),
    });
    if (res.ok) {
      const data = (await res.json()) as { models?: Array<{ name: string }> };
      const hasModel = data.models?.some((m) => m.name === LOCAL_LLM_MODEL);
      visionAvailable = Boolean(
        LOCAL_LLM_VISION_MODEL && data.models?.some((m) => m.name === LOCAL_LLM_VISION_MODEL),
      );
      if (!hasModel) {
        logger.warn(`[LocalLLM] Ollama en ligne mais modèle ${LOCAL_LLM_MODEL} non trouvé`);
        available = false;
      } else {
        if (!available) {
          logger.info(`[LocalLLM] ✅ Ollama disponible — modèle: ${LOCAL_LLM_MODEL}`);
        }
        if (visionAvailable) {
          logger.info(`[LocalLLM] 👁️ Vision locale disponible — modèle: ${LOCAL_LLM_VISION_MODEL}`);
        }
        available = true;
      }
    } else {
      if (available) {
        logger.warn("[LocalLLM] Ollama indisponible — fallback vers OpenRouter/NVIDIA");
      }
      available = false;
      visionAvailable = false;
    }
  } catch {
    if (available) {
      logger.warn("[LocalLLM] Ollama indisponible — fallback vers OpenRouter/NVIDIA");
    }
    available = false;
    visionAvailable = false;
  }
  availabilityChecked = true;
  return available;
}

/**
 * Démarre un check périodique de santé Ollama (toutes les 60s).
 * Si Ollama redémarre, le bot le détecte et repasse en mode local.
 */
let healthCheckInterval: ReturnType<typeof setInterval> | null = null;

export function startLocalLlmHealthCheck(): void {
  if (!shouldUseLocalOllama()) {
    logger.info("[LocalLLM] Health check sauté — Ollama en standby");
    return;
  }
  if (healthCheckInterval) return;
  healthCheckInterval = setInterval(async () => {
    const wasAvailable = available;
    await checkLocalLlmAvailability();
    if (!wasAvailable && available) {
      logger.info("[LocalLLM] 🔄 Ollama de nouveau disponible — retour en mode local");
    }
  }, 60_000);
  logger.info("[LocalLLM] Health check périodique démarré (60s)");
}

export function stopLocalLlmHealthCheck(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
}

/**
 * Pre-warm Ollama: load the model into RAM so the first real request is fast.
 * Without this, the first message after bot startup takes ~5s extra.
 */
export async function preWarmLocalModel(): Promise<void> {
  if (!shouldUseLocalOllama() || !isLocalLlmAvailable()) return;
  try {
    logger.info(`[LocalLLM] 🔥 Pre-warm ${LOCAL_LLM_MODEL}...`);
    const localClient = getLocalClient();
    await localClient.chat.completions.create(
      {
        model: LOCAL_LLM_MODEL,
        messages: [{ role: "user", content: "Hello" }],
        max_tokens: 1,
        stream: false,
      },
      { timeout: 30_000 },
    );
    logger.info(`[LocalLLM] ✅ Modèle pré-chargé en RAM — premier message sera rapide`);
  } catch {
    logger.warn(`[LocalLLM] Pre-warm échoué — le premier message sera plus lent`);
  }
}

/**
 * Retourne le client OpenAI configuré pour Ollama.
 */
function getLocalClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: "ollama", // Ollama n'a pas besoin de clé mais le SDK exige une valeur
      baseURL: LOCAL_LLM_URL,
      maxRetries: 0,
      timeout: 120_000, // 120s max — qwen2.5:14b on CPU needs more time than 3b
    });
  }
  return client;
}

/**
 * Appelle le LLM local avec une conversation simple (sans tools).
 * Retourne le texte de la réponse, ou null si échec.
 */
const DEFAULT_LOCAL_REQUEST_TIMEOUT_MS = 20_000;

export async function chatWithLocalLlm(
  messages: LocalLlmMessage[],
  options?: { maxTokens?: number; temperature?: number; timeoutMs?: number; model?: string },
): Promise<string | null> {
  if (!isLocalLlmAvailable()) return null;

  // Adaptive max_tokens: fewer tokens for simple chat = faster response
  const lastMsg = contentToText(messages[messages.length - 1]?.content || "");
  const isShortQuestion = lastMsg.length < 100;
  const adaptiveMaxTokens = options?.maxTokens ?? (isShortQuestion ? 300 : 800);

  try {
    const localClient = getLocalClient();
    const response = await localClient.chat.completions.create(
      {
        model: options?.model || LOCAL_LLM_MODEL,
        messages: messages as never,
        max_tokens: adaptiveMaxTokens,
        temperature: options?.temperature ?? 0.7,
        stream: false,
      },
      { timeout: options?.timeoutMs ?? DEFAULT_LOCAL_REQUEST_TIMEOUT_MS },
    );
    const text = response.choices?.[0]?.message?.content;
    if (!text) {
      logger.warn("[LocalLLM] Réponse vide du modèle local");
      return null;
    }
    logger.info(
      `[LocalLLM] ✅ Réponse locale (${text.length} chars, ${adaptiveMaxTokens} max) — ${LOCAL_LLM_MODEL}`,
    );
    return text.trim();
  } catch (error) {
    // Don't log timeouts as warnings — they're expected on CPU for complex prompts
    const isTimeout = error instanceof Error && error.message.includes("timeout");
    if (isTimeout) {
      logger.info(`[LocalLLM] Timeout — tâche trop lourde, fallback API rapide`);
    } else {
      logger.warn(
        `[LocalLLM] Échec modèle local: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    // Ne pas marquer indisponible sur timeout — le 14B sur CPU peut être lent
    // mais reste disponible pour des tâches plus simples
    if (!isTimeout) {
      available = false;
    }
    return null;
  }
}

/**
 * Appelle le LLM local avec support de function calling (tools).
 * Ollama supporte le tool calling avec qwen2.5.
 */
export async function chatWithLocalLlmTools(
  messages: LocalLlmMessage[],
  tools: any[],
  options?: { maxTokens?: number; temperature?: number; timeoutMs?: number; model?: string },
): Promise<{ text: string | null; toolCalls: any[] | null } | null> {
  if (!isLocalLlmAvailable()) return null;

  try {
    const localClient = getLocalClient();
    const response = await localClient.chat.completions.create(
      {
        model: options?.model || LOCAL_LLM_MODEL,
        messages: messages as never,
        tools: tools as never,
        max_tokens: options?.maxTokens ?? 800,
        temperature: options?.temperature ?? 0.7,
        stream: false,
      },
      { timeout: options?.timeoutMs ?? DEFAULT_LOCAL_REQUEST_TIMEOUT_MS },
    );
    const choice = response.choices?.[0];
    if (!choice) return null;

    const text = choice.message?.content?.trim() || null;
    const toolCalls = choice.message?.tool_calls || null;

    logger.info(
      `[LocalLLM] ✅ Réponse locale avec tools — ${toolCalls ? `${toolCalls.length} tool calls` : "texte seul"}`,
    );
    return { text, toolCalls };
  } catch (error) {
    const isTimeout = error instanceof Error && error.message.includes("timeout");
    if (isTimeout) {
      logger.info(`[LocalLLM] Timeout tools — tâche trop lourde, fallback API rapide`);
    } else {
      logger.warn(
        `[LocalLLM] Échec modèle local (tools): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!isTimeout) {
      available = false;
    }
    return null;
  }
}

export const LOCAL_LLM_MODEL_NAME = LOCAL_LLM_MODEL;
export const LOCAL_LLM_VISION_MODEL_NAME = LOCAL_LLM_VISION_MODEL;
