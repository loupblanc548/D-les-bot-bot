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

// ─── 10 Best Practices Validator ──────────────────────────────────────

export interface BestPracticeCheck {
  id: number;
  name: string;
  passed: boolean;
  detail: string;
}

export interface BestPracticesReport {
  checks: BestPracticeCheck[];
  passedCount: number;
  totalCount: number;
  score: number;        // 0-100
  grade: "A" | "B" | "C" | "D" | "F";
  missing: string[];
  summary: string;
}

export function validateBestPractices(prompt: string): BestPracticesReport {
  const checks: BestPracticeCheck[] = [
    {
      id: 1,
      name: "Spécifique et détaillé",
      passed: prompt.length > 200,
      detail: prompt.length > 200 ? `Prompt de ${prompt.length} chars` : `Trop court (${prompt.length} chars), manque de détails`,
    },
    {
      id: 2,
      name: "Contexte complet",
      passed: /CONTEXTE[:\s]|CONTEXT[:\s]/i.test(prompt) || prompt.length > 500,
      detail: /CONTEXTE[:\s]|CONTEXT[:\s]/i.test(prompt) ? "Section CONTEXTE présente" : prompt.length > 500 ? "Contexte implicite (longueur suffisante)" : "Manque de contexte",
    },
    {
      id: 3,
      name: "Format structuré (JSON)",
      passed: /JSON/i.test(prompt) && /[{}[\]]/.test(prompt),
      detail: /JSON/i.test(prompt) && /[{}[\]]/.test(prompt) ? "Format JSON spécifié avec structure" : /JSON/i.test(prompt) ? "JSON mentionné mais sans structure" : "Aucun format structuré spécifié",
    },
    {
      id: 4,
      name: "Exemples fournis",
      passed: /Exemple/i.test(prompt) || /Example/i.test(prompt),
      detail: /Exemple/i.test(prompt) || /Example/i.test(prompt) ? "Exemples few-shot présents" : "Aucun exemple fourni (few-shot manquant)",
    },
    {
      id: 5,
      name: "Rôle clairement défini",
      passed: /Tu es/i.test(prompt) || /You are/i.test(prompt),
      detail: /Tu es/i.test(prompt) || /You are/i.test(prompt) ? "Rôle explicite défini" : "Aucun rôle défini ('Tu es...')",
    },
    {
      id: 6,
      name: "Contraintes spécifiées",
      passed: /CONTRAINTES[:\s]|RÈGLES[:\s]|CONSTRAINTS[:\s]|RULES[:\s]/i.test(prompt),
      detail: /CONTRAINTES[:\s]|RÈGLES[:\s]|CONSTRAINTS[:\s]|RULES[:\s]/i.test(prompt) ? "Contraintes/Règles présentes" : "Aucune contrainte explicite",
    },
    {
      id: 7,
      name: "Divisé en étapes",
      passed: /\d+\.\s|étape|step|Réfléchis étape/i.test(prompt),
      detail: /\d+\.\s|étape|step|Réfléchis étape/i.test(prompt) ? "Étapes numérotées ou chain-of-thought" : "Pas de division en étapes",
    },
    {
      id: 8,
      name: "Testable et itérable",
      passed: /Exemple/i.test(prompt) && /JSON/i.test(prompt),
      detail: /Exemple/i.test(prompt) && /JSON/i.test(prompt) ? "Exemples + JSON = testable" : "Manque exemples ou JSON pour tester",
    },
    {
      id: 9,
      name: "Délimiteurs utilisés",
      passed: /---|###|```|\|/.test(prompt),
      detail: /---|###|```|\|/.test(prompt) ? "Délimiteurs structurés présents" : "Aucun délimiteur (---, ###, ```)",
    },
    {
      id: 10,
      name: "Concis mais complet",
      passed: prompt.length > 200 && prompt.length < 5000,
      detail: prompt.length > 200 && prompt.length < 5000 ? `Longueur optimale (${prompt.length} chars)` : prompt.length <= 200 ? "Trop concis" : "Trop long (>5000 chars)",
    },
  ];

  const passedCount = checks.filter((c) => c.passed).length;
  const totalCount = checks.length;
  const score = Math.round((passedCount / totalCount) * 100);
  const grade: BestPracticesReport["grade"] =
    score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";
  const missing = checks.filter((c) => !c.passed).map((c) => `#${c.id} ${c.name}`);

  const summary = [
    `${passedCount}/${totalCount} best practices respectées`,
    `Score: ${score}/100 (Grade ${grade})`,
    missing.length > 0 ? `Manquantes: ${missing.join(", ")}` : "Toutes les best practices sont respectées!",
  ].join("\n");

  return { checks, passedCount, totalCount, score, grade, missing, summary };
}

// ─── 10 Anti-Patterns Detector ───────────────────────────────────────

export interface AntiPatternCheck {
  id: number;
  name: string;
  detected: boolean;
  severity: "critical" | "warning" | "minor";
  detail: string;
  fix: string;
}

