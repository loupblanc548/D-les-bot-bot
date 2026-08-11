/**
 * localLlm.ts — LLM local via Ollama (OpenAI-compatible API)
 *
 * Ollama expose une API OpenAI-compatible sur http://localhost:11434/v1
 * Modèle recommandé: qwen2.5:14b (9GB RAM avec swap, function calling robuste)
 *
 * Utilisé en priorité pour les tâches simples (chat, traduction, réponses courtes).
 * Si le modèle local échoue ou est indisponible, fallback vers OpenRouter/NVIDIA.
 */

import OpenAI from "openai";
import logger from "../utils/logger.js";
import { fetchWithRetry, createCircuitBreaker } from "../utils/httpClient.js";
import { ConcurrencyPool } from "../utils/concurrencyPool.js";

const LOCAL_LLM_URL = process.env.LOCAL_LLM_URL || "http://127.0.0.1:11434/v1";
const LOCAL_LLM_MODELS = (process.env.LOCAL_LLM_MODEL || "qwen2.5:14b")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const LOCAL_LLM_ENABLED = process.env.LOCAL_LLM_ENABLED !== "false";
const LLM_MAX_CONCURRENCY = parseInt(process.env.LLM_MAX_CONCURRENCY_LOCAL || "4", 10);

// Le modèle actif est détecté dynamiquement au ping — premier modèle de la liste présent sur le serveur
let activeModel: string = LOCAL_LLM_MODELS[0] || "qwen2.5:14b";

const llmPool = new ConcurrencyPool(LLM_MAX_CONCURRENCY);

const LOCAL_BASE = LOCAL_LLM_URL.replace("/v1", "");
const isRemoteUrl = (LOCAL_BASE.startsWith("http://") && !LOCAL_BASE.includes("127.0.0.1") && !LOCAL_BASE.includes("localhost")) || LOCAL_BASE.startsWith("https://");
const pingTimeout = isRemoteUrl ? 8_000 : 3_000;
const pingFn = async () =>
  fetchWithRetry(`${LOCAL_BASE}/api/tags`, {
    timeoutMs: pingTimeout,
    retries: 2,
    parseJson: true,
    retryOn: (s) => s >= 500 || s === 429,
    onRetry: (attempt, err) => logger.info(`[LocalLLM] ping retry attempt ${attempt}: ${err}`),
  });
const pingBreaker = createCircuitBreaker(pingFn, { failureThreshold: 4, cooldownMs: 60_000 });

let client: OpenAI | null = null;
let availabilityChecked = false;
let available = false;

/**
 * Vérifie si Ollama est accessible (cache le résultat pour éviter les ping à chaque appel).
 */
export function isLocalLlmAvailable(): boolean {
  if (!LOCAL_LLM_ENABLED) return false;
  if (!availabilityChecked) return false;
  return available;
}

/**
 * Ping Ollama pour vérifier qu'il est en ligne. Met en cache le résultat.
 * À appeler au démarrage du bot et périodiquement.
 */
