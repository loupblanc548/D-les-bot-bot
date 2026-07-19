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
  "meta-llama/llama-3.2-3b-instruct:free", // 3B, tools ✅ (min size for reliable tool calls)
  // ─── Additional free models (maximise coverage) ───
  "qwen/qwen-2.5-coder-32b-instruct:free", // 32B coder, tools ✅
  "qwen/qwen-2.5-7b-instruct:free", // 7B, tools ✅
  "qwen/qwq-32b:free", // 32B reasoning, tools ✅
  "mistralai/mistral-8b-instruct:free", // 8B, tools ✅ (new)
  "mistralai/mistral-small-3.1-24b-instruct:free", // 24B, tools ✅
  "meta-llama/llama-3.1-405b-instruct:free", // 405B (when available), tools ✅
  // llama-3.2-1b removed — does NOT support function calling (too small, 1B params)
  "meta-llama/llama-3.2-11b-vision-instruct:free", // 11B vision, tools ✅
  "google/gemini-flash-1.5-8b", // 8B Gemini Flash, tools ✅
  "microsoft/phi-3-medium-4k-instruct:free", // 14B, tools ✅
  "microsoft/phi-3.5-mini-128k-instruct:free", // 3.8B, tools ✅
  "thudm/glm-4-9b-chat:free", // 9B, tools ✅
  "01-ai/yi-1.5-9b-chat:free", // 9B, tools ✅
  "01-ai/yi-1.5-34b-chat:free", // 34B, tools ✅
  "huggingfaceh4/zephyr-7b-beta:free", // 7B, tools ✅
  "openchat/openchat-3.5-1210:free", // 7B, tools ✅
  "teknium/openhermes-2.5-mistral-7b:free", // 7B, tools ✅
  "sao10k/l3-euryale-70b:free", // 70B roleplay, tools ✅
  "sao10k/l3.1-euryale-70b:free", // 70B v3.1, tools ✅
  "cognitivecomputations/dolphin-mixtral-8x7b:free", // 8x7B, tools ✅
  "gryphe/corvus-72b:free", // 72B, tools ✅
  "anthracite-org/magmell-72b:free", // 72B, tools ✅
  "neversleep/llama-3-lumimaid-70b:free", // 70B, tools ✅
  "thedrummer/rocinante-12b:free", // 12B, tools ✅
  "anthracite-org/magmell-8b:free", // 8B, tools ✅
  "raifle/sorcererlm-8x22b:free", // 8x22B, tools ✅
  "sophosympatheia/rogue-rose-103b-v0.2:free", // 103B, tools ✅
  "sao10k/l3.1-euryale-70b:free", // 70B v3.1, tools ✅
  "perplexity/llama-3.1-sonar-large-128k-online:free", // 128K online, tools ✅
  "perplexity/llama-3.1-sonar-small-128k-online:free", // 128K online, tools ✅
  "liquid/lfm-40b:free", // 40B MoE, tools ✅
  "liquid/lfm-7b:free", // 7B MoE, tools ✅
];

// ─── Modèles ultra-bon-marché (backup si tous les gratuits sont épuisés) ─────
// Prix < $0.000001/token — quasi gratuit
const CHEAP_FALLBACK_MODELS = [
  "meta-llama/llama-3.1-8b-instruct", // $0.05/$0.08 per 1M tokens
  "qwen/qwen-2.5-7b-instruct", // $0.04/$0.10 per 1M tokens
  "mistralai/mistral-nemo", // $0.02/$0.04 per 1M tokens
  "meta-llama/llama-3.2-3b-instruct", // $0.05/$0.33 per 1M tokens
];

// ─── Modèles gratuits SANS function calling — chat texte simple uniquement ────
// Ne jamais utiliser pendant une boucle d'outils active
const NO_TOOLS_MODELS = [
  "meta-llama/llama-3.2-1b-instruct:free", // 1B — too small for tool calls
];

// ─── Routeur auto OpenRouter (toujours disponible) ───────────────────────────
const AUTO_ROUTER_MODEL = "openrouter/auto";

