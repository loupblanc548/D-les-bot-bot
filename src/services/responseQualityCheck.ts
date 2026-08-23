/**
 * responseQualityCheck.ts — Évaluation légère post-réponse
 *
 * Vérifie après coup la qualité d'une réponse IA:
 *  - réponse vide
 *  - langue incorrecte (détection simple)
 *  - répétition excessive
 *  - réponse trop longue
 *  - citation absente lorsqu'une recherche web a été utilisée
 *
 * Léger: pas d'appel IA, juste des heuristiques locales.
 */

import { classifyResponse } from "./responseClassifier.js";
import { hallucinationDetected } from "./prometheusExporter.js";
import logger from "../utils/logger.js";

export interface QualityIssue {
  type:
    "empty" | "wrong_language" | "repetition" | "too_long" | "missing_citation" | "hallucination";
  severity: "low" | "medium" | "high";
  message: string;
}

export interface QualityResult {
  issues: QualityIssue[];
  score: number; // 0-1, 1 = perfect
  passed: boolean;
}

const MAX_RESPONSE_LENGTH = 4000;
const REPETITION_THRESHOLD = 0.6; // 60% repeated words = problem
const MIN_RESPONSE_LENGTH = 3;

/**
 * Détecte la langue dominante d'un texte (français vs autre).
 * Heuristique simple basée sur les mots les plus fréquents.
 */
function detectDominantLanguage(text: string): "fr" | "en" | "other" {
  const frWords = [
    "le",
    "la",
    "les",
    "un",
    "une",
    "des",
    "et",
    "ou",
    "de",
    "à",
    "en",
    "dans",
    "pour",
    "que",
    "qui",
    "ne",
    "pas",
    "est",
    "sont",
    "avec",
    "sur",
    "ce",
    "cette",
    "mon",
    "ton",
    "son",
  ];
  const enWords = [
    "the",
    "a",
    "an",
    "and",
    "or",
    "of",
    "to",
    "in",
    "for",
    "that",
    "who",
    "not",
    "is",
    "are",
    "with",
    "on",
    "this",
    "my",
    "your",
    "his",
  ];

  const words = text
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1);
  let frCount = 0;
  let enCount = 0;

  for (const word of words) {
    if (frWords.includes(word)) frCount++;
    if (enWords.includes(word)) enCount++;
  }

  if (frCount > enCount && frCount > 0) return "fr";
  if (enCount > frCount && enCount > 0) return "en";
  return "other";
}

/**
 * Détecte la répétition excessive dans un texte.
 */
function detectRepetition(text: string): boolean {
  const words = text
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  if (words.length < 10) return false;

  const wordCount = new Map<string, number>();
  for (const word of words) {
    wordCount.set(word, (wordCount.get(word) ?? 0) + 1);
  }

  let repeatedWords = 0;
  for (const count of wordCount.values()) {
    if (count > 2) repeatedWords += count;
  }

  return repeatedWords / words.length > REPETITION_THRESHOLD;
}

/**
 * Évalue la qualité d'une réponse IA après envoi.
 * Léger: aucune appel IA, juste des heuristiques.
 */
export function evaluateResponseQuality(
  response: string,
  options?: {
    expectedLanguage?: "fr" | "en";
    usedWebSearch?: boolean;
    maxLength?: number;
  },
): QualityResult {
  const issues: QualityIssue[] = [];
  const expectedLang = options?.expectedLanguage ?? "fr";
  const maxLen = options?.maxLength ?? MAX_RESPONSE_LENGTH;

  // 1. Réponse vide
  const { category } = classifyResponse(response);
  if (category === "empty" || response.trim().length < MIN_RESPONSE_LENGTH) {
    issues.push({
      type: "empty",
      severity: "high",
      message: "Response is empty or too short",
    });
  }

  // 2. Hallucination détectée
  if (category === "hallucinated_error" || category === "technical_error") {
    issues.push({
      type: "hallucination",
      severity: "high",
      message: `Response classified as ${category}`,
    });
    hallucinationDetected.labels(category).inc();
  }

  // 3. Langue incorrecte
  if (response.length > 20) {
    const detectedLang = detectDominantLanguage(response);
    if (detectedLang !== expectedLang && detectedLang !== "other") {
      issues.push({
        type: "wrong_language",
        severity: "medium",
        message: `Expected ${expectedLang}, detected ${detectedLang}`,
      });
    }
  }

  // 4. Répétition excessive
  if (detectRepetition(response)) {
    issues.push({
      type: "repetition",
      severity: "medium",
      message: "Excessive word repetition detected",
    });
  }

  // 5. Réponse trop longue
  if (response.length > maxLen) {
    issues.push({
      type: "too_long",
      severity: "low",
      message: `Response exceeds ${maxLen} chars (${response.length})`,
    });
  }

  // 6. Citation absente après recherche web
  if (options?.usedWebSearch && !response.includes("http") && !response.includes("source")) {
    issues.push({
      type: "missing_citation",
      severity: "low",
      message: "Web search was used but no citation/source found in response",
    });
  }

  // Calcul du score
  const highSeverity = issues.filter((i) => i.severity === "high").length;
  const mediumSeverity = issues.filter((i) => i.severity === "medium").length;
  const lowSeverity = issues.filter((i) => i.severity === "low").length;
  const score = Math.max(0, 1 - (highSeverity * 0.4 + mediumSeverity * 0.2 + lowSeverity * 0.1));

  const result: QualityResult = {
    issues,
    score,
    passed: highSeverity === 0,
  };

  if (issues.length > 0) {
    logger.debug(`[QualityCheck] ${issues.length} issues found (score: ${score.toFixed(2)})`);
  }

  return result;
}
