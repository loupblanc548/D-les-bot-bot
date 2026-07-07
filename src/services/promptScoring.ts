/**
 * promptScoring.ts — Scoring automatique de qualité de prompts
 *
 * Évalue un prompt sur 5 dimensions (0-20 chacune, total 0-100):
 * 1. Clarté — structure (TÂCHE, RÈGLES, FORMAT)
 * 2. Contexte — longueur, CONTEXTE explicite
 * 3. Exemples — few-shot, format JSON
 * 4. Contraintes — CONTRAINTES, nombres explicites
 * 5. Rôle — persona, expérience
 *
 * Usage:
 *   const score = scorePrompt(prompt);       // 0-100
 *   const detail = scorePromptDetailed(prompt); // par dimension
 */

// ─── Types ────────────────────────────────────────────────────────────

export interface PromptScoreDetail {
  total: number;
  clarity: number;
  context: number;
  examples: number;
  constraints: number;
  role: number;
  suggestions: string[];
  grade: "A" | "B" | "C" | "D" | "F";
}

// ─── Scoring ──────────────────────────────────────────────────────────

export function scorePrompt(prompt: string): number {
  return scorePromptDetailed(prompt).total;
}

export function scorePromptDetailed(prompt: string): PromptScoreDetail {
  const suggestions: string[] = [];
  let clarity = 0;
  let context = 0;
  let examples = 0;
  let constraints = 0;
  let role = 0;

  // 1. Clarity (0-20)
  if (/TÂCHE[:\s]/i.test(prompt) || /TASK[:\s]/i.test(prompt)) clarity += 5;
  else suggestions.push("Ajoute une section 'TÂCHE:' explicite");

  if (/RÈGLES[:\s]/i.test(prompt) || /RULES[:\s]/i.test(prompt)) clarity += 5;
  else suggestions.push("Ajoute une section 'RÈGLES:' pour guider le comportement");

  if (/FORMAT[:\s]/i.test(prompt) || /OUTPUT[:\s]/i.test(prompt)) clarity += 10;
  else suggestions.push("Ajoute une section 'FORMAT:' pour structurer la sortie");

  // 2. Context (0-20)
  if (prompt.length > 500) context += 10;
  else suggestions.push("Prompt trop court — ajoute plus de contexte (>500 chars)");

  if (/CONTEXTE[:\s]/i.test(prompt) || /CONTEXT[:\s]/i.test(prompt)) context += 10;
  else suggestions.push("Ajoute une section 'CONTEXTE:' explicite");

  // 3. Examples (0-20)
  if (/Exemple/i.test(prompt) || /Example/i.test(prompt)) examples += 10;
  else suggestions.push("Ajoute des exemples (few-shot) pour améliorer la précision");

  if (/JSON/i.test(prompt)) examples += 10;
  else suggestions.push("Spécifie le format JSON attendu");

  // 4. Constraints (0-20)
  if (/CONTRAINTES[:\s]/i.test(prompt) || /CONSTRAINTS[:\s]/i.test(prompt)) constraints += 10;
  else suggestions.push("Ajoute une section 'CONTRAINTES:' pour limiter le comportement");

  if (/\d+\s*(règles?|étapes?|points?|dimensions?|critères?)/i.test(prompt)) constraints += 10;
  else suggestions.push("Spécifie un nombre explicite (ex: '5 dimensions', '3 étapes')");

  // 5. Role (0-20)
  if (/Tu es/i.test(prompt) || /You are/i.test(prompt)) role += 10;
  else suggestions.push("Définis un rôle explicite ('Tu es un expert...')");

  if (/\d+\s*(ans|years|années)\s*(d'|de )?(expérience|experience)/i.test(prompt)) role += 5;
  else suggestions.push("Ajoute l'expérience du rôle (ex: 'avec 10 ans d'expérience')");

  if (/(expert|professionnel|spécialiste|certif)/i.test(prompt)) role += 5;
  else suggestions.push("Renforce le rôle avec des credentials (expert, certifications)");

  const total = Math.min(clarity + context + examples + constraints + role, 100);

  const grade: PromptScoreDetail["grade"] =
    total >= 90 ? "A" :
    total >= 75 ? "B" :
    total >= 60 ? "C" :
    total >= 40 ? "D" : "F";

  return {
    total,
    clarity,
    context,
    examples,
    constraints,
    role,
    suggestions: suggestions.length > 0 ? suggestions : ["Prompt excellent — aucune amélioration nécessaire"],
    grade,
  };
}

// ─── Scoring batch ────────────────────────────────────────────────────

export function scorePromptsBatch(prompts: { name: string; prompt: string }[]): {
  name: string;
  score: number;
  grade: string;
  suggestions: string[];
}[] {
  return prompts.map(({ name, prompt }) => {
    const detail = scorePromptDetailed(prompt);
    return {
      name,
      score: detail.total,
      grade: detail.grade,
      suggestions: detail.suggestions,
    };
  });
}

// ─── Grade emoji ──────────────────────────────────────────────────────

export function gradeEmoji(grade: string): string {
  switch (grade) {
    case "A": return "🟢";
    case "B": return "🟩";
    case "C": return "🟡";
    case "D": return "🟠";
    case "F": return "🔴";
    default: return "⚪";
  }
}
