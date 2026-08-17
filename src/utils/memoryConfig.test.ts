import { describe, it, expect } from "vitest";
import { MEMORY_CONFIG, getMemoryLevel, formatMemoryReport } from "./memoryConfig.js";

/**
 * MEMORY_CONFIG is RAM-adaptive (VPS ≤6GB vs local ≥8GB — see memoryConfig.ts).
 * These tests validate the invariants of the adaptive design rather than
 * hardcoding one machine profile's absolute values, so they pass consistently
 * on both VPS (low RAM) and local dev (high RAM) environments.
 */
describe("memoryConfig", () => {
  describe("MEMORY_CONFIG", () => {
    it("has internally consistent, monotonically increasing thresholds", () => {
      expect(MEMORY_CONFIG.LEVELS.OK).toBe(0);
      expect(MEMORY_CONFIG.LEVELS.SURVEILLANCE).toBeGreaterThan(MEMORY_CONFIG.LEVELS.OK);
      expect(MEMORY_CONFIG.LEVELS.WARNING).toBeGreaterThan(MEMORY_CONFIG.LEVELS.SURVEILLANCE);
      expect(MEMORY_CONFIG.LEVELS.CRITICAL).toBeGreaterThan(MEMORY_CONFIG.LEVELS.WARNING);
      expect(MEMORY_CONFIG.CRITICAL_THRESHOLD_MB).toBe(MEMORY_CONFIG.LEVELS.CRITICAL);
      expect(MEMORY_CONFIG.GC_THRESHOLD_MB).toBeGreaterThan(0);
      expect(MEMORY_CONFIG.V8_HEAP_LIMIT_MB).toBeGreaterThan(0);
      expect(MEMORY_CONFIG.RAILWAY_RAM_MB).toBeGreaterThan(0);
    });

    it("applies VPS profile when detected RAM is <= 6GB, local profile otherwise", () => {
      if (MEMORY_CONFIG.IS_VPS) {
        expect(MEMORY_CONFIG.RAILWAY_RAM_MB).toBe(3072);
        expect(MEMORY_CONFIG.V8_HEAP_LIMIT_MB).toBe(1536);
        expect(MEMORY_CONFIG.GC_THRESHOLD_MB).toBe(600);
        expect(MEMORY_CONFIG.LEVELS.SURVEILLANCE).toBe(400);
        expect(MEMORY_CONFIG.LEVELS.WARNING).toBe(600);
        expect(MEMORY_CONFIG.LEVELS.CRITICAL).toBe(900);
      } else {
        expect(MEMORY_CONFIG.RAILWAY_RAM_MB).toBe(8192);
        expect(MEMORY_CONFIG.V8_HEAP_LIMIT_MB).toBe(4096);
        expect(MEMORY_CONFIG.GC_THRESHOLD_MB).toBe(800);
        expect(MEMORY_CONFIG.LEVELS.SURVEILLANCE).toBe(500);
        expect(MEMORY_CONFIG.LEVELS.WARNING).toBe(800);
        expect(MEMORY_CONFIG.LEVELS.CRITICAL).toBe(1200);
      }
    });
  });

  describe("getMemoryLevel", () => {
    const { SURVEILLANCE, WARNING, CRITICAL } = MEMORY_CONFIG.LEVELS;

    it("returns OK below the SURVEILLANCE threshold", () => {
      expect(getMemoryLevel(0)).toBe("OK");
      expect(getMemoryLevel(SURVEILLANCE - 1)).toBe("OK");
    });

    it("returns SURVEILLANCE between SURVEILLANCE and WARNING thresholds", () => {
      expect(getMemoryLevel(SURVEILLANCE)).toBe("SURVEILLANCE");
      expect(getMemoryLevel(WARNING - 1)).toBe("SURVEILLANCE");
    });

    it("returns WARNING between WARNING and CRITICAL thresholds", () => {
      expect(getMemoryLevel(WARNING)).toBe("WARNING");
      expect(getMemoryLevel(CRITICAL - 1)).toBe("WARNING");
    });

    it("returns CRITICAL at or above the CRITICAL threshold", () => {
      expect(getMemoryLevel(CRITICAL)).toBe("CRITICAL");
      expect(getMemoryLevel(CRITICAL + 100)).toBe("CRITICAL");
    });
  });

  describe("formatMemoryReport", () => {
    it("formats report with all values", () => {
      const report = formatMemoryReport(350, 150, 160);
      expect(report).toContain(`RSS : 350 MB / ${MEMORY_CONFIG.RAILWAY_RAM_MB} MB`);
      expect(report).toContain(`Heap : 150 MB / ${MEMORY_CONFIG.V8_HEAP_LIMIT_MB} MB`);
      expect(report).toContain(`Seuil GC : ${MEMORY_CONFIG.GC_THRESHOLD_MB} MB`);
      expect(report).toContain("Utilisation du seuil GC");
      expect(report).toContain(`: ${getMemoryLevel(350)}`);
    });

    it("shows WARNING level correctly", () => {
      const rss = MEMORY_CONFIG.LEVELS.WARNING + 10;
      const report = formatMemoryReport(rss, 250, 270);
      expect(report).toContain(": WARNING");
    });

    it("shows CRITICAL level correctly", () => {
      const rss = MEMORY_CONFIG.LEVELS.CRITICAL + 10;
      const report = formatMemoryReport(rss, 300, 320);
      expect(report).toContain(": CRITICAL");
    });
  });
});
