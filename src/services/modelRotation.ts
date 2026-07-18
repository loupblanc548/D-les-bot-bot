/**
 * modelRotation.ts — Rotation automatique de modèles IA gratuits
 *
 * Quand un modèle OpenRouter gratuit est rate-limited (429) ou en erreur,
 * on bascule automatiquement vers le prochain modèle gratuit disponible.
 * Si tous les modèles OpenRouter échouent, on bascule sur Groq.
 *
 * Ordre de priorité :
 *  1. Modèles OpenRouter gratuits (avec function calling)
 *  2. Groq (llama-3.3-70b-versatile, gratuit, function calling)
 *  3. Gemini (fallback simple, pas de function calling)
 */

import logger from "../utils/logger.js";

// ─── Modèles OpenRouter gratuits supportant le function calling ─────────────
// Liste étendue — maximise l'utilisation de la clé OpenRouter
// Ordre: du plus puissant au plus léger
const FREE_MODELS_OPENROUTER = [
  // ─── Modèles gratuits avec tools/function calling ───
  // Ordre: meilleur en français d'abord
  "deepseek/deepseek-v3:free", // V3 — excellent en français, tools ✅
  "tencent/hy3:free", // 295B MoE, 262K context, tools ✅
  "deepseek/deepseek-r1:free", // Reasoning model, tools ✅
  "qwen/qwen-2.5-72b-instruct:free", // 72B, tools ✅
  "meta-llama/llama-3.3-70b-instruct:free", // 70B, tools ✅
  "nvidia/nemotron-3-ultra-550b-a55b:free", // 550B MoE, tools ✅
  "google/gemini-2.0-flash-exp:free", // Gemini 2.0, tools ✅
  "google/gemini-2.0-flash-lite-preview-02-05:free", // Gemini Flash Lite, tools ✅
  "poolside/laguna-xs-2.1:free", // 33B coding agent, tools ✅
  "cohere/north-mini-code:free", // 30B MoE coding, tools ✅
  "mistralai/mistral-7b-instruct:free", // 7B, tools ✅
  "meta-llama/llama-3.1-8b-instruct:free", // 8B, tools ✅
  "google/gemma-2-9b-it:free", // 9B, tools ✅
  "meta-llama/llama-3.2-3b-instruct:free", // 3B, lightweight fallback
];

// ─── Modèles ultra-bon-marché (backup si tous les gratuits sont épuisés) ─────
// Prix < $0.000001/token — quasi gratuit
const CHEAP_FALLBACK_MODELS = [
  "meta-llama/llama-3.1-8b-instruct", // $0.05/$0.08 per 1M tokens
  "qwen/qwen-2.5-7b-instruct", // $0.04/$0.10 per 1M tokens
  "mistralai/mistral-nemo", // $0.02/$0.04 per 1M tokens
  "meta-llama/llama-3.2-3b-instruct", // $0.05/$0.33 per 1M tokens
];

// ─── Routeur auto OpenRouter (toujours disponible) ───────────────────────────
const AUTO_ROUTER_MODEL = "openrouter/auto";

// ─── État de rotation ────────────────────────────────────────────────────────

interface ModelHealth {
  name: string;
  failures: number;
  lastFailure: number;
  rateLimitedUntil: number; // timestamp until which we skip this model
}

const modelHealth = new Map<string, ModelHealth>();

// Cooldown après un 429: 5 minutes par défaut
const RATE_LIMIT_COOLDOWN_MS = 5 * 60 * 1000;
// Cooldown après une erreur générique: 1 minute
const ERROR_COOLDOWN_MS = 60 * 1000;
// Reset du compteur d'échecs après 30 minutes sans erreur
const HEALTH_RESET_MS = 30 * 60 * 1000;
// Max échecs avant de blacklister un modèle pour plus longtemps
const MAX_FAILURES_BEFORE_BLACKLIST = 3;

/**
 * Marque un modèle comme ayant échoué (429 ou autre erreur)
 */
export function markModelFailure(modelName: string, isRateLimit: boolean): void {
  const now = Date.now();
  const health = modelHealth.get(modelName) || {
    name: modelName,
    failures: 0,
    lastFailure: 0,
    rateLimitedUntil: 0,
  };

  // Reset si pas d'échec depuis longtemps
  if (now - health.lastFailure > HEALTH_RESET_MS) {
    health.failures = 0;
  }

  health.failures++;
  health.lastFailure = now;

  if (isRateLimit) {
    health.rateLimitedUntil = now + RATE_LIMIT_COOLDOWN_MS;
    logger.warn(
      `[ModelRotation] ⏳ ${modelName} rate-limited, cooldown ${RATE_LIMIT_COOLDOWN_MS / 1000}s (failures: ${health.failures})`,
    );
  } else if (health.failures >= MAX_FAILURES_BEFORE_BLACKLIST) {
    health.rateLimitedUntil = now + RATE_LIMIT_COOLDOWN_MS * 2;
    logger.warn(
      `[ModelRotation] 🚫 ${modelName} blacklisted after ${health.failures} failures, cooldown ${(RATE_LIMIT_COOLDOWN_MS * 2) / 1000}s`,
    );
  } else {
    health.rateLimitedUntil = now + ERROR_COOLDOWN_MS;
    logger.warn(
      `[ModelRotation] ⚠️ ${modelName} error, cooldown ${ERROR_COOLDOWN_MS / 1000}s (failures: ${health.failures})`,
    );
  }

  modelHealth.set(modelName, health);
}

