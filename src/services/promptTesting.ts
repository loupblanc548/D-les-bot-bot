/**
 * promptTesting.ts — Framework d'A/B testing de prompts
 *
 * Compare deux prompts sur une batterie de cas de test.
 * Mesure: accuracy, temps de réponse, coût estimé.
 *
 * Usage:
 *   const result = await testPrompts(promptA, promptB, testCases);
 *   // result.winner → "A" | "B" | "tie"
 */

import logger from "../utils/logger.js";
import { getOpenAIClient } from "./ai.js";
import { config } from "../config.js";
import { parseJsonResponse } from "./moderationPrompts.js";

// ─── Types ────────────────────────────────────────────────────────────

export interface PromptTestCase {
  input: string;
  expected?: string;
  expectedContains?: string[];
  expectedJsonField?: string;
  expectedJsonValue?: string;
}

export interface PromptTestResult {
  response: string;
  score: number; // 0-100
  timeMs: number;
  costTokens: number;
  parsed: unknown;
}

export interface ABTestResult {
  winner: "A" | "B" | "tie";
  accuracyA: number;
  accuracyB: number;
  timeA: number;
  timeB: number;
  costA: number;
  costB: number;
  details: {
    case: number;
    scoreA: number;
    scoreB: number;
    timeA: number;
    timeB: number;
  }[];
  summary: string;
}

// ─── Évaluation ───────────────────────────────────────────────────────

function evaluateResponse(response: string, parsed: unknown, testCase: PromptTestCase): number {
  let score = 0;
  let checks = 0;

  // Check 1: expected exact match
  if (testCase.expected !== undefined) {
    checks++;
    if (response.trim().toLowerCase().includes(testCase.expected.trim().toLowerCase())) {
      score += 100;
    }
  }

  // Check 2: expected contains
  if (testCase.expectedContains && testCase.expectedContains.length > 0) {
    for (const expected of testCase.expectedContains) {
      checks++;
      if (response.toLowerCase().includes(expected.toLowerCase())) {
        score += 100;
      }
    }
  }

  // Check 3: expected JSON field value
  if (testCase.expectedJsonField && testCase.expectedJsonValue !== undefined) {
    checks++;
    const parsedObj = parsed as Record<string, unknown>;
    if (parsedObj && parsedObj[testCase.expectedJsonField] === testCase.expectedJsonValue) {
      score += 100;
    }
  }

  // Check 4: valid JSON (bonus)
  if (parsed !== null) {
    checks++;
    score += 80;
  }

  // Check 5: non-empty response
  if (response.trim().length > 0) {
    checks++;
    score += 50;
  }

  return checks > 0 ? Math.round(score / checks) : 0;
}

function estimateCost(promptLength: number, responseLength: number): number {
  // Estimation grossière: ~4 chars par token
  const inputTokens = Math.ceil(promptLength / 4);
  const outputTokens = Math.ceil(responseLength / 4);
  return inputTokens + outputTokens;
}

function average(arr: number[]): number {
  return arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
}

function calculateWinner(accuracyA: number, accuracyB: number): "A" | "B" | "tie" {
  const diff = accuracyA - accuracyB;
  if (Math.abs(diff) < 5) return "tie";
  return diff > 0 ? "A" : "B";
}

// ─── A/B Test ─────────────────────────────────────────────────────────

