/**
 * nvidiaNim.ts — Intégration NVIDIA NIM (build.nvidia.com)
 *
 * NVIDIA propose des modèles gratuits via une API OpenAI-compatible.
 * Base URL: https://integrate.api.nvidia.com/v1
 * Auth: Bearer NVIDIA_API_KEY (clé gratuite sur build.nvidia.com/settings)
 *
 * Modèles gratuits notables (chat completions, function calling supporté):
 *  - nvidia/llama-3.3-nemotron-super-49b-v1.5  (49B, tools ✅)
 *  - nvidia/llama-3.1-nemotron-ultra-253b-v1   (253B MoE, tools ✅)
 *  - nvidia/llama-3.1-nemotron-nano-8b-v1      (8B, tools ✅)
 *  - nvidia/nemotron-3-ultra-550b-a55b          (550B MoE, tools ✅)
 *  - nvidia/nemotron-3-super-120b-a12b          (120B MoE, tools ✅)
 *  - nvidia/nemotron-3-nano-30b-a3b             (30B MoE, tools ✅)
 *  - nvidia/nvidia-nemotron-nano-9b-v2          (9B, tools ✅)
 *  - deepseek-ai/deepseek-v4-flash              (284B MoE, 1M context, tools ✅)
 *  - deepseek-ai/deepseek-v4-pro                (1M context, tools ✅)
 *  - openai/gpt-oss-120b                        (120B, tools ✅)
 *  - openai/gpt-oss-20b                         (20B, tools ✅)
 */

import OpenAI from "openai";
import logger from "../utils/logger.js";

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

let client: OpenAI | null = null;

/**
 * Retourne true si NVIDIA_API_KEY est configuré.
 */
export function isNvidiaNimAvailable(): boolean {
  return !!process.env.NVIDIA_API_KEY;
}

/**
 * Retourne le client OpenAI configuré pour NVIDIA NIM.
 * Lance une erreur si NVIDIA_API_KEY n'est pas défini.
 */
export function getNvidiaNimClient(): OpenAI | null {
  if (!isNvidiaNimAvailable()) return null;
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.NVIDIA_API_KEY!,
      baseURL: NVIDIA_BASE_URL,
      maxRetries: 2,
      timeout: 30_000,
    });
    logger.info("[NvidiaNIM] Client initialisé — modèles NVIDIA gratuits disponibles");
  }
  return client;
}

// ─── Modèles NVIDIA NIM gratuits (OpenAI-compatible, function calling) ───────
// Ordre: du plus puissant au plus léger
export const NVIDIA_FREE_MODELS = [
  "nvidia/llama-3.1-nemotron-ultra-253b-v1", // 253B MoE — le plus puissant
  "nvidia/nemotron-3-ultra-550b-a55b", // 550B MoE
  "deepseek-ai/deepseek-v4-pro", // 1M context, coding
  "deepseek-ai/deepseek-v4-flash", // 284B MoE, fast
  "nvidia/nemotron-3-super-120b-a12b", // 120B MoE
  "openai/gpt-oss-120b", // 120B OpenAI open-source
  "nvidia/llama-3.3-nemotron-super-49b-v1.5", // 49B
  "nvidia/llama-3.3-nemotron-super-49b-v1", // 49B v1
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning", // 30B MoE reasoning
  "nvidia/nemotron-3-nano-30b-a3b", // 30B MoE
  "openai/gpt-oss-20b", // 20B
  "nvidia/nvidia-nemotron-nano-9b-v2", // 9B
  "nvidia/llama-3.1-nemotron-nano-8b-v1", // 8B
  "nvidia/nemotron-mini-4b-instruct", // 4B — ultra léger
];

// ─── Catégories par complexité (pour taskModelRouter) ────────────────────────
export const NVIDIA_MODEL_TIERS = {
  trivial: [
    "nvidia/nemotron-mini-4b-instruct",
    "nvidia/llama-3.1-nemotron-nano-8b-v1",
    "nvidia/nvidia-nemotron-nano-9b-v2",
  ],
  simple: [
    "openai/gpt-oss-20b",
    "nvidia/nemotron-3-nano-30b-a3b",
    "nvidia/llama-3.3-nemotron-super-49b-v1.5",
  ],
  moderate: [
    "nvidia/nemotron-3-super-120b-a12b",
    "openai/gpt-oss-120b",
    "deepseek-ai/deepseek-v4-flash",
    "nvidia/llama-3.3-nemotron-super-49b-v1",
  ],
  complex: [
    "nvidia/llama-3.1-nemotron-ultra-253b-v1",
    "nvidia/nemotron-3-ultra-550b-a55b",
    "deepseek-ai/deepseek-v4-pro",
  ],
} as const;

/**
 * Retourne la liste des modèles NVIDIA gratuits disponibles
 * (filtrée par circuit breaker si intégré à modelRotation).
 */
export function getNvidiaFreeModels(): string[] {
  return [...NVIDIA_FREE_MODELS];
}

/**
 * Vérifie si un nom de modèle est un modèle NVIDIA NIM.
 */
export function isNvidiaModel(modelName: string): boolean {
  return (
    modelName.startsWith("nvidia/") ||
    modelName.startsWith("deepseek-ai/deepseek-v4") ||
    modelName.startsWith("openai/gpt-oss-")
  );
}

/**
 * Chat avec NVIDIA NIM en utilisant l'API OpenAI-compatible.
 * Sélectionne automatiquement le meilleur modèle disponible.
 */
export async function chatWithNvidiaNim(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 800,
): Promise<string | null> {
  const c = getNvidiaNimClient();
  if (!c) return null;

  const models = NVIDIA_FREE_MODELS;
  for (const model of models) {
    try {
      const completion = await c.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        max_tokens: maxTokens,
        temperature: 0.7,
      });
      const reply = completion.choices?.[0]?.message?.content;
      if (reply && reply.length > 2) {
        logger.info(`[NvidiaNIM] Réponse réussie avec ${model} (${reply.length} chars)`);
        return reply;
      }
    } catch (err) {
      logger.warn(
        `[NvidiaNIM] ${model} échoué: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return null;
}