/**
 * Marque un modèle comme fonctionnel (reset léger)
 */
export function markModelSuccess(modelName: string): void {
  const health = modelHealth.get(modelName);
  if (health && health.failures > 0) {
    // Réduit le compteur d'échecs au succès
    health.failures = Math.max(0, health.failures - 1);
    if (health.failures === 0) {
      health.rateLimitedUntil = 0;
    }
    modelHealth.set(modelName, health);
  }
}

/**
 * Retourne la liste des modèles OpenRouter gratuits disponibles
 * (non en cooldown)
 */
export function getAvailableFreeModels(): string[] {
  const now = Date.now();
  return FREE_MODELS_OPENROUTER.filter((model) => {
    const health = modelHealth.get(model);
    if (!health) return true;
    return now >= health.rateLimitedUntil;
  });
}

/**
 * Retourne la liste des modèles bon marché disponibles (backup)
 */
export function getAvailableCheapModels(): string[] {
  const now = Date.now();
  return CHEAP_FALLBACK_MODELS.filter((model) => {
    const health = modelHealth.get(model);
    if (!health) return true;
    return now >= health.rateLimitedUntil;
  });
}

/**
 * Retourne TOUS les modèles disponibles, par ordre de priorité:
 * 1. Modèles gratuits (du plus puissant au plus léger)
 * 2. Modèles bon marché (backup quasi gratuit)
 * 3. Routeur auto OpenRouter (toujours disponible, coûte variable)
 */
export function getAllAvailableModels(): string[] {
  const free = getAvailableFreeModels();
  if (free.length > 0) return free;

  // Tous les gratuits épuisés → ajouter les bon marché
  const cheap = getAvailableCheapModels();
  if (cheap.length > 0) {
    logger.warn(
      `[ModelRotation] ⚠️ Tous les modèles gratuits sont en cooldown — utilisation des modèles bon marché`,
    );
    return cheap;
  }

  // Dernier recours: routeur auto (coût variable mais toujours dispo)
  logger.warn(`[ModelRotation] 🔄 Tous les modèles en cooldown — fallback routeur auto OpenRouter`);
  return [AUTO_ROUTER_MODEL];
}

/**
 * Retourne le prochain modèle OpenRouter disponible.
 * Si le modèle préféré est disponible, le retourne.
 * Sinon, retourne le prochain disponible dans la liste étendue.
 */
export function getNextAvailableModel(preferred?: string): string | null {
  const available = getAllAvailableModels();
  if (available.length === 0) return null;

  // Si on a un modèle préféré et qu'il est disponible, l'utiliser
  if (preferred && available.includes(preferred)) {
    return preferred;
  }

  // Sinon, prendre le premier disponible
  return available[0];
}

/**
 * Retourne le statut de tous les modèles (pour debug/logs)
 */
export function getModelRotationStatus(): string {
  const now = Date.now();
  const lines: string[] = [];

  lines.push("── Modèles gratuits ──");
  for (const model of FREE_MODELS_OPENROUTER) {
    const health = modelHealth.get(model);
    if (!health || health.failures === 0) {
      lines.push(`  ✅ ${model}`);
    } else if (now < health.rateLimitedUntil) {
      const remaining = Math.ceil((health.rateLimitedUntil - now) / 1000);
      lines.push(`  ⏳ ${model} (cooldown ${remaining}s, ${health.failures} failures)`);
    } else {
      lines.push(`  ⚠️ ${model} (${health.failures} failures, ready)`);
    }
  }

  lines.push("── Modèles bon marché (backup) ──");
  for (const model of CHEAP_FALLBACK_MODELS) {
    const health = modelHealth.get(model);
    if (!health || health.failures === 0) {
      lines.push(`  ✅ ${model}`);
    } else if (now < health.rateLimitedUntil) {
      const remaining = Math.ceil((health.rateLimitedUntil - now) / 1000);
      lines.push(`  ⏳ ${model} (cooldown ${remaining}s)`);
    } else {
      lines.push(`  ⚠️ ${model} (ready)`);
    }
  }

  lines.push(`── Routeur auto ──`);
  lines.push(`  ✅ ${AUTO_ROUTER_MODEL} (toujours disponible)`);

  return lines.join("\n");
}