export async function testPrompts(
  promptA: string,
  promptB: string,
  testCases: PromptTestCase[],
  options?: {
    maxTokens?: number;
    timeout?: number;
    temperature?: number;
  },
): Promise<ABTestResult> {
  const maxTokens = options?.maxTokens ?? 300;
  const timeout = options?.timeout ?? 15_000;
  const temperature = options?.temperature ?? 0.1;

  const details: ABTestResult["details"] = [];
  const resultsA: PromptTestResult[] = [];
  const resultsB: PromptTestResult[] = [];

  try {
    const client = getOpenAIClient();

    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      const inputA = promptA + testCase.input;
      const inputB = promptB + testCase.input;

      // Run A
      const startA = Date.now();
      let responseA = "";
      let parsedA: unknown = null;
      try {
        const completionA = await client.chat.completions.create(
          {
            model: config.openRouterModel,
            messages: [
              { role: "system", content: "Réponds en JSON valide." },
              { role: "user", content: inputA.slice(0, 4000) },
            ],
            max_tokens: maxTokens,
            temperature,
          },
          { timeout },
        );
        responseA = completionA.choices[0]?.message?.content || "";
        parsedA = parseJsonResponse(responseA);
      } catch (err) {
        logger.error(`[PromptTest] A case ${i}:`, String(err));
      }
      const timeA = Date.now() - startA;
      const scoreA = evaluateResponse(responseA, parsedA, testCase);
      const costA = estimateCost(inputA.length, responseA.length);
      resultsA.push({
        response: responseA,
        score: scoreA,
        timeMs: timeA,
        costTokens: costA,
        parsed: parsedA,
      });

      // Run B
      const startB = Date.now();
      let responseB = "";
      let parsedB: unknown = null;
      try {
        const completionB = await client.chat.completions.create(
          {
            model: config.openRouterModel,
            messages: [
              { role: "system", content: "Réponds en JSON valide." },
              { role: "user", content: inputB.slice(0, 4000) },
            ],
            max_tokens: maxTokens,
            temperature,
          },
          { timeout },
        );
        responseB = completionB.choices[0]?.message?.content || "";
        parsedB = parseJsonResponse(responseB);
      } catch (err) {
        logger.error(`[PromptTest] B case ${i}:`, String(err));
      }
      const timeB = Date.now() - startB;
      const scoreB = evaluateResponse(responseB, parsedB, testCase);
      const costB = estimateCost(inputB.length, responseB.length);
      resultsB.push({
        response: responseB,
        score: scoreB,
        timeMs: timeB,
        costTokens: costB,
        parsed: parsedB,
      });

      details.push({
        case: i + 1,
        scoreA,
        scoreB,
        timeA,
        timeB,
      });
    }

    const accuracyA = average(resultsA.map((r) => r.score));
    const accuracyB = average(resultsB.map((r) => r.score));
    const timeA = average(resultsA.map((r) => r.timeMs));
    const timeB = average(resultsB.map((r) => r.timeMs));
    const costA = average(resultsA.map((r) => r.costTokens));
    const costB = average(resultsB.map((r) => r.costTokens));
    const winner = calculateWinner(accuracyA, accuracyB);

    const summary = [
      `Winner: ${winner === "tie" ? "Égalité" : `Prompt ${winner}`}`,
      `Accuracy: A=${accuracyA}% | B=${accuracyB}%`,
      `Temps: A=${timeA}ms | B=${timeB}ms`,
      `Tokens: A=${costA} | B=${costB}`,
      `Cas testés: ${testCases.length}`,
    ].join("\n");

    return {
      winner,
      accuracyA,
      accuracyB,
      timeA,
      timeB,
      costA,
      costB,
      details,
      summary,
    };
  } catch (error) {
    logger.error("[PromptTest] Fatal error:", String(error));
    return {
      winner: "tie",
      accuracyA: 0,
      accuracyB: 0,
      timeA: 0,
      timeB: 0,
      costA: 0,
      costB: 0,
      details: [],
      summary: `Erreur: ${String(error)}`,
    };
  }
}

// ─── Cas de test prédéfinis ───────────────────────────────────────────

export const SPAM_TEST_CASES: PromptTestCase[] = [
  {
    input: "GG bien joué les gars!",
    expectedJsonField: "verdict",
    expectedJsonValue: "clean",
  },
  {
    input: "CLICK HERE NOW!!! FREE MONEY!!!",
    expectedJsonField: "verdict",
    expectedJsonValue: "spam",
  },
  {
    input: "discord.gg/scam",
    expectedJsonField: "verdict",
    expectedJsonValue: "phishing",
  },
  {
    input: "T'es nul à ce jeu frérot",
    expectedJsonField: "verdict",
    expectedJsonValue: "clean",
  },
  {
    input: "Free Nitro! Claim now at discord-nitro-free.xyz",
    expectedJsonField: "verdict",
    expectedJsonValue: "phishing",
  },
  {
    input: "SPAM SPAM SPAM SPAM SPAM",
    expectedJsonField: "verdict",
    expectedJsonValue: "spam",
  },
  {
    input: "Hey tu veux t'amuser?",
    expectedJsonField: "verdict",
    expectedJsonValue: "clean",
  },
  {
    input: "Clique ici pour gagner un iPhone 15 → bit.ly/free-iphone",
    expectedJsonField: "verdict",
    expectedJsonValue: "phishing",
  },
];

export const SENTIMENT_TEST_CASES: PromptTestCase[] = [
  {
    input: "GG bien joué!",
    expectedContains: ["positif"],
  },
  {
    input: "Je vais te trouver IRL et te faire payer",
    expectedContains: ["négatif", "agressiv"],
  },
  {
    input: "Lol t'es mauvais frérot",
    expectedContains: ["neutre"],
  },
  {
    input: "Free Nitro! Claim now!",
    expectedContains: ["spam", "phishing"],
  },
  {
    input: "T'es vraiment le pire joueur, dégage",
    expectedContains: ["négatif", "harcèl"],
  },
];

// ─── Response Quality Evaluator ───────────────────────────────────────

export interface QualityBreakdown {
  accuracy: number;
  clarity: number;
  relevance: number;
  concision: number;
  consistency: number;
}

export interface QualityReport {
  score: number;
  breakdown: QualityBreakdown;
  grade: "A" | "B" | "C" | "D" | "F";
  issues: string[];
}

function calculateAccuracy(response: string, expected: unknown): number {
  if (!expected) return 50;
  let score = 0;
  let checks = 0;

  if (typeof expected === "string") {
    checks++;
    if (response.toLowerCase().includes(expected.toLowerCase())) score += 100;
  }

  if (Array.isArray((expected as PromptTestCase).expectedContains)) {
    for (const exp of (expected as PromptTestCase).expectedContains!) {
      checks++;
      if (response.toLowerCase().includes(exp.toLowerCase())) score += 100;
    }
  }

  if (
    (expected as PromptTestCase).expectedJsonField &&
    (expected as PromptTestCase).expectedJsonValue !== undefined
  ) {
    checks++;
    const parsed = parseJsonResponse<Record<string, unknown>>(response);
    if (
      parsed &&
      parsed[(expected as PromptTestCase).expectedJsonField!] ===
        (expected as PromptTestCase).expectedJsonValue
    ) {
      score += 100;
    }
  }

  // Valid JSON bonus
  checks++;
  if (parseJsonResponse(response) !== null) score += 80;

  return checks > 0 ? Math.round(score / checks) : 50;
}

