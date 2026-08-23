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
import { agentCircuitBreakerTransitions } from "./prometheusExporter.js";
import { NVIDIA_FREE_MODELS, isNvidiaNimAvailable } from "./nvidiaNim.js";
import { OMNIROUTE_FREE_MODELS, isOmnirouteAvailable } from "./omniroute.js";
import { config } from "../config.js";

// ─── Modèles réellement routables ────────────────────────────────────────────
// Le modèle OpenRouter configuré est le seul candidat OpenRouter garanti valide.
// Les modèles NVIDIA/OmniRoute ne sont ajoutés que si leur provider est configuré;
// sinon ils seraient envoyés au mauvais endpoint et échoueraient en boucle (404).
// NOTE: OPENROUTER_BASE_URL pointe vers NVIDIA NIM (integrate.api.nvidia.com/v1)
// avec une clé NVIDIA (nvapi-...). Les modèles doivent donc être des noms NVIDIA NIM.
const OPENROUTER_FREE_MODELS = [
  // Le modèle configuré (NVIDIA NIM)
  config.openRouterModel,
  // Fallbacks NVIDIA NIM (valides pour cette API)
  "meta/llama-3.3-70b-instruct",
  "meta/llama-3.1-70b-instruct",
  "nvidia/nemotron-3-super-120b-a12b",
  "nvidia/nemotron-3-ultra-550b-a55b",
  "nvidia/llama-3.3-nemotron-super-49b-v1",
  "nvidia/nemotron-3-nano-30b-a3b",
];

function getCandidateModels(): string[] {
  return [
    ...(config.openRouterApiKey ? OPENROUTER_FREE_MODELS : []),
    ...(isNvidiaNimAvailable() ? NVIDIA_FREE_MODELS : []),
    ...(isOmnirouteAvailable() ? OMNIROUTE_FREE_MODELS : []),
  ].filter((model, index, models) => model && models.indexOf(model) === index);
}

// ─── Modèles backup (si les principaux sont en cooldown) ─────────────────────
const CHEAP_FALLBACK_MODELS = [
  "meta-llama/llama-3.1-8b-instruct",
  "qwen/qwen-2.5-7b-instruct",
  "mistralai/mistral-nemo",
  "meta-llama/llama-3.2-3b-instruct",
];

// ─── Modèle de dernier recours OpenRouter ─────────────────────────────────────
// `openrouter/auto` choisit un modèle disponible côté OpenRouter; il ne doit
// être utilisé qu'en chat texte, jamais pour une boucle de tools.
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

// A model can be healthy and still be busy. Claiming prevents concurrent requests
// from colliding on the same provider/model and generating avoidable 429s.
const inFlightModels = new Map<string, number>();
const MODEL_CLAIM_TTL_MS = 30_000;

// Un cooldown évite de marteler un provider défaillant, mais ne doit jamais
// bloquer la réponse : les autres providers sont essayés immédiatement.
const RATE_LIMIT_COOLDOWN_MS = 5 * 1000;
const ERROR_COOLDOWN_MS = 30_000; // 30s — évite de réessayer un modèle qui timeout dans la même requête
// Reset du compteur d'échecs après 30 minutes sans erreur
const HEALTH_RESET_MS = 30 * 60 * 1000;
// Max échecs avant de blacklister un modèle pour plus longtemps
const MAX_FAILURES_BEFORE_BLACKLIST = 3;

// ─── Circuit breaker configuration ───────────────────────────────────────────
const LATENCY_WINDOW_SIZE = 10; // track last 10 calls for moving average
const LATENCY_THRESHOLD_MS = 15_000; // 15s average → open circuit
const CIRCUIT_OPEN_INITIAL_MS = 10_000; // fail fast; independent fallbacks remain available
const CIRCUIT_HALF_OPEN_MAX_ATTEMPTS = 1; // single test call in half-open
const CIRCUIT_OPEN_MAX_BACKOFF_MS = 2 * 60 * 1000; // cap recovery backoff at 2 minutes
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
  agentCircuitBreakerTransitions.labels(modelName, "open").inc();
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
  agentCircuitBreakerTransitions.labels(modelName, "half-open").inc();
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
  agentCircuitBreakerTransitions.labels(modelName, "closed").inc();
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
 * Reserve a model for one request. This is deliberately synchronous: JavaScript
 * cannot interleave two callers between the availability check and the claim.
 */
