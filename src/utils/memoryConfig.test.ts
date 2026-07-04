import { describe, it, expect } from "vitest";
import { MEMORY_CONFIG, getMemoryLevel, formatMemoryReport } from "./memoryConfig.js";

describe("memoryConfig", () => {
  describe("MEMORY_CONFIG", () => {
    it("has correct values", () => {
      expect(MEMORY_CONFIG.GC_THRESHOLD_MB).toBe(450);
      expect(MEMORY_CONFIG.CRITICAL_THRESHOLD_MB).toBe(490);
      expect(MEMORY_CONFIG.V8_HEAP_LIMIT_MB).toBe(448);
      expect(MEMORY_CONFIG.RAILWAY_RAM_MB).toBe(512);
      expect(MEMORY_CONFIG.LEVELS.CRITICAL).toBe(490);
      expect(MEMORY_CONFIG.LEVELS.WARNING).toBe(450);
      expect(MEMORY_CONFIG.LEVELS.SURVEILLANCE).toBe(350);
    });
  });

  describe("getMemoryLevel", () => {
    it("returns OK below 350MB", () => {
      expect(getMemoryLevel(0)).toBe("OK");
      expect(getMemoryLevel(100)).toBe("OK");
      expect(getMemoryLevel(200)).toBe("OK");
      expect(getMemoryLevel(349)).toBe("OK");
    });

    it("returns SURVEILLANCE between 350-449MB", () => {
      expect(getMemoryLevel(350)).toBe("SURVEILLANCE");
      expect(getMemoryLevel(400)).toBe("SURVEILLANCE");
      expect(getMemoryLevel(449)).toBe("SURVEILLANCE");
    });

    it("returns WARNING between 450-489MB", () => {
      expect(getMemoryLevel(450)).toBe("WARNING");
      expect(getMemoryLevel(470)).toBe("WARNING");
      expect(getMemoryLevel(489)).toBe("WARNING");
    });

    it("returns CRITICAL at >= 490MB", () => {
      expect(getMemoryLevel(490)).toBe("CRITICAL");
      expect(getMemoryLevel(500)).toBe("CRITICAL");
      expect(getMemoryLevel(512)).toBe("CRITICAL");
    });

    it("does NOT alert at 355MB RSS (the false positive case from old 350 threshold)", () => {
      // 355MB → SURVEILLANCE (not CRITICAL)
      expect(getMemoryLevel(355)).toBe("SURVEILLANCE");
    });
  });

  describe("formatMemoryReport", () => {
    it("formats report with all values", () => {
      const report = formatMemoryReport(400, 150, 160);
      expect(report).toContain("RSS : 400 MB / 512 MB");
      expect(report).toContain("Heap : 150 MB / 448 MB");
      expect(report).toContain("Seuil GC : 450 MB");
      expect(report).toContain("Utilisation du seuil GC");
      expect(report).toContain(": SURVEILLANCE");
    });

    it("shows WARNING level correctly", () => {
      const report = formatMemoryReport(460, 250, 270);
      expect(report).toContain(": WARNING");
    });

    it("shows CRITICAL level correctly", () => {
      const report = formatMemoryReport(495, 300, 320);
      expect(report).toContain(": CRITICAL");
    });
  });
});