function calculateClarity(response: string): number {
  let score = 100;
  const issues: string[] = [];

  // Too short
  if (response.trim().length < 10) {
    score -= 40;
    issues.push("Réponse trop courte");
  }

  // Too long (rambling)
  if (response.length > 3000) {
    score -= 20;
    issues.push("Réponse trop longue");
  }

  // Repetition detection
  const words = response.toLowerCase().split(/\s+/);
  const unique = new Set(words);
  if (words.length > 20 && unique.size / words.length < 0.5) {
    score -= 25;
    issues.push("Beaucoup de répétitions");
  }

  // Unclear markers
  if (/\.\.\.|(\?{3})|(!{3})|enfin|bref|voilà/i.test(response) && response.length < 100) {
    score -= 15;
    issues.push("Marqueurs d'hésitation");
  }

  return Math.max(0, score);
}

function calculateRelevance(response: string, prompt: string): number {
  let score = 100;

  // Extract key terms from prompt
  const promptWords = prompt
    .toLowerCase()
    .replace(/[^a-zà-ÿ\s]/g, " ")
    .split(/\s+/)
    .filter(
      (w) =>
        w.length > 4 &&
        !["tache", "format", "reponds", "json", "contraintes", "regles"].includes(w),
    );

  const responseLower = response.toLowerCase();
  const matched = promptWords.filter((w) => responseLower.includes(w));
  const relevanceRatio = promptWords.length > 0 ? matched.length / promptWords.length : 0.5;

  if (relevanceRatio < 0.1) score -= 50;
  else if (relevanceRatio < 0.2) score -= 30;
  else if (relevanceRatio < 0.3) score -= 15;

  // Off-topic detection (response about something completely different)
  if (response.length > 50 && relevanceRatio < 0.05) {
    score -= 30;
  }

  return Math.max(0, Math.round(score));
}

function calculateConcision(response: string): number {
  const length = response.trim().length;
  if (length < 50) return 60;
  if (length < 200) return 100;
  if (length < 500) return 90;
  if (length < 1000) return 75;
  if (length < 2000) return 60;
  return 40;
}

function calculateConsistency(response: string): number {
  let score = 100;
  const parsed = parseJsonResponse<Record<string, unknown>>(response);

  if (parsed) {
    // Check for contradictory fields in JSON
    const _keys = Object.keys(parsed);

    // violation=false but action=ban (contradictory)
    if (
      parsed.violation === false &&
      parsed.action &&
      parsed.action !== "none" &&
      parsed.action !== "rien"
    ) {
      score -= 40;
    }

    // severity=1 but action=ban (contradictory)
    if (parsed.severity === 1 && parsed.action === "ban") {
      score -= 30;
    }

    // confidence=0 but verdict given (contradictory)
    if (
      parsed.confidence === 0 &&
      parsed.verdict &&
      parsed.verdict !== "clean" &&
      parsed.verdict !== "neutre"
    ) {
      score -= 25;
    }

    // risk_score=0 but level=critique (contradictory)
    if (parsed.risk_score === 0 && parsed.level === "critique") {
      score -= 30;
    }
  } else {
    // Non-JSON: check for contradictions in text
    if (/oui.*non|true.*false|clean.*violation/i.test(response)) {
      score -= 20;
    }
  }

  return Math.max(0, score);
}

export function evaluatePromptQuality(
  prompt: string,
  response: string,
  expected?: unknown,
): QualityReport {
  const breakdown: QualityBreakdown = {
    accuracy: calculateAccuracy(response, expected),
    clarity: calculateClarity(response),
    relevance: calculateRelevance(response, prompt),
    concision: calculateConcision(response),
    consistency: calculateConsistency(response),
  };

  const score = Math.round(
    Object.values(breakdown).reduce((a, b) => a + b, 0) / Object.keys(breakdown).length,
  );

  const grade: QualityReport["grade"] =
    score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";

  const issues: string[] = [];
  if (breakdown.accuracy < 60)
    issues.push("Précision insuffisante — la réponse ne correspond pas à l'attendu");
  if (breakdown.clarity < 60) issues.push("Clarté faible — réponse confuse ou mal structurée");
  if (breakdown.relevance < 60) issues.push("Pertinence faible — réponse hors-sujet");
  if (breakdown.concision < 50) issues.push("Verbosité excessive — réponse trop longue");
  if (breakdown.consistency < 60) issues.push("Incohérences détectées — champs contradictoires");

  return {
    score,
    breakdown,
    grade,
    issues: issues.length > 0 ? issues : ["Qualité excellente — aucun problème"],
  };
}
