/**
 * incidentResolver.test.ts — Tests du résolveur d'incidents assisté par IA
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../utils/confirm.js", () => ({
  requestConfirmation: vi.fn().mockResolvedValue(true),
}));

vi.mock("./logs.js", () => ({
  createLog: vi.fn().mockResolvedValue(undefined),
}));

import {
  analyzeError,
  proposeFix,
  submitForValidation,
  resetOccurrenceTracking,
  getOccurrences,
} from "./incidentResolver.js";

describe("Incident Resolver", () => {
  beforeEach(() => {
    resetOccurrenceTracking();
    vi.clearAllMocks();
  });

  describe("analyzeError", () => {
    it("catégorise un timeout de scraper", () => {
      const analysis = analyzeError("ETIMEDOUT: scraper timed out after 30s", "dealsCron");
      expect(analysis.category).toBe("SCRAPER_TIMEOUT");
      expect(analysis.severity).toBe("MEDIUM");
      expect(analysis.source).toBe("dealsCron");
      expect(analysis.occurrences).toBe(1);
    });

    it("catégorise un rate limit", () => {
      const analysis = analyzeError("HTTP 429: too many requests", "twitterCron");
      expect(analysis.category).toBe("SCRAPER_RATE_LIMIT");
    });

    it("catégorise une erreur de parsing", () => {
      const analysis = analyzeError("Unexpected token < in JSON at position 0", "rssAggregator");
      expect(analysis.category).toBe("SCRAPER_PARSE_ERROR");
    });

    it("catégorise une erreur DB", () => {
      const analysis = analyzeError("Prisma: ECONNREFUSED postgres://localhost:5432", "prisma");
      expect(analysis.category).toBe("DATABASE_CONNECTION");
      expect(analysis.severity).toBe("HIGH");
    });

    it("catégorise une fuite mémoire", () => {
      const analysis = analyzeError("FATAL: heap out of memory (OOM)", "process");
      expect(analysis.category).toBe("MEMORY_LEAK");
      expect(analysis.severity).toBe("CRITICAL");
    });

    it("catégorise un module crash", () => {
      const analysis = analyzeError("Cannot find module './missing.js'", "startup");
      expect(analysis.category).toBe("MODULE_CRASH");
    });

    it("catégorise une erreur inconnue", () => {
      const analysis = analyzeError("Something weird happened", "unknown");
      expect(analysis.category).toBe("UNKNOWN");
    });

    it("tracker les occurrences répétées", () => {
      const source = "testScraper";
      for (let i = 0; i < 5; i++) {
        analyzeError("ETIMEDOUT: timeout", source);
      }
      expect(getOccurrences(source, "SCRAPER_TIMEOUT")).toBe(5);
    });

    it("escalade la sévérité après 5 occurrences", () => {
      const source = "escalationTest";
      for (let i = 0; i < 5; i++) {
        analyzeError("ETIMEDOUT: timeout", source);
      }
      const analysis = analyzeError("ETIMEDOUT: timeout", source);
      expect(analysis.severity).toBe("HIGH");
    });
  });

  describe("proposeFix", () => {
    it("propose RESTART_SCRAPER pour un timeout", () => {
      const analysis = analyzeError("ETIMEDOUT", "scraper");
      const fix = proposeFix(analysis);
      expect(fix.action).toBe("RESTART_SCRAPER");
      expect(fix.autoExecutable).toBe(true);
      expect(fix.riskLevel).toBe("SAFE");
    });

    it("propose CLEAR_CACHE pour un rate limit", () => {
      const analysis = analyzeError("HTTP 429", "scraper");
      const fix = proposeFix(analysis);
      expect(fix.action).toBe("CLEAR_CACHE");
    });

    it("propose RESTART_BOT pour une fuite mémoire", () => {
      const analysis = analyzeError("heap out of memory", "process");
      const fix = proposeFix(analysis);
      expect(fix.action).toBe("RESTART_BOT");
      expect(fix.riskLevel).toBe("RISKY");
      expect(fix.autoExecutable).toBe(false);
    });

    it("propose RELOAD_MODULE pour un module crash", () => {
      const analysis = analyzeError("Cannot find module", "startup");
      const fix = proposeFix(analysis);
      expect(fix.action).toBe("RELOAD_MODULE");
    });

    it("propose ESCALATE_MANUAL pour une erreur inconnue", () => {
      const analysis = analyzeError("weird stuff", "unknown");
      const fix = proposeFix(analysis);
      expect(fix.action).toBe("ESCALATE_MANUAL");
      expect(fix.autoExecutable).toBe(false);
    });

    it("propose NO_ACTION pour une erreur de parsing", () => {
      const analysis = analyzeError("Unexpected token", "rss");
      const fix = proposeFix(analysis);
      expect(fix.action).toBe("NO_ACTION");
    });
  });

  describe("submitForValidation", () => {
    it("retourne approved=true quand l'admin confirme", async () => {
      const analysis = analyzeError("ETIMEDOUT", "scraper");
      const fix = proposeFix(analysis);
      const fakeInteraction = {
        user: { id: "admin123" },
      } as any;

      const result = await submitForValidation(fix, fakeInteraction);
      expect(result.approved).toBe(true);
      expect(result.executedAt).not.toBeNull();
    });

    it("retourne approved=false quand l'admin rejette", async () => {
      const { requestConfirmation } = await import("../utils/confirm.js");
      (requestConfirmation as any).mockResolvedValueOnce(false);

      const analysis = analyzeError("ETIMEDOUT", "scraper");
      const fix = proposeFix(analysis);
      const fakeInteraction = { user: { id: "admin123" } } as any;

      const result = await submitForValidation(fix, fakeInteraction);
      expect(result.approved).toBe(false);
      expect(result.executedAt).toBeNull();
    });
  });
});
