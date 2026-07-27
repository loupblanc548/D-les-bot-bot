/**
 * orchestrator.ts — qwen2.5 as conductor/orchestrator
 *
 * Instead of qwen2.5 failing on complex tasks and falling back randomly,
 * qwen2.5 acts as a supervisor:
 * 1. Receives the task
 * 2. If simple → answers directly (0 API cost)
 * 3. If complex → breaks it down and delegates subtasks to bigger models
 * 4. Collects results and synthesizes the final answer
 *
 * The delegation happens via a tool: delegateToExpert
 * qwen2.5 calls it naturally through the existing tool-calling mechanism.
 */

import OpenAI from "openai";
import logger from "../utils/logger.js";
import { getOpenAIClient } from "./ai.js";
import { getNvidiaNimClient, isNvidiaNimAvailable, isNvidiaModel } from "./nvidiaNim.js";
import { getAllAvailableModels, markModelSuccess, markModelFailure } from "./modelRotation.js";

// Model tiers for delegation
const MODEL_TIERS = {
  // Small: free OpenRouter models (7-14B) — for simple subtasks
  small: [
    "meta-llama/llama-3.2-3b-instruct:free",
    "google/gemma-2-9b-it:free",
    "qwen/qwen-2.5-7b-instruct:free",
    "huggingfaceh4/zephyr-7b-beta:free",
  ],
  // Medium: free OpenRouter models (14-70B) — for moderate subtasks
  medium: [
    "meta-llama/llama-3.3-70b-instruct:free",
    "deepseek/deepseek-r1:free",
    "qwen/qwen-2.5-72b-instruct:free",
    "thedrummer/rocinante-12b:free",
  ],
  // Large: best available (NVIDIA NIM, premium) — for hard subtasks
  large: [] as string[],
} as const;

/**
 * Pick the best model for a given tier.
 * Checks cooldowns and availability.
 */
function pickModelForTier(tier: "small" | "medium" | "large"): string | null {
  if (tier === "large") {
    // Try NVIDIA NIM models first (free, powerful)
    if (isNvidiaNimAvailable()) {
      const nvidiaModels = getAllAvailableModels().filter((m) => isNvidiaModel(m));
      if (nvidiaModels.length > 0) return nvidiaModels[0];
    }
    // Fall back to medium tier
    return pickModelForTier("medium");
  }

  const candidates = MODEL_TIERS[tier];
  const allModels = getAllAvailableModels();

  // Pick first available model from the tier
  for (const model of candidates) {
    if (allModels.includes(model)) {
      return model;
    }
  }

  // Fallback: pick any available free model
  const anyFree = allModels.find((m) => m.includes(":free"));
  return anyFree || null;
}

/**
 * Get the appropriate OpenAI client for a model.
 */
function getClientForModel(modelName: string): OpenAI {
  if (isNvidiaModel(modelName) && isNvidiaNimAvailable()) {
    return getNvidiaNimClient()!;
  }
  return getOpenAIClient();
}

/**
 * Execute a subtask on a more powerful model.
 * Called by qwen2.5 via the delegateToExpert tool.
 *
 * @param task - The specific subtask to delegate
 * @param tier - "small", "medium", or "large" (qwen2.5 decides)
 * @param context - Additional context from the conversation
 * @returns The expert model's response
 */
