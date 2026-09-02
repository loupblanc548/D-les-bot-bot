import { describe, it, expect, beforeEach } from "vitest";
import {
  recordVaultHit,
  recordVaultMiss,
  recordQASaved,
  getSelfLearnerMetrics,
  resetSelfLearnerMetricsForTests,
  ESTIMATED_TOKENS_SAVED_PER_HIT,
} from "./selfLearnerMetrics.js";

describe("selfLearnerMetrics", () => {
  beforeEach(() => {
    resetSelfLearnerMetricsForTests();
  });

  it("starts with zero counters", () => {
    const m = getSelfLearnerMetrics();
    expect(m.vaultHits).toBe(0);
    expect(m.vaultMisses).toBe(0);
    expect(m.qaSaved).toBe(0);
    expect(m.hitRate).toBe(0);
  });

  it("computes hit rate after hits and misses", () => {
    recordVaultHit();
    recordVaultHit();
    recordVaultMiss();

    const m = getSelfLearnerMetrics();
    expect(m.vaultHits).toBe(2);
    expect(m.vaultMisses).toBe(1);
    expect(m.hitRate).toBeCloseTo(2 / 3);
  });

  it("estimates tokens saved from hits", () => {
    recordVaultHit();
    recordVaultHit();

    const m = getSelfLearnerMetrics();
    expect(m.estimatedTokensSaved).toBe(2 * ESTIMATED_TOKENS_SAVED_PER_HIT);
    expect(m.estimatedCostSavedUsd).toBeGreaterThan(0);
  });

  it("tracks qa saved timestamp", () => {
    recordQASaved();
    const m = getSelfLearnerMetrics();
    expect(m.qaSaved).toBe(1);
    expect(m.lastSavedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
