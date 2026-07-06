import { describe, it, expect } from "vitest";
import { MEMORY_CONFIG, getMemoryLevel, formatMemoryReport } from "./memoryConfig.js";

describe("memoryConfig", () => {
  describe("MEMORY_CONFIG", () => {
    it("has correct values", () => {
      expect(MEMORY_CONFIG.GC_THRESHOLD_MB).toBe(400);
      expect(MEMORY_CONFIG.CRITICAL_THRESHOLD_MB).toBe(470);
      expect(MEMORY_CONFIG.V8_HEAP_LIMIT_MB).toBe(384);
      expect(MEMORY_CONFIG.RAILWAY_RAM_MB).toBe(512);
      expect(MEMORY_CONFIG.LEVELS.CRITICAL).toBe(470);
      expect(MEMORY_CONFIG.LEVELS.WARNING).toBe(400);
      expect(MEMORY_CONFIG.LEVELS.SURVEILLANCE).toBe(300);
    });
  });

  describe("getMemoryLevel", () => {
    it("returns OK below 300MB", () => {
      expect(getMemoryLevel(0)).toBe("OK");
      expect(getMemoryLevel(100)).toBe("OK");
      expect(getMemoryLevel(200)).toBe("OK");
      expect(getMemoryLevel(299)).toBe("OK");
    });

    it("returns SURVEILLANCE between 300-399MB", () => {
      expect(getMemoryLevel(300)).toBe("SURVEILLANCE");
      expect(getMemoryLevel(350)).toBe("SURVEILLANCE");
      expect(getMemoryLevel(399)).toBe("SURVEILLANCE");
    });

    it("returns WARNING between 400-469MB", () => {
      expect(getMemoryLevel(400)).toBe("WARNING");
      expect(getMemoryLevel(430)).toBe("WARNING");
      expect(getMemoryLevel(469)).toBe("WARNING");
    });

    it("returns CRITICAL at >= 470MB", () => {
      expect(getMemoryLevel(470)).toBe("CRITICAL");
      expect(getMemoryLevel(490)).toBe("CRITICAL");
      expect(getMemoryLevel(512)).toBe("CRITICAL");
    });
  });

  describe("formatMemoryReport", () => {
    it("formats report with all values", () => {
      const report = formatMemoryReport(350, 150, 160);
      expect(report).toContain("RSS : 350 MB / 512 MB");
      expect(report).toContain("Heap : 150 MB / 384 MB");
      expect(report).toContain("Seuil GC : 400 MB");
      expect(report).toContain("Utilisation du seuil GC");
      expect(report).toContain(": SURVEILLANCE");
    });

    it("shows WARNING level correctly", () => {
      const report = formatMemoryReport(420, 250, 270);
      expect(report).toContain(": WARNING");
    });

    it("shows CRITICAL level correctly", () => {
      const report = formatMemoryReport(480, 300, 320);
      expect(report).toContain(": CRITICAL");
    });
  });
});