export async function delegateToExpert(
  task: string,
  tier: "small" | "medium" | "large",
  context: string,
): Promise<string> {
  const model = pickModelForTier(tier);

  if (!model) {
    logger.warn(`[Orchestrator] Aucun modèle disponible pour tier "${tier}"`);
    return "[Délégation échouée: aucun modèle disponible]";
  }

  const client = getClientForModel(model);

  // Adaptive tokens: small tier = shorter response, large = more room
  const adaptiveMaxTokens = tier === "small" ? 300 : tier === "medium" ? 500 : 800;

  logger.info(`[Orchestrator] 🎯 qwen2.5 délègue à ${model} (tier: ${tier}, ${adaptiveMaxTokens} tokens) — tâche: ${task.slice(0, 80)}...`);

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "Tu es un expert IA. Réponds de manière précise et concise à la tâche qui t'est confiée. " +
            "Réponds dans la langue de la demande. Sois direct et factuel.",
        },
        {
          role: "user",
          content: `Contexte: ${context.slice(0, 400)}\n\nTâche: ${task}`,
        },
      ],
      max_tokens: adaptiveMaxTokens,
      temperature: 0.5,
      stream: false,
    }, { timeout: 10_000 });

    const result = response.choices?.[0]?.message?.content?.trim();

    if (result) {
      markModelSuccess(model);
      logger.info(`[Orchestrator] ✅ ${model} a répondu (${result.length} chars)`);
      return result;
    }

    markModelFailure(model, false);
    return "[Délégation échouée: réponse vide]";
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const isRateLimit = msg.includes("429") || msg.includes("rate");
    markModelFailure(model, isRateLimit);
    logger.warn(`[Orchestrator] ❌ ${model} échoué: ${msg.slice(0, 100)}`);

    // Try one fallback model (fast — 8s timeout)
    const fallbackModel = pickModelForTier(tier === "large" ? "medium" : "small");
    if (fallbackModel && fallbackModel !== model) {
      logger.info(`[Orchestrator] 🔄 Fallback vers ${fallbackModel}`);
      try {
        const fallbackClient = getClientForModel(fallbackModel);
        const response = await fallbackClient.chat.completions.create({
          model: fallbackModel,
          messages: [
            {
              role: "system",
              content: "Tu es un expert IA. Réponds de manière précise et concise.",
            },
            {
              role: "user",
              content: `Contexte: ${context.slice(0, 400)}\n\nTâche: ${task}`,
            },
          ],
          max_tokens: 600,
          temperature: 0.5,
          stream: false,
        });
        const result = response.choices?.[0]?.message?.content?.trim();
        if (result) {
          markModelSuccess(fallbackModel);
          return result;
        }
      } catch {
        // Give up
      }
    }

    return `[Délégation échouée: ${msg.slice(0, 100)}]`;
  }
}

/**
 * Delegate multiple subtasks in parallel.
 * When qwen2.5 splits a complex task into subtasks, they all run simultaneously.
 * @returns Array of results in the same order as the inputs.
 */
export async function delegateMultiple(
  tasks: Array<{ task: string; tier: "small" | "medium" | "large"; context?: string }>,
  defaultContext: string,
): Promise<string[]> {
  logger.info(`[Orchestrator] 🎼 Délégation parallèle: ${tasks.length} sous-tâches`);
  const results = await Promise.all(
    tasks.map((t) => delegateToExpert(t.task, t.tier, t.context || defaultContext)),
  );
  logger.info(`[Orchestrator] ✅ ${results.filter((r) => !r.startsWith("[Délégation échouée")).length}/${tasks.length} sous-tâches réussies`);
  return results;
}

/**
 * The delegation tool definition (OpenAI function calling format).
 * qwen2.5 sees this tool and can call it to delegate subtasks.
 */
export const DELEGATE_TOOL = {
  type: "function" as const,
  function: {
    name: "delegateToExpert",
    description:
      "Délègue une sous-tâche à un modèle IA plus puissant. Utilise cet outil QUAND tu ne peux pas " +
      "répondre toi-même (tâche trop complexe, raisonnement profond requis, code complexe, etc.). " +
      "NE l'utilise PAS pour les tâches simples (chat, traduction, questions factuelles, opinions). " +
      "Tu peux appeler cet outil plusieurs fois pour diviser une tâche complexe en sous-tâches, " +
      "puis synthétiser les résultats dans ta réponse finale.",
    parameters: {
      type: "object" as const,
      properties: {
        task: {
          type: "string",
          description: "La sous-tâche précise à déléguer à l'expert. Sois spécifique.",
        },
        tier: {
          type: "string",
          enum: ["small", "medium", "large"],
          description:
            "small: tâche simple (7-14B model). " +
            "medium: tâche modérée nécessitant du raisonnement (70B model). " +
            "large: tâche très complexe (code, analyse profonde, raisonnement multi-étapes).",
        },
        context: {
          type: "string",
          description: "Contexte pertinent de la conversation pour cette sous-tâche.",
        },
      },
      required: ["task", "tier"],
    },
  },
};
