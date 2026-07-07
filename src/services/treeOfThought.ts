/**
 * treeOfThought.ts — Tree of Thought (ToT) avec branches parallèles
 *
 * Pattern: Lancer N approches en parallèle → Fusionner en une solution optimale
 *
 * Branches par défaut:
 * 1. Approche technique — sécurité, implémentation, faisabilité
 * 2. Approche humaine — impact utilisateurs, psychologie, communication
 * 3. Approche économique — coûts, bénéfices, ressources, ROI
 *
 * Customisable: on peut définir ses propres branches.
 */

import logger from "../utils/logger.js";
import { getOpenAIClient } from "./ai.js";
import { config } from "../config.js";
import { parseJsonResponse } from "./moderationPrompts.js";

// ─── Types ────────────────────────────────────────────────────────────

export interface ThoughtBranch {
  name: string;
  perspective: string;
  analysis: string;
  score?: number;
  key_points?: string[];
}

export interface TreeOfThoughtResult<T = unknown> {
  branches: ThoughtBranch[];
  synthesis: T;
  best_branch: string | null;
  durationMs: number;
}

// ─── Branches par défaut ──────────────────────────────────────────────

export const DEFAULT_BRANCHES = [
  {
    name: "technique",
    perspective: "Approche technique du problème. Analyse la sécurité, l'implémentation, la faisabilité technique, les risques système.",
  },
  {
    name: "humaine",
    perspective: "Approche humaine du problème. Analyse l'impact sur les utilisateurs, la psychologie, la communication, l'aspect communautaire.",
  },
  {
    name: "économique",
    perspective: "Approche économique du problème. Analyse les coûts, les bénéfices, les ressources nécessaires, le ROI, l'impact à long terme.",
  },
] as const;

// ─── Prompts ──────────────────────────────────────────────────────────

const BRANCH_PROMPT = `Tu es un expert en analyse.

${"{perspective}"}

Problème: "${"{problem}"}"

Analyse ce problème de ton angle d'expertise.
Donne:
- Une analyse détaillée
- 3-5 points clés
- Un score de pertinence (0-10)

Réponds en JSON: {"analysis": "...", "key_points": ["..."], "score": 0-10}`;

const FUSION_PROMPT = `Tu es un expert en synthèse décisionnelle.

Voici 3 approches différentes du même problème "${"{problem}"}":

${"{branches}"}

Combine ces approches et donne la meilleure solution globale.
Prends en compte:
- Les points forts de chaque approche
- Les contradictions éventuelles
- La solution la plus équilibrée

${"{format}"}Réponds en JSON: ${"{schema}"}`;

// ─── Tree of Thought ──────────────────────────────────────────────────

