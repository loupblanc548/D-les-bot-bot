/**
 * multiExpertConsensus.ts — Système de consensus multi-experts
 *
 * Lance plusieurs "experts" avec des personas différents en parallèle,
 * puis fusionne les résultats par vote majoritaire.
 *
 * Pattern: Promise.all([expert1, expert2, expert3]) → consensus
 *
 * Experts:
 * 1. Modérateur strict — zero tolérance, sécuritaire
 * 2. Modérateur juste — équitable, pondéré
 * 3. Modérateur empathique — contextuel, humain
 *
 * Le consensus prend la décision la plus fréquente ou la plus sévère
 * si divergence, avec une confiance basée sur l'unanimité.
 */

import logger from "../utils/logger.js";
import { getOpenAIClient } from "./ai.js";
import { config } from "../config.js";
import { parseJsonResponse } from "./moderationPrompts.js";

// ─── Types ────────────────────────────────────────────────────────────

export interface ExpertOpinion {
  expert: string;
  verdict: string;
  confidence: number;
  severity: number;
  action: string;
  reasoning: string;
}

export interface ConsensusResult {
  final_verdict: string;
  final_action: string;
  confidence: number;
  unanimity: boolean;
  votes: { verdict: string; count: number }[];
  opinions: ExpertOpinion[];
  decision_method: "unanimous" | "majority" | "most_severe" | "tiebreak";
}

// ─── Personas d'experts ───────────────────────────────────────────────

const EXPERT_PERSONAS = [
  {
    name: "modérateur_strict",
    system: "Tu es un modérateur Discord strict avec zero tolérance. La sécurité du serveur passe avant tout. Tu es sévère mais juste dans l'application des règles.",
  },
  {
    name: "modérateur_juste",
    system: "Tu es un modérateur Discord juste et équitable. Tu pèses le pour et le contre. Tu considères le contexte et l'intention avant de décider.",
  },
  {
    name: "modérateur_empathique",
    system: "Tu es un modérateur Discord empathique. Tu considères le contexte humain, l'intention derrière le message, et la possibilité d'erreur. Tu préfères éduquer que punir.",
  },
] as const;

// ─── Prompt partagé ───────────────────────────────────────────────────

const EXPERT_TASK_PROMPT = `Analyse ce message Discord et donne ton verdict.

MESSAGE: "{message}"
CONTEXTE: {context}

Réponds en JSON strict:
{
  "verdict": "clean|warning|violation|severe",
  "confidence": 0-100,
  "severity": 0-10,
  "action": "rien|warn|timeout|kick|ban|delete",
  "reasoning": "..."
}`;

// ─── Vote majoritaire ─────────────────────────────────────────────────

function voteMajority(opinions: ExpertOpinion[]): {
  verdict: string;
  action: string;
  votes: { verdict: string; count: number }[];
  unanimity: boolean;
  method: "unanimous" | "majority" | "most_severe" | "tiebreak";
} {
  // Compter les votes par verdict
  const verdictCounts = new Map<string, number>();
  const actionCounts = new Map<string, number>();

  for (const op of opinions) {
    verdictCounts.set(op.verdict, (verdictCounts.get(op.verdict) ?? 0) + 1);
    actionCounts.set(op.action, (actionCounts.get(op.action) ?? 0) + 1);
  }

  const votes = Array.from(verdictCounts.entries())
    .map(([verdict, count]) => ({ verdict, count }))
    .sort((a, b) => b.count - a.count);

  const unanimity = votes.length === 1;

  // Verdict: majorité simple
  let verdict = votes[0]?.verdict ?? "clean";
  let method: "unanimous" | "majority" | "most_severe" | "tiebreak" = unanimity
    ? "unanimous"
    : "majority";

  // Si tie (2+ verdicts avec même count), prendre le plus sévère
  if (votes.length > 1 && votes[0].count === votes[1].count) {
    const severityOrder = ["clean", "warning", "violation", "severe"];
    const tied = votes.filter((v) => v.count === votes[0].count);
    tied.sort((a, b) => {
      const sa = severityOrder.indexOf(a.verdict);
      const sb = severityOrder.indexOf(b.verdict);
      return sb - sa;
    });
    verdict = tied[0].verdict;
    method = "most_severe";
  }

  // Action: prendre la plus fréquente, ou la plus sévère en cas de tie
  const actionVotes = Array.from(actionCounts.entries()).sort((a, b) => b[1] - a[1]);
  let action = actionVotes[0]?.[0] ?? "rien";
  if (actionVotes.length > 1 && actionVotes[0][1] === actionVotes[1][1]) {
    const actionOrder = ["rien", "warn", "delete", "timeout", "kick", "ban"];
    const tiedActions = actionVotes.filter((a) => a[1] === actionVotes[0][1]);
    tiedActions.sort((a, b) => {
      const sa = actionOrder.indexOf(a[0]);
      const sb = actionOrder.indexOf(b[0]);
      return sb - sa;
    });
    action = tiedActions[0][0];
    if (method === "majority") method = "tiebreak";
  }

  return { verdict, action, votes, unanimity, method };
}

// ─── Consensus multi-experts ──────────────────────────────────────────

export async function getMultiExpertConsensus(
  message: string,
  context?: string,
): Promise<ConsensusResult> {
  const startTime = Date.now();

  try {
    const client = getOpenAIClient();
    const taskPrompt = EXPERT_TASK_PROMPT
      .replace("{message}", message.slice(0, 2000))
      .replace("{context}", context ?? "message isolé sur serveur gaming francophone");

    // Lancer tous les experts en parallèle
    const opinions = await Promise.all(
      EXPERT_PERSONAS.map(async (persona) => {
        try {
          const completion = await client.chat.completions.create(
            {
              model: config.openRouterModel,
              messages: [
                { role: "system", content: persona.system },
                { role: "user", content: taskPrompt },
              ],
              max_tokens: 300,
              temperature: 0.2,
            },
            { timeout: 12_000 },
          );

          const raw = completion.choices[0]?.message?.content || "";
          const parsed = parseJsonResponse<Omit<ExpertOpinion, "expert">>(raw);

          if (!parsed) {
            return {
              expert: persona.name,
              verdict: "clean",
              confidence: 0,
              severity: 0,
              action: "rien",
              reasoning: "Parse error",
            } as ExpertOpinion;
          }

          return {
            expert: persona.name,
            ...parsed,
          } as ExpertOpinion;
        } catch (err) {
          logger.error(`[MultiExpert] ${persona.name} error:`, String(err));
          return {
            expert: persona.name,
            verdict: "clean",
            confidence: 0,
            severity: 0,
            action: "rien",
            reasoning: "Erreur API",
          } as ExpertOpinion;
        }
      }),
    );

    // Consensus par vote majoritaire
    const { verdict, action, votes, unanimity, method } = voteMajority(opinions);

    // Confiance basée sur l'unanimité et la confiance moyenne des experts
    const avgConfidence = opinions.reduce((sum, op) => sum + op.confidence, 0) / opinions.length;
    const confidence = unanimity ? Math.round(avgConfidence) : Math.round(avgConfidence * 0.7);

    return {
      final_verdict: verdict,
      final_action: action,
      confidence,
      unanimity,
      votes,
      opinions,
      decision_method: method,
    };
  } catch (error) {
    logger.error("[MultiExpert] Consensus error:", String(error));
    return {
      final_verdict: "clean",
      final_action: "rien",
      confidence: 0,
      unanimity: false,
      votes: [],
      opinions: [],
      decision_method: "tiebreak",
    };
  }
}