// ─── État de rotation ────────────────────────────────────────────────────────

interface ModelHealth {
  name: string;
  failures: number;
  lastFailure: number;
  rateLimitedUntil: number; // timestamp until which we skip this model
  // ─── Circuit breaker state ───
  circuitState: "closed" | "open" | "half-open";
  circuitOpenedAt: number;
  halfOpenAttempts: number;
  // ─── Latency tracking (sliding window) ───
  latencies: number[]; // last N call durations in ms
  emptyResponses: number; // count of empty/truncated responses
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

// ─── Circuit breaker configuration ───────────────────────────────────────────
const LATENCY_WINDOW_SIZE = 10; // track last 10 calls for moving average
const LATENCY_THRESHOLD_MS = 15_000; // 15s average → open circuit
const CIRCUIT_OPEN_INITIAL_MS = 60_000; // initial cooldown when circuit opens
const CIRCUIT_HALF_OPEN_MAX_ATTEMPTS = 1; // single test call in half-open
const CIRCUIT_OPEN_MAX_BACKOFF_MS = 30 * 60 * 1000; // max backoff: 30 minutes
const EMPTY_RESPONSE_THRESHOLD = 5; // 5 empty responses → open circuit

function getOrCreateHealth(modelName: string): ModelHealth {
  let health = modelHealth.get(modelName);
  if (!health) {
    health = {
      name: modelName,
      failures: 0,
      lastFailure: 0,
      rateLimitedUntil: 0,
      circuitState: "closed",
      circuitOpenedAt: 0,
      halfOpenAttempts: 0,
      latencies: [],
      emptyResponses: 0,
    };
    modelHealth.set(modelName, health);
  }
  return health;
}

function getAverageLatency(modelName: string): number {
  const health = modelHealth.get(modelName);
  if (!health || health.latencies.length === 0) return 0;
  return health.latencies.reduce((a, b) => a + b, 0) / health.latencies.length;
}

function openCircuit(modelName: string, reason: string): void {
  const health = getOrCreateHealth(modelName);
  const wasState = health.circuitState;
  health.circuitState = "open";
  health.circuitOpenedAt = Date.now();

  // Exponential backoff: double the cooldown each time (capped)
  const failureCount = health.failures;
  const backoffMs = Math.min(
    CIRCUIT_OPEN_INITIAL_MS *
      Math.pow(2, Math.max(0, failureCount - MAX_FAILURES_BEFORE_BLACKLIST)),
    CIRCUIT_OPEN_MAX_BACKOFF_MS,
  );
  health.rateLimitedUntil = Date.now() + backoffMs;

  logger.warn(
    `[ModelRotation] 🔴 Circuit OPEN for ${modelName} (${wasState} → open). Reason: ${reason}. Backoff: ${backoffMs / 1000}s. Failures: ${health.failures}`,
  );
}

function halfOpenCircuit(modelName: string): void {
  const health = getOrCreateHealth(modelName);
  const wasState = health.circuitState;
  health.circuitState = "half-open";
  health.halfOpenAttempts = 0;
  health.rateLimitedUntil = 0; // allow test call
  logger.info(
    `[ModelRotation] 🟡 Circuit HALF-OPEN for ${modelName} (${wasState} → half-open). Test call allowed.`,
  );
}

function closeCircuit(modelName: string): void {
  const health = getOrCreateHealth(modelName);
  const wasState = health.circuitState;
  health.circuitState = "closed";
  health.failures = 0;
  health.rateLimitedUntil = 0;
  health.halfOpenAttempts = 0;
  health.emptyResponses = 0;
  logger.info(
    `[ModelRotation] 🟢 Circuit CLOSED for ${modelName} (${wasState} → closed). Normal operation resumed.`,
  );
}

/**
 * Check if a model's circuit breaker allows a call.
 * Returns true if the model can be used (closed or half-open with attempts remaining).
 */
function canUseModel(modelName: string): boolean {
  const health = modelHealth.get(modelName);
  if (!health) return true;

  const now = Date.now();

  switch (health.circuitState) {
    case "closed":
      return now >= health.rateLimitedUntil;

    case "open": {
      // Check if enough time has passed to transition to half-open
      if (now >= health.rateLimitedUntil) {
        halfOpenCircuit(modelName);
        return true; // allow the test call
      }
      return false;
    }

    case "half-open":
      // Only allow limited test calls
      return health.halfOpenAttempts < CIRCUIT_HALF_OPEN_MAX_ATTEMPTS;

    default:
      return true;
  }
}

/**
 * Marque un modèle comme ayant échoué (429 ou autre erreur)
 */
export function markModelFailure(modelName: string, isRateLimit: boolean): void {
  const now = Date.now();
  const health = getOrCreateHealth(modelName);

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
    // Open circuit on repeated failures
    openCircuit(modelName, `${health.failures} consecutive failures`);
  } else {
    health.rateLimitedUntil = now + ERROR_COOLDOWN_MS;
    logger.warn(
      `[ModelRotation] ⚠️ ${modelName} error, cooldown ${ERROR_COOLDOWN_MS / 1000}s (failures: ${health.failures})`,
    );
  }

