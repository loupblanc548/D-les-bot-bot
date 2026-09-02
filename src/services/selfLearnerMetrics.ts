/**
 * selfLearnerMetrics.ts — Métriques d'impact du vault Obsidian / self-learner.
 *
 * Persiste sur disque pour survivre aux redémarrages.
 */

import fs from "fs";
import path from "path";

/** Estimation conservative : ~2k tokens évités par hit vault (prompt + réponse). */
export const ESTIMATED_TOKENS_SAVED_PER_HIT = 2000;

/** Prix indicatif OpenRouter (~$0.50/M tokens input+output mixte). */
export const ESTIMATED_COST_PER_M_TOKENS_USD = 0.5;

export interface SelfLearnerMetricsSnapshot {
  vaultHits: number;
  vaultMisses: number;
  qaSaved: number;
  hitRate: number;
  estimatedTokensSaved: number;
  estimatedCostSavedUsd: number;
  lastHitAt: string | null;
  lastSavedAt: string | null;
  startedAt: string;
}

interface MetricsState {
  vaultHits: number;
  vaultMisses: number;
  qaSaved: number;
  lastHitAt: string | null;
  lastSavedAt: string | null;
  startedAt: string;
}

const DEFAULT_STATE: MetricsState = {
  vaultHits: 0,
  vaultMisses: 0,
  qaSaved: 0,
  lastHitAt: null,
  lastSavedAt: null,
  startedAt: new Date().toISOString(),
};

function metricsFilePath(): string {
  const vault = process.env.OBSIDIAN_VAULT_PATH;
  if (vault) return path.join(vault, "qa", ".learner-metrics.json");
  return path.join(process.cwd(), "data", ".learner-metrics.json");
}

let state: MetricsState = { ...DEFAULT_STATE };
let loaded = false;

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  try {
    const file = metricsFilePath();
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as Partial<MetricsState>;
      state = { ...DEFAULT_STATE, ...parsed };
    }
  } catch {
    state = { ...DEFAULT_STATE };
  }
}

function persist(): void {
  try {
    const file = metricsFilePath();
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(state, null, 2), "utf-8");
  } catch {
    // non-critical
  }
}

export function recordVaultHit(): void {
  ensureLoaded();
  state.vaultHits++;
  state.lastHitAt = new Date().toISOString();
  persist();
}

export function recordVaultMiss(): void {
  ensureLoaded();
  state.vaultMisses++;
  persist();
}

export function recordQASaved(): void {
  ensureLoaded();
  state.qaSaved++;
  state.lastSavedAt = new Date().toISOString();
  persist();
}

export function getSelfLearnerMetrics(): SelfLearnerMetricsSnapshot {
  ensureLoaded();
  const lookups = state.vaultHits + state.vaultMisses;
  const hitRate = lookups > 0 ? state.vaultHits / lookups : 0;
  const estimatedTokensSaved = state.vaultHits * ESTIMATED_TOKENS_SAVED_PER_HIT;
  const estimatedCostSavedUsd =
    (estimatedTokensSaved / 1_000_000) * ESTIMATED_COST_PER_M_TOKENS_USD;

  return {
    vaultHits: state.vaultHits,
    vaultMisses: state.vaultMisses,
    qaSaved: state.qaSaved,
    hitRate,
    estimatedTokensSaved,
    estimatedCostSavedUsd,
    lastHitAt: state.lastHitAt,
    lastSavedAt: state.lastSavedAt,
    startedAt: state.startedAt,
  };
}

/** Reset metrics — utile pour les tests. */
export function resetSelfLearnerMetricsForTests(): void {
  state = { ...DEFAULT_STATE, startedAt: new Date().toISOString() };
  loaded = true;
}
