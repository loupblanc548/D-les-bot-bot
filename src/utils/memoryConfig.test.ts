import { describe, it, expect } from "vitest";
import {
  MEMORY_CONFIG,
  getMemoryLevel,
  formatMemoryReport,
  buildMemoryConfig,
  selectMemoryProfile,
} from "./memoryConfig.js";

describe("memoryConfig", () => {
  describe("selectMemoryProfile", () => {
    it("classifies 4GB as tight and 8GB as vps8, not local", () => {
      expect(selectMemoryProfile(4096)).toBe("tight");
      expect(selectMemoryProfile(8192)).toBe("vps8");
      expect(selectMemoryProfile(12288)).toBe("vps8");
      expect(selectMemoryProfile(16384)).toBe("local");
    });

    it("honors WORKER_MODE / FORCE_LOCAL_MEMORY for the mini PC", () => {
      expect(selectMemoryProfile(8192, { WORKER_MODE: "1" })).toBe("local");
      expect(selectMemoryProfile(8192, { FORCE_LOCAL_MEMORY: "true" })).toBe("local");
    });
  });

  describe("buildMemoryConfig", () => {
    it("keeps an 8GB VPS under a 2GB Node budget", () => {
      const cfg = buildMemoryConfig(8192);
      expect(cfg.PROFILE).toBe("vps8");
      expect(cfg.IS_VPS).toBe(true);
      expect(cfg.V8_HEAP_LIMIT_MB).toBe(1536);
      expect(cfg.RAILWAY_RAM_MB).toBe(2048);
      expect(cfg.SKIP_MEDIA_WORKER).toBe(true);
      expect(cfg.SKIP_LLM_PREWARM).toBe(true);
      expect(cfg.WATCHDOG_SHUTDOWN_MB).toBeLessThanOrEqual(1536);
      expect(cfg.OFFLOAD_HEAP_MB).toBeLessThan(cfg.V8_HEAP_LIMIT_MB);
    });

    it("gives the mini PC a 4GB heap", () => {
      const cfg = buildMemoryConfig(16384);
      expect(cfg.PROFILE).toBe("local");
      expect(cfg.V8_HEAP_LIMIT_MB).toBe(4096);
      expect(cfg.SKIP_MEDIA_WORKER).toBe(false);
    });

    it("lets ENABLE_MEDIA_WORKER override VPS skip", () => {
      const cfg = buildMemoryConfig(8192, { ENABLE_MEDIA_WORKER: "1" });
      expect(cfg.SKIP_MEDIA_WORKER).toBe(false);
    });
  });

  describe("MEMORY_CONFIG (live process)", () => {
    it("has internally consistent, monotonically increasing thresholds", () => {
      expect(MEMORY_CONFIG.LEVELS.OK).toBe(0);
      expect(MEMORY_CONFIG.LEVELS.SURVEILLANCE).toBeGreaterThan(MEMORY_CONFIG.LEVELS.OK);
      expect(MEMORY_CONFIG.LEVELS.WARNING).toBeGreaterThan(MEMORY_CONFIG.LEVELS.SURVEILLANCE);
      expect(MEMORY_CONFIG.LEVELS.CRITICAL).toBeGreaterThan(MEMORY_CONFIG.LEVELS.WARNING);
      expect(MEMORY_CONFIG.CRITICAL_THRESHOLD_MB).toBe(MEMORY_CONFIG.LEVELS.CRITICAL);
      expect(MEMORY_CONFIG.V8_HEAP_LIMIT_MB).toBeGreaterThan(0);
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
      expect(report).toContain("Profil");
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
