/**
 * reasoningPipeline.ts — Pipeline de raisonnement décomposé en 3 étapes
 *
 * Pattern: Comprendre → Analyser chaque aspect → Synthétiser
 * Utile pour les problèmes complexes de modération et threat intelligence.
 *
 * Étape 1: Comprendre le problème et identifier les aspects clés
 * Étape 2: Analyser chaque aspect individuellement
 * Étape 3: Synthétiser les analyses en une solution complète
 */

import logger from "../utils/logger.js";
import { getOpenAIClient } from "./ai.js";
import { config } from "../config.js";
import { parseJsonResponse } from "./moderationPrompts.js";

// ─── Types ────────────────────────────────────────────────────────────

export interface PipelineStep1 {
  aspects: string[];
}

export interface PipelineStep2 {
  analysis: string;
  severity?: number;
  flags?: string[];
}

export interface PipelineResult<T = unknown> {
  aspects: string[];
  analyses: { aspect: string; result: PipelineStep2 }[];
  solution: T;
  steps: number;
  durationMs: number;
}

// ─── Prompts ──────────────────────────────────────────────────────────

const STEP1_PROMPT = `Tu es un analyste expert.

Comprends ce problème: "{problem}"
Identifie les aspects clés (3 à 7 aspects maximum).

Réponds en JSON: {"aspects": ["aspect1", "aspect2", ...]}`;

const STEP2_PROMPT = `Tu es un analyste expert.

Analyse cet aspect: "{aspect}"
Du problème: "{problem}"

Donne une analyse détaillée avec:
- Évaluation de la sévérité (0-10)
- Flags éventuels
- Explication

Réponds en JSON: {"analysis": "...", "severity": 0-10, "flags": ["..."]}`;

const STEP3_PROMPT = `Tu es un expert en synthèse.

Voici les analyses des aspects du problème "{problem}":
{analysisResults}

Donne une solution complète et actionnable.

Réponds en JSON: {solution}`;

// ─── Pipeline ─────────────────────────────────────────────────────────

export async function runReasoningPipeline<T = unknown>(
  problem: string,
  options?: {
    maxAspects?: number;
    timeoutPerStep?: number;
    customStep3Format?: string;
  },
): Promise<PipelineResult<T>> {
  const startTime = Date.now();
  const maxAspects = options?.maxAspects ?? 7;
  const timeout = options?.timeoutPerStep ?? 15_000;
  let steps = 0;

  try {
    const client = getOpenAIClient();

    // Étape 1: Comprendre
    const step1Prompt = STEP1_PROMPT.replace("{problem}", problem.slice(0, 2000));
    const step1Completion = await client.chat.completions.create(
      {
        model: config.openRouterModel,
        messages: [
          { role: "system", content: "Tu es un analyste expert. Réponds UNIQUEMENT en JSON valide." },
          { role: "user", content: step1Prompt },
        ],
        max_tokens: 300,
        temperature: 0.2,
      },
      { timeout },
    );
    steps++;

    const step1Raw = step1Completion.choices[0]?.message?.content || "";
    const step1 = parseJsonResponse<PipelineStep1>(step1Raw);
    if (!step1 || !step1.aspects || step1.aspects.length === 0) {
      return {
        aspects: [],
        analyses: [],
        solution: {} as T,
        steps,
        durationMs: Date.now() - startTime,
      };
    }

    const aspects = step1.aspects.slice(0, maxAspects);

    // Étape 2: Analyser chaque aspect
    const analyses: { aspect: string; result: PipelineStep2 }[] = [];
    for (const aspect of aspects) {
      const step2Prompt = STEP2_PROMPT
        .replace("{aspect}", aspect)
        .replace("{problem}", problem.slice(0, 1500));

      const step2Completion = await client.chat.completions.create(
        {
          model: config.openRouterModel,
          messages: [
            { role: "system", content: "Tu es un analyste expert. Réponds UNIQUEMENT en JSON valide." },
            { role: "user", content: step2Prompt },
          ],
          max_tokens: 400,
          temperature: 0.2,
        },
        { timeout },
      );
      steps++;

      const step2Raw = step2Completion.choices[0]?.message?.content || "";
      const step2 = parseJsonResponse<PipelineStep2>(step2Raw);
      if (step2) {
        analyses.push({ aspect, result: step2 });
      }
    }

    // Étape 3: Synthèse
    const analysisResults = analyses
      .map((a) => `[${a.aspect}] ${a.result.analysis}${a.result.severity !== undefined ? ` (sévérité: ${a.result.severity}/10)` : ""}`)
      .join("\n");

    const step3Prompt = STEP3_PROMPT
      .replace("{problem}", problem.slice(0, 1000))
      .replace("{analysisResults}", analysisResults);

    const step3Completion = await client.chat.completions.create(
      {
        model: config.openRouterModel,
        messages: [
          { role: "system", content: "Tu es un expert en synthèse. Réponds UNIQUEMENT en JSON valide." },
          { role: "user", content: step3Prompt },
        ],
        max_tokens: 800,
        temperature: 0.3,
      },
      { timeout },
    );
    steps++;

    const step3Raw = step3Completion.choices[0]?.message?.content || "";
    const solution = parseJsonResponse<T>(step3Raw);

    return {
      aspects,
      analyses,
      solution: solution ?? ({} as T),
      steps,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    logger.error("[ReasoningPipeline] Erreur:", String(error));
    return {
      aspects: [],
      analyses: [],
      solution: {} as T,
      steps,
      durationMs: Date.now() - startTime,
    };
  }
}

// ─── Pipeline spécialisé: Modération complexe ─────────────────────────

export interface ModerationPipelineSolution {
  verdict: "clean" | "warning" | "action_required";
  overall_severity: number;
  actions: string[];
  summary: string;
}

export async function runModerationPipeline(
  problem: string,
): Promise<PipelineResult<ModerationPipelineSolution>> {
  return runReasoningPipeline<ModerationPipelineSolution>(problem, {
    maxAspects: 5,
    timeoutPerStep: 12_000,
  });
}

// ─── Pipeline spécialisé: Threat Intelligence ─────────────────────────

export interface ThreatPipelineSolution {
  threat_level: "none" | "low" | "medium" | "high" | "critical";
  risk_score: number;
  recommendations: string[];
  summary: string;
}

export async function runThreatPipeline(
  problem: string,
): Promise<PipelineResult<ThreatPipelineSolution>> {
  return runReasoningPipeline<ThreatPipelineSolution>(problem, {
    maxAspects: 7,
    timeoutPerStep: 15_000,
  });
}
