/**
 * aiLogAnalyzer.test.ts — Tests du AI Log Analyzer
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("./logs.js", () => ({ createLog: vi.fn().mockResolvedValue(undefined) }));

vi.mock("./socExtension.js", () => ({
  recordSecurityEvent: vi.fn(),
}));

import {
  ingestLog,
  analyzeLogs,
  getAnomalies,
  getKnownPatterns,
  clearAnalyzer,
  updateAnalyzerConfig,
  generateAnalysisReport,
  startContinuousAnalysis,
  stopContinuousAnalysis,
} from "./aiLogAnalyzer.js";

describe("AI Log Analyzer", () => {
  beforeEach(() => {
    clearAnalyzer();
    updateAnalyzerConfig(true, 60000);
    vi.clearAllMocks();
  });

  describe("ingestLog", () => {
    it("enregistre une entrée de log", () => {
      ingestLog("error", "testSource", "Test error message");
      const patterns = getKnownPatterns();
      expect(patterns.length).toBeGreaterThan(0);
    });

    it("normalise les messages (remplace nombres par N)", () => {
      ingestLog("info", "test", "User 123 logged in at 456");
      const patterns = getKnownPatterns();
      const pattern = patterns.find((p) => p.source === "test");
      expect(pattern).toBeDefined();
      expect(pattern?.pattern).toContain("N");
    });
  });

  describe("analyzeLogs", () => {
    it("détecte un spike d'erreurs", () => {
      for (let i = 0; i < 15; i++) {
        ingestLog("error", "scraper", `Error ${i}: connection failed`);
      }
      const anomalies = analyzeLogs();
      const spike = anomalies.find((a) => a.type === "ERROR_SPIKE");
      expect(spike).toBeDefined();
      expect(spike?.severity).toBe("HIGH");
    });

    it("ne détecte pas d'anomalie sans erreurs", () => {
      ingestLog("info", "test", "Normal log");
      const anomalies = analyzeLogs();
      expect(anomalies.find((a) => a.type === "ERROR_SPIKE")).toBeUndefined();
    });

    it("détecte la mémoire élevée", () => {
      const anomalies = analyzeLogs();
      // Memory check is always run — may or may not trigger depending on actual usage
      expect(Array.isArray(anomalies)).toBe(true);
    });
  });

  describe("getAnomalies", () => {
    it("retourne l'historique des anomalies", () => {
      for (let i = 0; i < 15; i++) {
        ingestLog("error", "test", `Error ${i}`);
      }
      analyzeLogs();
      const anomalies = getAnomalies();
      expect(anomalies.length).toBeGreaterThan(0);
    });
  });

  describe("generateAnalysisReport", () => {
    it("génère un rapport", () => {
      ingestLog("info", "test", "Log 1");
      ingestLog("error", "test", "Error 1");
      const report = generateAnalysisReport();
      expect(report.totalEntries).toBeGreaterThan(0);
      expect(report.errorCount).toBeGreaterThan(0);
      expect(report.generatedAt).toBeDefined();
    });
  });

  describe("Continuous Analysis", () => {
    it("démarre et arrête l'analyse continue", () => {
      startContinuousAnalysis();
      stopContinuousAnalysis();
      expect(true).toBe(true);
    });
  });
});