  // If in half-open and failed, go back to open
  if (health.circuitState === "half-open") {
    openCircuit(modelName, "half-open test call failed");
  }

  modelHealth.set(modelName, health);
}

/**
 * Marque un modèle comme fonctionnel (reset léger)
 */
export function markModelSuccess(modelName: string): void {
  const health = getOrCreateHealth(modelName);

  // If in half-open and succeeded, close the circuit
  if (health.circuitState === "half-open") {
    closeCircuit(modelName);
    return;
  }

  // Normal success: reduce failure count
  if (health.failures > 0) {
    health.failures = Math.max(0, health.failures - 1);
    if (health.failures === 0) {
      health.rateLimitedUntil = 0;
    }
  }

  modelHealth.set(modelName, health);
}

/**
 * Record latency for a model call (sliding window average).
 */
export function recordModelLatency(modelName: string, latencyMs: number): void {
  const health = getOrCreateHealth(modelName);
  health.latencies.push(latencyMs);
  if (health.latencies.length > LATENCY_WINDOW_SIZE) {
    health.latencies.shift();
  }

  // Check latency threshold (only in closed state — don't open during half-open)
  if (health.circuitState === "closed" && health.latencies.length >= 3) {
    const avg = getAverageLatency(modelName);
    if (avg > LATENCY_THRESHOLD_MS) {
      openCircuit(
        modelName,
        `avg latency ${avg.toFixed(0)}ms > ${LATENCY_THRESHOLD_MS}ms threshold`,
      );
    }
  }

  modelHealth.set(modelName, health);
}

/**
 * Mark a model as returning an empty/truncated response (degradation signal).
 */
export function markEmptyResponse(modelName: string): void {
  const health = getOrCreateHealth(modelName);
  health.emptyResponses++;

  if (health.circuitState === "closed" && health.emptyResponses >= EMPTY_RESPONSE_THRESHOLD) {
    openCircuit(modelName, `${health.emptyResponses} empty/truncated responses`);
  }

  modelHealth.set(modelName, health);
}

/**
 * Check if a model should be skipped (circuit breaker open).
 * Call this before attempting to use a model.
 */
export function isModelAvailable(modelName: string): boolean {
  return canUseModel(modelName);
}

/**
 * Increment half-open attempt counter (call this when attempting a half-open test call).
 */
export function recordHalfOpenAttempt(modelName: string): void {
  const health = modelHealth.get(modelName);
  if (health && health.circuitState === "half-open") {
    health.halfOpenAttempts++;
    modelHealth.set(modelName, health);
  }
}

/**
 * Retourne la liste des modèles OpenRouter gratuits disponibles
 * (non en cooldown)
 */
export function getAvailableFreeModels(): string[] {
  return FREE_MODELS_OPENROUTER.filter((model) => canUseModel(model));
}

