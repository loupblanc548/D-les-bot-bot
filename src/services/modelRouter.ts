/**
 * modelRouter.ts — Routeur multi-modèles intelligent
 *
 * Classifie la requête utilisateur et sélectionne le modèle LLM optimal:
 * - Simple (salut, merci, question courte) → modèle gratuit/rapide
 * - Code/technique → modèle fort en code
 * - Analyse/raisonnement → modèle puissant
 * - Vision/image → Gemini
 * - Défaut → modèle configuré
 */

import { config } from "../config.js";
import logger from "../utils/logger.js";

// ─── Model presets ───────────────────────────────────────────────────────────

interface ModelPreset {
  id: string;
  label: string;
  maxTokens: number;
  temperature: number;
}

const MODELS: Record<string, ModelPreset> = {
  fast: {
    id: "meta-llama/llama-3.2-3b-instruct:free",
    label: "Llama 3.2 3B (free, fast)",
    maxTokens: 800,
    temperature: 0.5,
  },
  balanced: {
    id: config.openRouterModel,
    label: "Default configured model",
    maxTokens: 1000,
    temperature: 0.7,
  },
  powerful: {
    id: "anthropic/claude-3.5-sonnet",
    label: "Claude 3.5 Sonnet (powerful)",
    maxTokens: 2000,
    temperature: 0.7,
  },
  code: {
    id: "deepseek/deepseek-coder",
    label: "DeepSeek Coder (code specialist)",
    maxTokens: 2000,
    temperature: 0.3,
  },
  vision: {
    id: "google/gemini-2.0-flash-exp:free",
    label: "Gemini 2.0 Flash (vision)",
    maxTokens: 1500,
    temperature: 0.5,
  },
};

// ─── Classification patterns ─────────────────────────────────────────────────

type QueryCategory = "fast" | "balanced" | "powerful" | "code" | "vision";

const CODE_PATTERNS = [
  /\b(code|fonction|function|class|bug|error|stack trace|compile|typescript|javascript|python|java|c\+\+|rust|go\b|sql|regex|api|endpoint|algorithm|debug|refactor)\b/i,
  /\b(écris|crée|génère|write|create|generate)\b.*\b(code|script|function|classe|component|module)\b/i,
  /```/,
];

const VISION_PATTERNS = [
  /\b(image|photo|picture|screenshot|vision|analyse.*image|décris.*image|ocr|texte.*image)\b/i,
  /\[Image jointe:/,
];

const COMPLEX_PATTERNS = [
  /\b(analyse complète|audit|rapport détaillé|comprehensive|deep dive|étude approfondie|investigation|thorough)\b/i,
  /\b(compare|comparison|contraste|différence entre|avantages.*inconvénients|pros.*cons)\b/i,
  /\b(plan|stratégie|strategy|architecture|design pattern|system design)\b/i,
  /\b(traduis|translate)\b.*\b(long|complet|document|article)\b/i,
];

const SIMPLE_PATTERNS = [
  /^(salut|bonjour|hello|hi|hey|coucou|merci|thanks|ok|d'accord|bye|au revoir|good night|bonne nuit)\b/i,
  /^(oui|non|yes|no|peut-être|maybe|sure|bien sûr)\b/i,
  /^.{1,30}\?$/, // Very short questions
];

// ─── Classifier ──────────────────────────────────────────────────────────────

export function classifyQuery(userMessage: string): QueryCategory {
  // Vision takes priority (image context)
  if (VISION_PATTERNS.some((p) => p.test(userMessage))) return "vision";

  // Code detection
  if (CODE_PATTERNS.some((p) => p.test(userMessage))) return "code";

  // Complex tasks
  if (COMPLEX_PATTERNS.some((p) => p.test(userMessage))) return "powerful";

  // Simple greetings / short questions
  if (SIMPLE_PATTERNS.some((p) => p.test(userMessage))) return "fast";

  // Default
  return "balanced";
}

// ─── Router ──────────────────────────────────────────────────────────────────

export interface RoutedModel {
  model: string;
  maxTokens: number;
  temperature: number;
  category: QueryCategory;
  label: string;
}

export function routeModel(userMessage: string): RoutedModel {
  const category = classifyQuery(userMessage);
  const preset = MODELS[category] ?? MODELS.balanced;

  logger.info(`[ModelRouter] Category: ${category} → Model: ${preset.label}`);

  return {
    model: preset.id,
    maxTokens: preset.maxTokens,
    temperature: preset.temperature,
    category,
    label: preset.label,
  };
}

/**
 * Override model for specific contexts (e.g. agent loop uses its own model).
 * Returns null if no override needed.
 */
export function getAgentLoopModel(userMessage: string): string | null {
  const routed = routeModel(userMessage);
  // Only override for code and powerful categories
  if (routed.category === "code" || routed.category === "powerful") {
    return routed.model;
  }
  return null;
}