export async function thinkTree<T = unknown>(
  problem: string,
  options?: {
    branches?: { name: string; perspective: string }[];
    timeoutPerStep?: number;
    outputSchema?: string;
  },
): Promise<TreeOfThoughtResult<T>> {
  const startTime = Date.now();
  const branches = options?.branches ?? DEFAULT_BRANCHES;
  const timeout = options?.timeoutPerStep ?? 15_000;
  const schema = options?.outputSchema ?? '{"solution": "...", "confidence": 0-100, "rationale": "..."}';

  try {
    const client = getOpenAIClient();

    // Phase 1: Lancer toutes les branches en parallèle
    const branchResults = await Promise.all(
      branches.map(async (branch) => {
        try {
          const prompt = BRANCH_PROMPT
            .replace("{perspective}", branch.perspective)
            .replace("{problem}", problem.slice(0, 2000));

          const completion = await client.chat.completions.create(
            {
              model: config.openRouterModel,
              messages: [
                { role: "system", content: "Tu es un expert en analyse. Réponds UNIQUEMENT en JSON valide." },
                { role: "user", content: prompt },
              ],
              max_tokens: 500,
              temperature: 0.3,
            },
            { timeout },
          );

          const raw = completion.choices[0]?.message?.content || "";
          const parsed = parseJsonResponse<{
            analysis: string;
            key_points: string[];
            score: number;
          }>(raw);

          return {
            name: branch.name,
            perspective: branch.perspective,
            analysis: parsed?.analysis ?? "Analyse indisponible",
            score: parsed?.score,
            key_points: parsed?.key_points,
          } as ThoughtBranch;
        } catch (err) {
          logger.error(`[TreeOfThought] Branch ${branch.name}:`, String(err));
          return {
            name: branch.name,
            perspective: branch.perspective,
            analysis: "Erreur API",
          } as ThoughtBranch;
        }
      }),
    );

    // Identifier la meilleure branche (score le plus élevé)
    const scored = branchResults.filter((b) => b.score !== undefined);
    const bestBranch = scored.length > 0
      ? scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0]?.name ?? null
      : null;

    // Phase 2: Fusion
    const branchesText = branchResults
      .map(
        (b) =>
          `### ${b.name.toUpperCase()}\n${b.analysis}${b.key_points ? `\nPoints clés: ${b.key_points.join(", ")}` : ""}${b.score !== undefined ? `\nScore: ${b.score}/10` : ""}`,
      )
      .join("\n\n");

    const fusionPrompt = FUSION_PROMPT
      .replace("{problem}", problem.slice(0, 1000))
      .replace("{branches}", branchesText)
      .replace("{format}", "")
      .replace("{schema}", schema);

    const fusionCompletion = await client.chat.completions.create(
      {
        model: config.openRouterModel,
        messages: [
          { role: "system", content: "Tu es un expert en synthèse décisionnelle. Réponds UNIQUEMENT en JSON valide." },
          { role: "user", content: fusionPrompt },
        ],
        max_tokens: 800,
        temperature: 0.3,
      },
      { timeout },
    );

    const fusionRaw = fusionCompletion.choices[0]?.message?.content || "";
    const synthesis = parseJsonResponse<T>(fusionRaw);

    return {
      branches: branchResults,
      synthesis: synthesis ?? ({} as T),
      best_branch: bestBranch,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    logger.error("[TreeOfThought] Error:", String(error));
    return {
      branches: [],
      synthesis: {} as T,
      best_branch: null,
      durationMs: Date.now() - startTime,
    };
  }
}

// ─── Spécialisations ──────────────────────────────────────────────────

export interface ModerationToTResult {
  solution: string;
  confidence: number;
  rationale: string;
}

export async function moderationThinkTree(
  problem: string,
): Promise<TreeOfThoughtResult<ModerationToTResult>> {
  return thinkTree<ModerationToTResult>(problem, {
    branches: [
      {
        name: "règles",
        perspective: "Approche par les règles. Quelle règle est violée? Quelle sanction est prévue? Y a-t-il des circonstances atténuantes?",
      },
      {
        name: "contexte",
        perspective: "Approche contextuelle. Quel est le contexte du message? L'intention derrière? L'historique de l'utilisateur?",
      },
      {
        name: "impact",
        perspective: "Approche par l'impact. Quel est l'impact sur la communauté? Sur les autres membres? Le précédent que ça crée?",
      },
    ],
    outputSchema: '{"solution": "...", "confidence": 0-100, "rationale": "..."}',
  });
}

export interface ThreatToTResult {
  threat_level: string;
  risk_score: number;
  recommendations: string[];
  summary: string;
}

export async function threatThinkTree(
  problem: string,
): Promise<TreeOfThoughtResult<ThreatToTResult>> {
  return thinkTree<ThreatToTResult>(problem, {
    branches: [
      {
        name: "technique",
        perspective: "Analyse technique: vecteurs d'attaque, vulnérabilités, patterns malveillants, indicateurs de compromis.",
      },
      {
        name: "comportemental",
        perspective: "Analyse comportementale: patterns d'utilisateur, anomalies temporelles, coordination suspecte, escalation.",
      },
      {
        name: "impact",
        perspective: "Analyse d'impact: dégâts potentiels, propagation, réputation du serveur, récupération nécessaire.",
      },
    ],
    outputSchema: '{"threat_level": "none|low|medium|high|critical", "risk_score": 0-100, "recommendations": [], "summary": "..."}',
  });
}
