/**
 * aiEvaluationSuite.test.ts — Tests pour le jeu d'évaluation
 */
import { describe, it, expect } from "vitest";
import { EVAL_CASES, runEvaluationSuite, type EvalRunner } from "./aiEvaluationSuite.js";

describe("aiEvaluationSuite", () => {
  describe("EVAL_CASES", () => {
    it("should have cases in all categories", () => {
      const categories = new Set(EVAL_CASES.map((c) => c.category));
      expect(categories.has("moderation")).toBe(true);
      expect(categories.has("tool_calling")).toBe(true);
      expect(categories.has("dangerous_refusal")).toBe(true);
      expect(categories.has("multilingual")).toBe(true);
      expect(categories.has("hallucination")).toBe(true);
      expect(categories.has("cost_latency")).toBe(true);
    });

    it("each case should have required fields", () => {
      for (const c of EVAL_CASES) {
        expect(c.id).toBeTruthy();
        expect(c.input).toBeTruthy();
        expect(c.expectedBehavior).toBeTruthy();
      }
    });
  });

  describe("runEvaluationSuite", () => {
    it("should run all cases and return summary", async () => {
      const mockRunner: EvalRunner = {
        runCase: async (input: string) => ({
          response: `Response to: ${input}`,
          action: "respond" as const,
          latencyMs: 100,
          costEur: 0.0001,
        }),
      };

      const result = await runEvaluationSuite(mockRunner);
      expect(result.results.length).toBe(EVAL_CASES.length);
      expect(result.summary.total).toBe(EVAL_CASES.length);
      expect(result.summary.avgScore).toBeGreaterThan(0);
    });

    it("should filter by category", async () => {
      const mockRunner: EvalRunner = {
        runCase: async () => ({
          response: "test",
          action: "respond" as const,
          latencyMs: 50,
          costEur: 0,
        }),
      };

      const result = await runEvaluationSuite(mockRunner, "moderation");
      expect(result.results.every((r) => r.category === "moderation")).toBe(true);
    });

    it("should handle runner errors", async () => {
      const mockRunner: EvalRunner = {
        runCase: async () => {
          throw new Error("API error");
        },
      };

      const result = await runEvaluationSuite(mockRunner, "moderation");
      expect(result.results.every((r) => !r.passed)).toBe(true);
      expect(result.summary.failed).toBe(result.summary.total);
    });
  });
});