export interface AntiPatternReport {
  checks: AntiPatternCheck[];
  detectedCount: number;
  criticalCount: number;
  warningCount: number;
  clean: boolean;
  score: number;        // 100 - penalties
  summary: string;
}

export function detectAntiPatterns(prompt: string): AntiPatternReport {
  const checks: AntiPatternCheck[] = [
    {
      id: 1,
      name: "Vague et général",
      detected: prompt.length < 100 || /^(analyse|check|review|help|do)/i.test(prompt.trim()) && prompt.length < 150,
      severity: "critical",
      detail: prompt.length < 100 ? `Prompt trop court (${prompt.length} chars)` : "Instructions vagues sans détails",
      fix: "Sois spécifique: ajoute TÂCHE, RÈGLES, et FORMAT avec des détails concrets",
    },
    {
      id: 2,
      name: "Pas de contexte",
      detected: !/CONTEXTE|CONTEXT|serveur|discord|gaming|utilisateur|message/i.test(prompt) && prompt.length < 500,
      severity: "warning",
      detail: "Aucun contexte fourni sur l'environnement ou la situation",
      fix: "Ajoute une section CONTEXTE: décrivant l'environnement et la situation",
    },
    {
      id: 3,
      name: "Format libre confus",
      detected: !/JSON|format|markdown|structure|réponds en/i.test(prompt),
      severity: "critical",
      detail: "Aucun format de sortie spécifié",
      fix: "Spécifie un format structuré: 'Réponds en JSON: {champ1, champ2}'",
    },
    {
      id: 4,
      name: "Pas d'exemples",
      detected: !/Exemple|Example/i.test(prompt),
      severity: "warning",
      detail: "Aucun exemple few-shot fourni",
      fix: "Ajoute 3-5 exemples concrets (input → output attendu)",
    },
    {
      id: 5,
      name: "Pas de rôle défini",
      detected: !/Tu es|You are/i.test(prompt),
      severity: "critical",
      detail: "Aucun rôle ou persona défini pour l'IA",
      fix: "Définis un rôle: 'Tu es un expert en... avec X ans d'expérience'",
    },
    {
      id: 6,
      name: "Pas de contraintes",
      detected: !/CONTRAINTES|RÈGLES|CONSTRAINTS|RULES|ne pas|interdit|évite/i.test(prompt),
      severity: "warning",
      detail: "Aucune contrainte ou règle explicite",
      fix: "Ajoute CONTRAINTES: ou RÈGLES: pour limiter le comportement de l'IA",
    },
    {
      id: 7,
      name: "Trop de tâches à la fois",
      detected: (prompt.match(/\d+\.\s/g) || []).length > 10,
      severity: "warning",
      detail: `${(prompt.match(/\d+\.\s/g) || []).length} tâches numérotées — risque de surcharge`,
      fix: "Divise en étapes séquentielles (max 5-7) ou utilise un pipeline multi-étapes",
    },
    {
      id: 8,
      name: "Pas de test",
      detected: !/Exemple|Example|test|cas/i.test(prompt),
      severity: "minor",
      detail: "Pas de cas de test ou d'exemples pour valider",
      fix: "Ajoute des exemples avec input/output attendu pour tester le prompt",
    },
    {
      id: 9,
      name: "Prompt trop long/court",
      detected: prompt.length < 50 || prompt.length > 6000,
      severity: prompt.length < 50 ? "critical" : "warning",
      detail: prompt.length < 50 ? `Trop court (${prompt.length} chars)` : `Trop long (${prompt.length} chars)`,
      fix: prompt.length < 50 ? "Ajoute du contexte et des détails (viser 200-5000 chars)" : "Divise en sous-prompts ou simplifie (viser 200-5000 chars)",
    },
    {
      id: 10,
      name: "Instructions contradictoires",
      detected: /ne pas.*mais|sauf si.*toujours|jamais.*sauf|interdit.*mais/i.test(prompt),
      severity: "critical",
      detail: "Détection de patterns contradictoires dans les instructions",
      fix: "Clarifie les priorités: utilise 'RÈGLE 1 (priorité haute)' et 'RÈGLE 2 (sauf si...)'",
    },
  ];

  const detectedCount = checks.filter((c) => c.detected).length;
  const criticalCount = checks.filter((c) => c.detected && c.severity === "critical").length;
  const warningCount = checks.filter((c) => c.detected && c.severity === "warning").length;
  const penalty = criticalCount * 15 + warningCount * 7 + checks.filter((c) => c.detected && c.severity === "minor").length * 3;
  const score = Math.max(0, 100 - penalty);
  const clean = detectedCount === 0;

  const summary = clean
    ? "Aucun anti-pattern détecté — prompt propre!"
    : [
        `${detectedCount} anti-patterns détectés (${criticalCount} critiques, ${warningCount} warnings)`,
        `Score: ${score}/100`,
        ...checks.filter((c) => c.detected && c.severity === "critical").map((c) => `🔴 #${c.id} ${c.name}: ${c.fix}`),
      ].join("\n");

  return { checks, detectedCount, criticalCount, warningCount, clean, score, summary };
}

