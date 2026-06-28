import { describe, it, expect } from "vitest";
import { MEMORY_CONFIG, getMemoryLevel, formatMemoryReport } from "./memoryConfig.js";

describe("memoryConfig", () => {
  describe("MEMORY_CONFIG", () => {
    it("has correct values", () => {
      expect(MEMORY_CONFIG.GC_THRESHOLD_MB).toBe(350);
      expect(MEMORY_CONFIG.V8_HEAP_LIMIT_MB).toBe(448);
      expect(MEMORY_CONFIG.RAILWAY_RAM_MB).toBe(512);
      expect(MEMORY_CONFIG.LEVELS.CRITICAL).toBe(100);
      expect(MEMORY_CONFIG.LEVELS.WARNING).toBe(90);
      expect(MEMORY_CONFIG.LEVELS.SURVEILLANCE).toBe(70);
    });
  });

  describe("getMemoryLevel", () => {
    it("returns OK below 70% of GC threshold", () => {
      expect(getMemoryLevel(0)).toBe("OK");
      expect(getMemoryLevel(100)).toBe("OK");
      expect(getMemoryLevel(244)).toBe("OK"); // 69.7%
    });

    it("returns SURVEILLANCE at 70-90% of GC threshold", () => {
      expect(getMemoryLevel(245)).toBe("SURVEILLANCE"); // 70%
      expect(getMemoryLevel(300)).toBe("SURVEILLANCE"); // 85.7%
      expect(getMemoryLevel(314)).toBe("SURVEILLANCE"); // 89.7%
    });

    it("returns WARNING at 90-100% of GC threshold", () => {
      expect(getMemoryLevel(315)).toBe("WARNING"); // 90%
      expect(getMemoryLevel(340)).toBe("WARNING"); // 97.1%
      expect(getMemoryLevel(349)).toBe("WARNING"); // 99.7%
    });

    it("returns CRITICAL at >= 100% of GC threshold", () => {
      expect(getMemoryLevel(350)).toBe("CRITICAL"); // 100%
      expect(getMemoryLevel(400)).toBe("CRITICAL");
      expect(getMemoryLevel(500)).toBe("CRITICAL");
    });

    it("does NOT alert at 264MB RSS (the false positive case)", () => {
      // 264/350 = 75.4% → SURVEILLANCE (no alert, just monitoring)
      expect(getMemoryLevel(264)).toBe("SURVEILLANCE");
    });

    it("does NOT alert at 114MB RSS (the false positive case)", () => {
      // 114/350 = 32.6% → OK
      expect(getMemoryLevel(114)).toBe("OK");
    });
  });

  describe("formatMemoryReport", () => {
    it("formats report with all values", () => {
      const report = formatMemoryReport(264, 114, 120);
      expect(report).toContain("RSS : 264 MB / 512 MB");
      expect(report).toContain("Heap : 114 MB / 448 MB");
      expect(report).toContain("Seuil GC : 350 MB");
      expect(report).toContain("Utilisation du seuil GC");
      expect(report).toContain(": SURVEILLANCE");
    });

    it("shows SURVEILLANCE level correctly", () => {
      const report = formatMemoryReport(280, 150, 160);
      expect(report).toContain(": SURVEILLANCE");
    });

    it("shows CRITICAL level correctly", () => {
      const report = formatMemoryReport(400, 300, 320);
      expect(report).toContain(": CRITICAL");
    });
  });
});
