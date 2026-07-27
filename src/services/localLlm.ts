/**
 * localLlm.ts — LLM local via Ollama (OpenAI-compatible API)
 *
 * Ollama expose une API OpenAI-compatible sur http://localhost:11434/v1
 * Modèle recommandé: qwen2.5:3b (2.5GB RAM, rapide sur CPU)
 *
 * Utilisé en priorité pour les tâches simples (chat, traduction, réponses courtes).
 * Si le modèle local échoue ou est indisponible, fallback vers OpenRouter/NVIDIA.
 */

import OpenAI from "openai";
import logger from "../utils/logger.js";

const LOCAL_LLM_URL = process.env.LOCAL_LLM_URL || "http://127.0.0.1:11434/v1";
const LOCAL_LLM_MODEL = process.env.LOCAL_LLM_MODEL || "qwen2.5:3b";

let client: OpenAI | null = null;
let availabilityChecked = false;
let available = false;

/**
 * Vérifie si Ollama est accessible (cache le résultat pour éviter les ping à chaque appel).
 */
export function isLocalLlmAvailable(): boolean {
  if (!availabilityChecked) return false;
  return available;
}

/**
 * Ping Ollama pour vérifier qu'il est en ligne. Met en cache le résultat.
 * À appeler au démarrage du bot et périodiquement.
 */
export async function checkLocalLlmAvailability(): Promise<boolean> {
  try {
    const res = await fetch(`${LOCAL_LLM_URL.replace("/v1", "")}/api/tags`, {
      signal: AbortSignal.timeout(3_000),
    });
    if (res.ok) {
      const data = await res.json() as { models?: Array<{ name: string }> };
      const hasModel = data.models?.some((m) => m.name === LOCAL_LLM_MODEL);
      if (!hasModel) {
        logger.warn(`[LocalLLM] Ollama en ligne mais modèle ${LOCAL_LLM_MODEL} non trouvé`);
        available = false;
      } else {
        if (!available) {
          logger.info(`[LocalLLM] ✅ Ollama disponible — modèle: ${LOCAL_LLM_MODEL}`);
        }
        available = true;
      }
    } else {
      available = false;
    }
  } catch {
    if (available) {
      logger.warn("[LocalLLM] Ollama indisponible — fallback vers OpenRouter/NVIDIA");
    }
    available = false;
  }
  availabilityChecked = true;
  return available;
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
      timeout: 30_000,
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

  try {
    const localClient = getLocalClient();
    const response = await localClient.chat.completions.create({
      model: LOCAL_LLM_MODEL,
      messages: messages as never,
      max_tokens: options?.maxTokens ?? 800,
      temperature: options?.temperature ?? 0.7,
      stream: false,
    });
    const text = response.choices?.[0]?.message?.content;
    if (!text) {
      logger.warn("[LocalLLM] Réponse vide du modèle local");
      return null;
    }
    logger.info(`[LocalLLM] ✅ Réponse locale (${text.length} chars) — ${LOCAL_LLM_MODEL}`);
    return text.trim();
  } catch (error) {
    logger.warn(
      `[LocalLLM] Échec modèle local: ${error instanceof Error ? error.message : String(error)}`,
    );
    // Marquer comme potentiellement indisponible
    available = false;
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
    const response = await localClient.chat.completions.create({
      model: LOCAL_LLM_MODEL,
      messages: messages as never,
      tools: tools as never,
      max_tokens: options?.maxTokens ?? 800,
      temperature: options?.temperature ?? 0.7,
      stream: false,
    });
    const choice = response.choices?.[0];
    if (!choice) return null;

    const text = choice.message?.content?.trim() || null;
    const toolCalls = choice.message?.tool_calls || null;

    logger.info(
      `[LocalLLM] ✅ Réponse locale avec tools — ${toolCalls ? `${toolCalls.length} tool calls` : "texte seul"}`,
    );
    return { text, toolCalls };
  } catch (error) {
    logger.warn(
      `[LocalLLM] Échec modèle local (tools): ${error instanceof Error ? error.message : String(error)}`,
    );
    available = false;
    return null;
  }
}

export const LOCAL_LLM_MODEL_NAME = LOCAL_LLM_MODEL;
