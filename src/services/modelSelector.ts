/**
 * modelSelector.ts — Catalogue de modèles LLM et helpers de sélection / coût.
 *
 * Source unique des IDs/prix/capacités modèles pour le projet.
 * Les prix `prompt` / `completion` sont exprimés en USD par million de tokens,
 * unité standard OpenRouter (multiplier par 1_000_000 avant d'appliquer
 * `estimateCost`).
 */

export interface ModelPricing {
  /** USD par million de tokens d'entrée. */
  prompt: number;
  /** USD par million de tokens de sortie. */
  completion: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  contextLength: number;
  pricing: ModelPricing;
  capabilities: string[];
}

export type ModelTask = "moderation" | "chat" | "analysis" | "code";

// ─── Catalogue des modèles disponibles ───────────────────────────────
// Prix indicatifs OpenRouter (juin 2025). A mettre à jour périodiquement.
export const AVAILABLE_MODELS: ModelInfo[] = [
  {
    id: "gpt-4o-mini",
    name: "OpenAI GPT-4o mini",
    contextLength: 128_000,
    pricing: { prompt: 0.15, completion: 0.6 },
    capabilities: ["chat", "moderation", "json", "function-calling", "fast"],
  },
  {
    id: "gpt-4o",
    name: "OpenAI GPT-4o",
    contextLength: 128_000,
    pricing: { prompt: 2.5, completion: 10 },
    capabilities: ["chat", "analysis", "code", "vision", "json", "function-calling"],
  },
  {
    id: "claude-3.5-sonnet",
    name: "Anthropic Claude 3.5 Sonnet",
    contextLength: 200_000,
    pricing: { prompt: 3, completion: 15 },
    capabilities: ["chat", "analysis", "code", "long-context", "json"],
  },
  {
    id: "llama-3.1-70b",
    name: "Meta Llama 3.1 70B Instruct",
    contextLength: 131_072,
    pricing: { prompt: 0.59, completion: 0.79 },
    capabilities: ["chat", "analysis", "open-source", "json"],
  },
  {
    id: "gemini-flash-1.5",
    name: "Google Gemini 1.5 Flash",
    contextLength: 1_000_000,
    pricing: { prompt: 0.075, completion: 0.3 },
    capabilities: ["chat", "fast", "long-context", "multimodal", "json"],
  },
];

// ─── Lookups indexés (construits une seule fois au chargement du module) ─
const MODELS_BY_ID: ReadonlyMap<string, ModelInfo> = new Map(
  AVAILABLE_MODELS.map((m) => [m.id, m]),
);

const FALLBACK_MODEL: ModelInfo = AVAILABLE_MODELS[0];

const TASK_TO_MODEL_ID: Record<ModelTask, string> = {
  moderation: "gpt-4o-mini", // pas cher, rapide, suffisant pour classifier
  chat: "claude-3.5-sonnet", // qualité conversationnelle et faible hallucination
  analysis: "gpt-4o", // raisonnement fort sur de gros volumes
  code: "claude-3.5-sonnet", // très bon sur les benchmarks code
};

// ─── Gel profond du catalogue ───────────────────────────────────────
// Bloque toute mutation runtime du catalogue (pricing, capabilities, etc.).
// Un caller malveillant ou buggé qui ferait `selectModel("chat").pricing.prompt = 0`
// lancerait une TypeError en mode strict, au lieu de corrompre silencieusement
// les appels suivants.
function deepFreezeCatalog(models: ModelInfo[]): void {
  for (const m of models) {
    Object.freeze(m.pricing);
    Object.freeze(m.capabilities);
    Object.freeze(m);
  }
}
deepFreezeCatalog(AVAILABLE_MODELS);

/**
 * Sélectionne le modèle recommandé pour un type de tâche donné.
 * Si l'ID résolu est absent du catalogue (modifie manuellement), retourne
 * le premier modèle de `AVAILABLE_MODELS` comme filet de sécurité.
 */
export function selectModel(task: ModelTask): ModelInfo {
  const id = TASK_TO_MODEL_ID[task];
  return MODELS_BY_ID.get(id) ?? FALLBACK_MODEL;
}

/**
 * Récupère un modèle par son identifiant.
 * Renvoie `null` si l'ID n'existe pas dans `AVAILABLE_MODELS`.
 */
export function getModelById(id: string): ModelInfo | null {
  return MODELS_BY_ID.get(id) ?? null;
}

/**
 * Retourne la liste complète des modèles disponibles (copie superficielle
 * pour éviter que le caller mute le tableau exporté).
 */
export function listModels(): ModelInfo[] {
  return AVAILABLE_MODELS.map((m) => ({
    ...m,
    pricing: { ...m.pricing },
    capabilities: [...m.capabilities],
  }));
}

/**
 * Estime le coût en USD d'un appel pour un couple (input, output) de tokens.
 * Les prix sont exprimés par million de tokens, on divise par 1_000_000.
 *
 * Les entrées négatives ou non finies sont clampées à 0 pour eviter un
 * retour `NaN` qui casserait les aggregations de couts cote appelant.
 */
export function estimateCost(model: ModelInfo, inputTokens: number, outputTokens: number): number {
  const safeInput = Math.max(0, Number.isFinite(inputTokens) ? inputTokens : 0);
  const safeOutput = Math.max(0, Number.isFinite(outputTokens) ? outputTokens : 0);
  const promptCost = (safeInput / 1_000_000) * model.pricing.prompt;
  const completionCost = (safeOutput / 1_000_000) * model.pricing.completion;
  return promptCost + completionCost;
}