export function claimModel(modelName: string): boolean {
  const claimedAt = inFlightModels.get(modelName);
  if (claimedAt !== undefined) {
    if (Date.now() - claimedAt < MODEL_CLAIM_TTL_MS) return false;
    inFlightModels.delete(modelName);
  }

  if (!canUseModel(modelName)) return false;

  inFlightModels.set(modelName, Date.now());
  const health = modelHealth.get(modelName);
  if (health?.circuitState === "half-open") {
    health.halfOpenAttempts++;
  }
  return true;
}

/** Release a model reservation after the request settles. */
export function releaseModel(modelName: string): void {
  inFlightModels.delete(modelName);
}

/** Return the remaining health cooldown for diagnostics and user-facing status. */
export function getModelRetryAfterMs(modelName: string): number {
  const health = modelHealth.get(modelName);
  if (!health) return 0;
  return Math.max(0, health.rateLimitedUntil - Date.now());
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
  return getCandidateModels().filter((model) => canUseModel(model));
}

/**
 * Reset ALL circuit breakers and cooldowns. Use when every model is blocked
 * to give them a fresh chance instead of returning "all models unavailable".
 */
export function resetAllCircuitBreakers(): void {
  let resetCount = 0;
  for (const [name, health] of modelHealth) {
    if (health.circuitState !== "closed" || health.rateLimitedUntil > Date.now()) {
      health.circuitState = "closed";
      health.failures = 0;
      health.rateLimitedUntil = 0;
      health.circuitOpenedAt = 0;
      health.halfOpenAttempts = 0;
      resetCount++;
    }
  }
  if (resetCount > 0) {
    logger.info(
      `[ModelRotation] 🔄 Reset ${resetCount} circuit breaker(s) — all models were in cooldown`,
    );
  }
}

/**
 * Check if all known models are unavailable (circuit open or rate-limited).
 * If so, reset all circuit breakers and return true.
 * Returns false if at least one model is available.
 */
export function ensureAtLeastOneModelAvailable(): boolean {
  const allModels = [...getCandidateModels(), ...CHEAP_FALLBACK_MODELS];
  const anyAvailable = allModels.some((m) => canUseModel(m));
  if (!anyAvailable) {
    logger.warn(
      `[ModelRotation] ⚠️ All ${allModels.length} models in cooldown — resetting circuit breakers`,
    );
    resetAllCircuitBreakers();
    return true; // we reset, now models should be available
  }
  return false;
}

/**
 * Retourne la liste des modèles bon marché disponibles (backup)
 */
export function getAvailableCheapModels(): string[] {
  return CHEAP_FALLBACK_MODELS.filter((model) => canUseModel(model));
}

// ─── Modèles OpenAI premium (si clé API configurée) ──────────────────────────
// OpenAI Premium supprimé — utilisation d'OpenRouter pour les modèles gpt-*

/**
 * Retourne TOUS les modèles disponibles, par ordre de priorité:
 * 1. Modèles gratuits (du plus puissant au plus léger)
 * 2. Modèles bon marché (backup quasi gratuit)
 * 3. Routeur auto OpenRouter (toujours disponible, coûte variable)
 *
 * @param requiresTools Si true, exclut l'auto-router et les modèles sans function calling
 */
export function getAllAvailableModels(requiresTools = false): string[] {
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

  // Dernier recours: routeur auto uniquement si OpenRouter est configuré.
  // Mais pas si on a besoin de function calling — l'auto-router ne garantit pas le support tools
  if (requiresTools || !config.openRouterApiKey) {
    logger.warn(
      `[ModelRotation] ⚠️ Tous les modèles avec tools sont en cooldown — utilisation des modèles sans tools en mode texte seul`,
    );
    // Aucun modèle compatible tools n'est disponible. L'appelant doit alors
    // passer aux providers indépendants (Groq/Gemini/local), plutôt que de
    // rappeler le modèle OpenRouter actuellement en cooldown.
    return [];
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
  for (const model of OPENROUTER_FREE_MODELS) {
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
  lines.push(
    config.openRouterApiKey
      ? `  ✅ ${AUTO_ROUTER_MODEL} (fallback OpenRouter)`
      : `  ⏸️ ${AUTO_ROUTER_MODEL} (OpenRouter non configuré)`,
  );

  return lines.join("\n");
}
