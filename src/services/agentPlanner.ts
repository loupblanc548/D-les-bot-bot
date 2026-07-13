/**
 * agentPlanner.ts — MODULE A: Planification multi-étapes
 *
 * Avant d'entrer dans la boucle REASON→ACT→OBSERVE→REPLY, l'agent
 * décompose les requêtes complexes en un plan structuré.
 *
 * Ex: "Organise un tournoi" →
 *   Step 1: Créer un salon #tournoi
 *   Step 2: Annoncer le tournoi avec les règles
 *   Step 3: Ouvrir les inscriptions
 *   Step 4: Lancer le tournoi
 *
 * Le plan est injecté dans le system prompt pour guider l'agent.
 */

import { getOpenAIClient } from "./ai.js";
import { config } from "../config.js";
import logger from "../utils/logger.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PlanStep {
  id: number;
  description: string;
  tool_hint: string;
  depends_on: number[];
}

export interface AgentPlan {
  goal: string;
  is_complex: boolean;
  steps: PlanStep[];
  estimated_tools: number;
}

// ─── Configuration ───────────────────────────────────────────────────────────

const PLANNER_TIMEOUT_MS = 8_000;
const MAX_PLAN_STEPS = 8;

// Heuristics for detecting complex requests without an LLM call
const COMPLEXITY_KEYWORDS = [
  "organise",
  "organiser",
  "planifie",
  "planifier",
  "crée",
  "créer",
  "setup",
  "configure",
  "mets en place",
  "démarre",
  "lance un",
  "tournoi",
  "event",
  "événement",
  "concours",
  "giveaway",
  "purge",
  "nettoie",
  "backup",
  "sauvegarde",
  "migrate",
  "résume",
  "analyse",
  "rapport",
  "investigate",
  "investigation",
];

// ─── Quick complexity check (no LLM needed) ──────────────────────────────────

export function isComplexRequest(userMessage: string): boolean {
  const lower = userMessage.toLowerCase();
  const wordCount = userMessage.split(/\s+/).length;

  // Keyword match
  if (COMPLEXITY_KEYWORDS.some((kw) => lower.includes(kw))) return true;

  // Long message with multiple sentences
  const sentences = userMessage.split(/[.!?]/).filter((s) => s.trim().length > 0);
  if (sentences.length >= 3 && wordCount >= 20) return true;

  // Multiple action verbs
  const actionVerbs = ["et", "puis", "ensuite", "après", "finally", "also"];
  const actionCount = actionVerbs.filter((v) => lower.includes(v)).length;
  if (actionCount >= 2) return true;

  return false;
}

// ─── LLM Planner ─────────────────────────────────────────────────────────────

/**
 * Generate a structured plan for a complex user request.
 * Uses a fast LLM call to decompose the goal into steps.
 */
export async function generatePlan(
  userMessage: string,
  availableTools: string[],
): Promise<AgentPlan | null> {
  // Quick check: is this complex enough to warrant planning?
  if (!isComplexRequest(userMessage)) {
    return null;
  }

  try {
    const client = getOpenAIClient();

    const toolList = availableTools.slice(0, 50).join(", ");

    const response = await client.chat.completions.create(
      {
        model: config.openRouterModel,
        messages: [
          {
            role: "system",
            content:
              "Tu es un planificateur d'agent IA. Décompose la requête en étapes structurées.\n" +
              "Réponds UNIQUEMENT en JSON valide avec ce format:\n" +
              '{"goal": "objectif global", "is_complex": true, "steps": [{"id": 1, "description": "...", "tool_hint": "nom_du_tool", "depends_on": []}]}\n' +
              "Maximum " +
              MAX_PLAN_STEPS +
              " étapes. Sois concis.\n" +
              "Tools disponibles: " +
              toolList,
          },
          {
            role: "user",
            content: userMessage,
          },
        ],
        max_tokens: 600,
        temperature: 0.3,
      },
      { timeout: PLANNER_TIMEOUT_MS },
    );

    const raw = response.choices[0]?.message?.content ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const plan = JSON.parse(jsonMatch[0]) as AgentPlan;

    // Validate and sanitize
    if (!plan.steps || !Array.isArray(plan.steps) || plan.steps.length === 0) {
      return null;
    }

    // Enforce max steps
    plan.steps = plan.steps.slice(0, MAX_PLAN_STEPS);

    // Ensure each step has required fields
    plan.steps = plan.steps.map((step, i) => ({
      id: step.id || i + 1,
      description: step.description || `Étape ${i + 1}`,
      tool_hint: step.tool_hint || "auto",
      depends_on: Array.isArray(step.depends_on) ? step.depends_on : [],
    }));

    plan.estimated_tools = plan.steps.length;
    plan.is_complex = true;

    logger.info(
      `[Planner] Plan généré: ${plan.steps.length} étapes pour "${userMessage.slice(0, 60)}..."`,
    );
    return plan;
  } catch (err) {
    logger.warn(
      `[Planner] Échec planification: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * Format the plan as a string for injection into the system prompt.
 */
export function formatPlanForPrompt(plan: AgentPlan): string {
  const stepsText = plan.steps
    .map((s) => `  ${s.id}. ${s.description} [tool: ${s.tool_hint}]`)
    .join("\n");

  return (
    "\n## PLAN D'EXÉCUTION APPROUVÉ\n" +
    `Objectif: ${plan.goal}\n` +
    "Suis ces étapes dans l'ordre. Utilise les tools appropriés pour chaque étape.\n" +
    "Après chaque étape, vérifie le résultat avant de passer à la suivante.\n\n" +
    `Étapes:\n${stepsText}\n`
  );
}
