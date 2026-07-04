import { describe, it, expect } from "vitest";
import { MEMORY_CONFIG, getMemoryLevel, formatMemoryReport } from "./memoryConfig.js";

describe("memoryConfig", () => {
  describe("MEMORY_CONFIG", () => {
    it("has correct values", () => {
      expect(MEMORY_CONFIG.GC_THRESHOLD_MB).toBe(300);
      expect(MEMORY_CONFIG.V8_HEAP_LIMIT_MB).toBe(448);
      expect(MEMORY_CONFIG.RAILWAY_RAM_MB).toBe(512);
      expect(MEMORY_CONFIG.LEVELS.CRITICAL).toBe(100);
      expect(MEMORY_CONFIG.LEVELS.WARNING).toBe(85);
      expect(MEMORY_CONFIG.LEVELS.SURVEILLANCE).toBe(70);
    });
  });

  describe("getMemoryLevel", () => {
    it("returns OK below 70% of GC threshold", () => {
      expect(getMemoryLevel(0)).toBe("OK");
      expect(getMemoryLevel(100)).toBe("OK");
      expect(getMemoryLevel(209)).toBe("OK"); // 69.67%
    });

    it("returns SURVEILLANCE at 70-85% of GC threshold", () => {
      expect(getMemoryLevel(210)).toBe("SURVEILLANCE"); // 70%
      expect(getMemoryLevel(240)).toBe("SURVEILLANCE"); // 80%
      expect(getMemoryLevel(254)).toBe("SURVEILLANCE"); // 84.67%
    });

    it("returns WARNING at 85-100% of GC threshold", () => {
      expect(getMemoryLevel(255)).toBe("WARNING"); // 85%
      expect(getMemoryLevel(280)).toBe("WARNING"); // 93.33%
      expect(getMemoryLevel(299)).toBe("WARNING"); // 99.67%
    });

    it("returns CRITICAL at >= 100% of GC threshold", () => {
      expect(getMemoryLevel(300)).toBe("CRITICAL"); // 100%
      expect(getMemoryLevel(350)).toBe("CRITICAL");
      expect(getMemoryLevel(500)).toBe("CRITICAL");
    });

    it("does NOT alert at 200MB RSS (the false positive case)", () => {
      // 200/300 = 66.67% → OK (no alert)
      expect(getMemoryLevel(200)).toBe("OK");
    });

    it("does NOT alert at 133MB RSS (the false positive case)", () => {
      // 133/400 = 33.25% → OK
      expect(getMemoryLevel(133)).toBe("OK");
    });
  });

  describe("formatMemoryReport", () => {
    it("formats report with all values", () => {
      const report = formatMemoryReport(220, 150, 160);
      expect(report).toContain("RSS : 220 MB / 512 MB");
      expect(report).toContain("Heap : 150 MB / 448 MB");
      expect(report).toContain("Seuil GC : 300 MB");
      expect(report).toContain("Utilisation du seuil GC");
      expect(report).toContain(": SURVEILLANCE");
    });

    it("shows SURVEILLANCE level correctly", () => {
      const report = formatMemoryReport(220, 150, 160);
      expect(report).toContain(": SURVEILLANCE");
    });

    it("shows CRITICAL level correctly", () => {
      const report = formatMemoryReport(300, 250, 270);
      expect(report).toContain(": CRITICAL");
    });
  });
});