/**
 * Retourne la liste des modèles bon marché disponibles (backup)
 */
export function getAvailableCheapModels(): string[] {
  return CHEAP_FALLBACK_MODELS.filter((model) => canUseModel(model));
}

// ─── Modèles OpenAI premium (si clé API configurée) ──────────────────────────
// Utilisés en priorité si OPENAI_API_KEY est défini
const OPENAI_PREMIUM_MODELS = [
  "gpt-4o-mini", // Rapide, pas cher, excellent en français
  "gpt-4o", // Haute qualité, plus cher
  "gpt-4.1-mini", // Dernière génération, bon rapport qualité/prix
  "gpt-4.1-nano", // Ultra-rapide, le moins cher
];

/**
 * Retourne les modèles OpenAI premium si la clé API est configurée.
 */
export function getOpenAIPremiumModels(): string[] {
  if (!process.env.OPENAI_API_KEY) return [];
  return [...OPENAI_PREMIUM_MODELS];
}

/**
 * Retourne TOUS les modèles disponibles, par ordre de priorité:
 * 0. Modèles OpenAI premium (si clé API configurée)
 * 1. Modèles gratuits (du plus puissant au plus léger)
 * 2. Modèles bon marché (backup quasi gratuit)
 * 3. Routeur auto OpenRouter (toujours disponible, coûte variable)
 *
 * @param requiresTools Si true, exclut l'auto-router et les modèles sans function calling
 */
export function getAllAvailableModels(requiresTools = false): string[] {
  // 0. OpenAI premium en priorité si disponible
  const premium = getOpenAIPremiumModels();
  if (premium.length > 0) return premium;

  // 1. Modèles gratuits OpenRouter
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
  // Mais pas si on a besoin de function calling — l'auto-router ne garantit pas le support tools
  if (requiresTools) {
    logger.warn(
      `[ModelRotation] ⚠️ Tous les modèles avec tools sont en cooldown — utilisation des modèles sans tools en mode texte seul`,
    );
    // Retourner les modèles sans tools quand même (mieux que rien)
    return [...NO_TOOLS_MODELS];
  }

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
    if (!health || (health.failures === 0 && health.circuitState === "closed")) {
      lines.push(`  ✅ ${model}`);
    } else {
      const circuit = health.circuitState.toUpperCase();
      const avgLatency =
        health.latencies.length > 0
          ? `avg ${getAverageLatency(model).toFixed(0)}ms`
          : "no latency data";
      if (now < health.rateLimitedUntil && health.circuitState === "open") {
        const remaining = Math.ceil((health.rateLimitedUntil - now) / 1000);
        lines.push(
          `  🔴 ${model} [${circuit}] cooldown ${remaining}s, ${health.failures} failures, ${avgLatency}`,
        );
      } else if (health.circuitState === "half-open") {
        lines.push(`  🟡 ${model} [HALF-OPEN] test call pending, ${avgLatency}`);
      } else {
        lines.push(`  ⚠️ ${model} [${circuit}] ${health.failures} failures, ${avgLatency}, ready`);
      }
    }
  }

  lines.push("── Modèles bon marché (backup) ──");
  for (const model of CHEAP_FALLBACK_MODELS) {
    const health = modelHealth.get(model);
    if (!health || (health.failures === 0 && health.circuitState === "closed")) {
      lines.push(`  ✅ ${model}`);
    } else if (health.circuitState === "open" && now < health.rateLimitedUntil) {
      const remaining = Math.ceil((health.rateLimitedUntil - now) / 1000);
      lines.push(`  🔴 ${model} [OPEN] cooldown ${remaining}s`);
    } else {
      lines.push(`  ⚠️ ${model} [${health.circuitState.toUpperCase()}] ready`);
    }
  }

  lines.push(`── Routeur auto ──`);
  lines.push(`  ✅ ${AUTO_ROUTER_MODEL} (toujours disponible)`);

  return lines.join("\n");
}