export async function checkLocalLlmAvailability(): Promise<boolean> {
  if (!LOCAL_LLM_ENABLED) {
    logger.info("[LocalLLM] 🔇 LLM local désactivé (LOCAL_LLM_ENABLED=false) — APIs uniquement");
    return false;
  }
  try {
    const data = await pingBreaker.fire() as { models?: Array<{ name: string }> };
    const serverModels = data?.models?.map((m) => m.name) || [];
    // Trouver le premier modèle de notre liste qui est présent sur le serveur
    const found = LOCAL_LLM_MODELS.find((m) => serverModels.includes(m));
    if (!found) {
      const serverList = serverModels.length > 0 ? ` (disponibles: ${serverModels.slice(0, 5).join(", ")})` : "";
      logger.warn(`[LocalLLM] Ollama en ligne mais aucun modèle configuré trouvé${serverList}`);
      available = false;
    } else {
      if (!available || found !== activeModel) {
        logger.info(`[LocalLLM] ✅ Ollama disponible — modèle actif: ${found}`);
      }
      activeModel = found;
      available = true;
    }
  } catch (err) {
    if (available) {
      logger.warn("[LocalLLM] Ollama indisponible — fallback vers OpenRouter/NVIDIA:", (err as Error).message);
    }
    available = false;
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
  if (healthCheckInterval) return;
  const intervalMs = isRemoteUrl ? 30_000 : 60_000;
  healthCheckInterval = setInterval(async () => {
    const wasAvailable = available;
    await checkLocalLlmAvailability();
    if (!wasAvailable && available) {
      logger.info("[LocalLLM] 🔄 Ollama de nouveau disponible — retour en mode local");
    }
  }, intervalMs);
  logger.info(`[LocalLLM] Health check périodique démarré (${intervalMs / 1000}s)`);
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
  if (!isLocalLlmAvailable()) return;
  try {
    logger.info(`[LocalLLM] 🔥 Pre-warm ${activeModel}...`);
    await llmPool.run(async () => {
      const localClient = getLocalClient();
      await localClient.chat.completions.create({
        model: activeModel,
        messages: [{ role: "user", content: "Hello" }],
        max_tokens: 1,
        stream: false,
      }, { timeout: 120_000 });
    });
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
      timeout: isRemoteUrl ? 120_000 : 90_000, // 120s for remote (ngrok/Colab latency), 90s local
    });
  }
  return client;
}

/**
 * Appelle le LLM local avec une conversation simple (sans tools).
 * Retourne le texte de la réponse, ou null si échec.
 */
export async function chatWithLocalLlm(
  messages: Array<{ role: string; content: string }>,
  options?: { maxTokens?: number; temperature?: number },
): Promise<string | null> {
  if (!isLocalLlmAvailable()) return null;

  // Adaptive max_tokens: fewer tokens for simple chat = faster response
  const lastMsg = messages[messages.length - 1]?.content || "";
  const isShortQuestion = lastMsg.length < 100;
  const adaptiveMaxTokens = options?.maxTokens ?? (isShortQuestion ? 200 : 500);

  try {
    const localClient = getLocalClient();
    const response = await llmPool.run(() => localClient.chat.completions.create({
      model: activeModel,
      messages: messages as never,
      max_tokens: adaptiveMaxTokens,
      temperature: options?.temperature ?? 0.7,
      stream: false,
    }));
    const text = response.choices?.[0]?.message?.content;
    if (!text) {
      logger.warn("[LocalLLM] Réponse vide du modèle local");
      return null;
    }
    logger.info(`[LocalLLM] ✅ Réponse locale (${text.length} chars, ${adaptiveMaxTokens} max) — ${activeModel}`);
    return text.trim();
  } catch (error) {
    // Don't log timeouts as warnings — they're expected on CPU for complex prompts
    const isTimeout = error instanceof Error && error.message.includes("timeout");
    if (isTimeout) {
      logger.info(`[LocalLLM] Timeout (90s) — tâche trop lourde, fallback API`);
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
  messages: Array<{ role: string; content: string }>,
  tools: unknown[],
  options?: { maxTokens?: number; temperature?: number },
): Promise<{ text: string | null; toolCalls: unknown[] | null } | null> {
  if (!isLocalLlmAvailable()) return null;

  try {
    const localClient = getLocalClient();
    const response = await llmPool.run(() => localClient.chat.completions.create({
      model: activeModel,
      messages: messages as never,
      tools: tools as never,
      max_tokens: options?.maxTokens ?? 500,
      temperature: options?.temperature ?? 0.7,
      stream: false,
    }));
    const choice = response.choices?.[0];
    if (!choice) return null;

    const text = choice.message?.content?.trim() || null;
    const toolCalls = choice.message?.tool_calls || null;

    logger.info(
      `[LocalLLM] ✅ Réponse locale avec tools (${activeModel}) — ${toolCalls ? `${toolCalls.length} tool calls` : "texte seul"}`,
    );
    return { text, toolCalls };
  } catch (error) {
    const isTimeout = error instanceof Error && error.message.includes("timeout");
    if (isTimeout) {
      logger.info(`[LocalLLM] Timeout tools (90s) — tâche trop lourde, fallback API`);
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

export const LOCAL_LLM_MODELS_LIST = LOCAL_LLM_MODELS;
export function getActiveModel(): string { return activeModel; }
