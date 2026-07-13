/**
 * agentReflector.ts — MODULE C: Auto-réflexion & correction
 *
 * Ajoute une étape REFLECT dans la boucle de l'agent.
 * Après chaque exécution de tool, l'agent évalue:
 *   1. Est-ce que le tool a réussi ?
 *   2. Est-ce que le résultat est pertinent ?
 *   3. Dois-je corriger, réessayer, ou continuer ?
 *
 * Si un tool échoue, l'agent peut décider de:
 *   - Réessayer avec des paramètres différents
 *   - Utiliser un tool alternatif
 *   - Abandonner et informer l'utilisateur
 */

import { getOpenAIClient } from "./ai.js";
import { config } from "../config.js";
import logger from "../utils/logger.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ReflectionAction = "continue" | "retry" | "retry_different" | "abort" | "done";

export interface ReflectionResult {
  action: ReflectionAction;
  reasoning: string;
  confidence: number;
  corrected_args?: Record<string, unknown>;
  alternative_tool?: string;
}

export interface ToolExecutionResult {
  toolName: string;
  success: boolean;
  data: string;
  args: Record<string, unknown>;
}

// ─── Configuration ───────────────────────────────────────────────────────────

const REFLECTION_TIMEOUT_MS = 5_000;
const MAX_RETRIES_PER_TOOL = 2;

// ─── State tracking ──────────────────────────────────────────────────────────

const retryCount = new Map<string, number>();

// ─── Core API ────────────────────────────────────────────────────────────────

/**
 * Reflect on a tool execution result and decide the next action.
 *
 * Uses a lightweight LLM call to evaluate the result.
 * Falls back to rule-based heuristics if the LLM call fails.
 */
export async function reflectOnToolResult(
  userMessage: string,
  toolResult: ToolExecutionResult,
  iteration: number,
): Promise<ReflectionResult> {
  // Rule-based fast path for obvious cases
  if (toolResult.success && toolResult.data.length > 10) {
    // Tool succeeded with meaningful data — likely good to continue
    // But let the LLM decide if the data is actually relevant
  }

  if (!toolResult.success) {
    const toolKey = `${toolResult.toolName}-${iteration}`;
    const retries = retryCount.get(toolKey) ?? 0;

    if (retries >= MAX_RETRIES_PER_TOOL) {
      logger.warn(`[Reflector] ${toolResult.toolName} failed ${retries}x — aborting`);
      return {
        action: "abort",
        reasoning: `Tool ${toolResult.toolName} failed ${retries} times. Aborting to prevent infinite retry loop.`,
        confidence: 0.9,
      };
    }

    // Try rule-based correction first
    const ruleBased = ruleBasedReflection(toolResult);
    if (ruleBased) {
      retryCount.set(toolKey, retries + 1);
      return ruleBased;
    }
  }

  // LLM-based reflection for nuanced evaluation
  try {
    return await llmReflection(userMessage, toolResult, iteration);
  } catch (err) {
    logger.warn(
      `[Reflector] LLM reflection failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    // Fallback: continue if success, abort if fail
    return {
      action: toolResult.success ? "continue" : "abort",
      reasoning: "LLM reflection unavailable — using fallback heuristic",
      confidence: 0.5,
    };
  }
}

// ─── Rule-based reflection (fast, no LLM) ────────────────────────────────────

function ruleBasedReflection(toolResult: ToolExecutionResult): ReflectionResult | null {
  const { toolName, success, data, args } = toolResult;

  // URL-related tools: if URL is missing or invalid, suggest fixing
  if (!success && data.toLowerCase().includes("url")) {
    if (!args.url && args.query) {
      return {
        action: "retry_different",
        reasoning:
          "URL missing — the query parameter might be a URL. Retrying with corrected args.",
        confidence: 0.7,
        corrected_args: { ...args, url: args.query },
      };
    }
  }

  // Search tools: if no results, try broader query
  if (
    (success && data.toLowerCase().includes("no results")) ||
    data.toLowerCase().includes("aucun résultat")
  ) {
    if (args.query && typeof args.query === "string") {
      const broaderQuery = (args.query as string).split(/\s+/).slice(0, 3).join(" ");
      if (broaderQuery !== args.query) {
        return {
          action: "retry_different",
          reasoning: `No results for "${args.query}" — retrying with broader query "${broaderQuery}"`,
          confidence: 0.6,
          corrected_args: { ...args, query: broaderQuery },
        };
      }
    }
  }

  // Network errors: retry with same args
  if (
    !success &&
    (data.toLowerCase().includes("timeout") ||
      data.toLowerCase().includes("network") ||
      data.toLowerCase().includes("fetch"))
  ) {
    return {
      action: "retry",
      reasoning: `Network error on ${toolName} — retrying with same args`,
      confidence: 0.6,
    };
  }

  return null;
}

// ─── LLM-based reflection ────────────────────────────────────────────────────

async function llmReflection(
  userMessage: string,
  toolResult: ToolExecutionResult,
  iteration: number,
): Promise<ReflectionResult> {
  const client = getOpenAIClient();

  const response = await client.chat.completions.create(
    {
      model: config.openRouterModel,
      messages: [
        {
          role: "system",
          content:
            "Tu es un évaluateur d'agent IA. Évalue le résultat d'un tool et décide de la prochaine action.\n" +
            "Réponds UNIQUEMENT en JSON:\n" +
            '{"action": "continue|retry|retry_different|abort|done", "reasoning": "...", "confidence": 0.0-1.0}\n' +
            "Actions:\n" +
            "- continue: le tool a réussi, passe à l'étape suivante\n" +
            "- retry: réessayer avec les mêmes arguments (erreur transitoire)\n" +
            "- retry_different: réessayer avec des arguments corrigés (inclure corrected_args)\n" +
            "- abort: abandonner ce tool, informer l'utilisateur\n" +
            "- done: l'objectif est atteint, formuler la réponse finale",
        },
        {
          role: "user",
          content:
            `Requête utilisateur: ${userMessage.slice(0, 200)}\n` +
            `Tool: ${toolResult.toolName}\n` +
            `Succès: ${toolResult.success}\n` +
            `Résultat: ${toolResult.data.slice(0, 300)}\n` +
            `Itération: ${iteration + 1}/5`,
        },
      ],
      max_tokens: 200,
      temperature: 0.2,
    },
    { timeout: REFLECTION_TIMEOUT_MS },
  );

  const raw = response.choices[0]?.message?.content ?? "{}";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      action: "continue",
      reasoning: "Reflection parse failed — continuing",
      confidence: 0.3,
    };
  }

  const result = JSON.parse(jsonMatch[0]) as ReflectionResult;

  // Validate action
  const validActions: ReflectionAction[] = [
    "continue",
    "retry",
    "retry_different",
    "abort",
    "done",
  ];
  if (!validActions.includes(result.action)) {
    result.action = "continue";
  }

  // Clamp confidence
  result.confidence = Math.max(0, Math.min(1, result.confidence || 0.5));

  logger.info(
    `[Reflector] ${toolResult.toolName} → ${result.action} (conf: ${result.confidence}): ${result.reasoning?.slice(0, 80)}`,
  );
  return result;
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

/**
 * Reset retry counters for a specific interaction.
 */
export function resetRetries(interactionId: string): void {
  for (const key of retryCount.keys()) {
    if (key.includes(interactionId)) {
      retryCount.delete(key);
    }
  }
}

/**
 * Clear all retry state.
 */
export function clearAllRetries(): void {
  retryCount.clear();
}
