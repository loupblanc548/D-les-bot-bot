/**
 * aiGateway.test.ts — Tests pour le gateway IA unifié
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("./groq.js", () => ({
  getActiveGroqModel: vi.fn(() => "llama-3.3-70b-versatile"),
  getGroqClient: vi.fn(() => ({
    chat: {
      completions: {
        create: vi.fn(async () => ({
          choices: [{ message: { content: "gateway response" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
        })),
      },
    },
  })),
  isGroqAvailable: vi.fn(() => true),
}));

vi.mock("./cerebras.js", () => ({
  getCerebrasClient: vi.fn(() => ({
    chat: {
      completions: {
        create: vi.fn(async () => ({
          choices: [{ message: { content: "fallback response" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        })),
      },
    },
  })),
  getCerebrasModel: vi.fn(() => "llama3.1-70b"),
  isCerebrasAvailable: vi.fn(() => true),
}));
import {
  MODEL_REGISTRY,
  getModelDescriptor,
  findModelsByCapability,
  calculateCost,
  recordUsage,
  getUsageSummary,
  setBudget,
  getBudget,
  checkBudget,
  selectModel,
  callLlm,
  markProviderAvailable,
  markProviderUnavailable,
  recordProviderCall,
  getProviderStatus,
  type TokenUsage,
  type LlmCallRequest,
} from "./aiGateway.js";

describe("aiGateway", () => {
  beforeEach(() => {
    // Reset provider statuses
    markProviderAvailable("nvidia-nim");
    markProviderAvailable("groq");
    markProviderAvailable("gemini");
    markProviderAvailable("local-llm");
  });

  describe("MODEL_REGISTRY", () => {
    it("should contain at least 4 models", () => {
      expect(MODEL_REGISTRY.length).toBeGreaterThanOrEqual(4);
    });

    it("each model should have required fields", () => {
      for (const model of MODEL_REGISTRY) {
        expect(model.id).toBeTruthy();
        expect(model.provider).toBeTruthy();
        expect(model.capabilities).toBeInstanceOf(Array);
        expect(model.maxTokens).toBeGreaterThan(0);
        expect(model.costPer1kInput).toBeGreaterThanOrEqual(0);
        expect(model.costPer1kOutput).toBeGreaterThanOrEqual(0);
        expect(model.timeoutMs).toBeGreaterThan(0);
      }
    });
  });

  describe("getModelDescriptor", () => {
    it("should return descriptor for known model", () => {
      const desc = getModelDescriptor("gemini-2.0-flash");
      expect(desc).not.toBeNull();
      expect(desc?.provider).toBe("gemini");
    });

    it("should return null for unknown model", () => {
      expect(getModelDescriptor("nonexistent-model")).toBeNull();
    });
  });

  describe("findModelsByCapability", () => {
    it("should find models with tool-calling", () => {
      const models = findModelsByCapability("tool-calling");
      expect(models.length).toBeGreaterThan(0);
      for (const m of models) {
        expect(m.capabilities).toContain("tool-calling");
      }
    });

    it("should find models with vision", () => {
      const models = findModelsByCapability("vision");
      expect(models.length).toBeGreaterThan(0);
      for (const m of models) {
        expect(m.capabilities).toContain("vision");
      }
    });
  });

  describe("calculateCost", () => {
    it("should calculate cost based on model and usage", () => {
      const usage: TokenUsage = {
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
      };
      const cost = calculateCost("gemini-2.0-flash", usage);
      expect(cost).toBeGreaterThan(0);
    });

    it("should return 0 for unknown model", () => {
      const usage: TokenUsage = { promptTokens: 100, completionTokens: 50, totalTokens: 150 };
      expect(calculateCost("unknown-model", usage)).toBe(0);
    });

    it("should return 0 for free local model", () => {
      const usage: TokenUsage = { promptTokens: 1000, completionTokens: 1000, totalTokens: 2000 };
      expect(calculateCost("local-llm", usage)).toBe(0);
    });
  });

  describe("provider status", () => {
    it("should track provider availability", () => {
      markProviderAvailable("groq");
      const status = getProviderStatus("groq");
      expect(status).not.toBeNull();
      expect(status?.available).toBe(true);
    });

    it("should track provider unavailability", () => {
      markProviderUnavailable("groq", "API key missing");
      const status = getProviderStatus("groq");
      expect(status?.available).toBe(false);
      expect(status?.lastError).toBe("API key missing");
    });

    it("should track call success/failure", () => {
      recordProviderCall("gemini", true, 500);
      recordProviderCall("gemini", true, 300);
      const status = getProviderStatus("gemini");
      expect(status?.totalCalls).toBe(2);
      expect(status?.totalFailures).toBe(0);
      expect(status?.avgLatencyMs).toBeGreaterThan(0);
    });
  });

  describe("budget", () => {
    it("should return default budget", () => {
      const budget = getBudget("test-user");
      expect(budget.dailyTokenLimit).toBeGreaterThan(0);
      expect(budget.dailyCostLimitEur).toBeGreaterThan(0);
    });

    it("should set custom budget", () => {
      setBudget("user:custom", { dailyTokenLimit: 50000 });
      const budget = getBudget("user:custom");
      expect(budget.dailyTokenLimit).toBe(50000);
    });

    it("should allow when within budget", () => {
      const result = checkBudget("new-user-123", "new-guild-456");
      expect(result.allowed).toBe(true);
    });
  });

  describe("selectModel", () => {
    it("should select a model with tool-calling capability", () => {
      const request: LlmCallRequest = {
        messages: [{ role: "user", content: "test" }],
        requireToolCalling: true,
      };
      const model = selectModel(request, ["gemini-2.0-flash", "local-llm"]);
      expect(model).not.toBeNull();
      expect(model?.capabilities).toContain("tool-calling");
    });

    it("should return null when no model matches capability", () => {
      const request: LlmCallRequest = {
        messages: [{ role: "user", content: "test" }],
        requireVision: true,
      };
      const model = selectModel(request, ["local-llm"]);
      expect(model).toBeNull();
    });
  });

  describe("centralized execution", () => {
    it("should return normalized provider usage and cost", async () => {
      const result = await callLlm({
        messages: [{ role: "user", content: "hello" }],
        providerOrder: ["groq"],
        userId: "gateway-success-user",
        commandName: "gateway-success",
      });

      expect(result.content).toBe("gateway response");
      expect(result.provider).toBe("groq");
      expect(result.usage).toEqual({ promptTokens: 12, completionTokens: 8, totalTokens: 20 });
      expect(result.fallbackCount).toBe(0);
      expect(result.costEur).toBeGreaterThan(0);
      expect(getUsageSummary({ commandName: "gateway-success" }).totalTokens).toBe(20);
    });

    it("should use the next provider after a failed provider", async () => {
      const groq = await import("./groq.js");
      vi.mocked(groq.getGroqClient).mockReturnValueOnce({
        chat: {
          completions: {
            create: vi.fn(async () => {
              throw new Error("429 rate limit");
            }),
          },
        },
      } as never);

      const result = await callLlm({
        messages: [{ role: "user", content: "fallback" }],
        providerOrder: ["groq", "cerebras"],
        userId: "gateway-fallback-user",
        commandName: "gateway-fallback",
      });

      expect(result.content).toBe("fallback response");
      expect(result.provider).toBe("cerebras");
      expect(result.fallbackCount).toBe(1);
      expect(result.fallbackReason).toBe("rate_limit");
    });
  });

  describe("usage tracking", () => {
    it("should record and retrieve usage", () => {
      recordUsage({
        timestamp: Date.now(),
        provider: "gemini",
        model: "gemini-2.0-flash",
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        costEur: 0.001,
        userId: "test-user",
        guildId: "test-guild",
        latencyMs: 500,
        success: true,
      });

      const summary = getUsageSummary({ userId: "test-user" });
      expect(summary.totalCalls).toBeGreaterThan(0);
      expect(summary.totalTokens).toBeGreaterThan(0);
    });
  });

  describe("global deadline (P0-2)", () => {
    it("should abort cascade when deadline is exceeded", async () => {
      // Make groq throw a timeout error, and with only one provider + deadline exceeded,
      // the cascade should abort with a deadline message
      const groq = await import("./groq.js");
      vi.mocked(groq.getGroqClient).mockReturnValueOnce({
        chat: {
          completions: {
            create: vi.fn(async () => {
              throw new Error("Request timed out");
            }),
          },
        },
      } as never);

      const result = callLlm({
        messages: [{ role: "user", content: "deadline test" }],
        providerOrder: ["groq"],
        deadlineMs: 10,
        maxRetries: 0,
        userId: "deadline-user",
        commandName: "deadline-test",
      });

      // With 1 provider that fails + deadline of 10ms, the cascade aborts
      await expect(result).rejects.toThrow(/failed|deadline/i);
    });
  });

  describe("3-provider cascade (P1-8)", () => {
    it("should cascade through 3 providers when first two fail", async () => {
      const groq = await import("./groq.js");
      const cerebras = await import("./cerebras.js");

      // Make groq fail
      vi.mocked(groq.getGroqClient).mockReturnValueOnce({
        chat: {
          completions: {
            create: vi.fn(async () => {
              throw new Error("500 server error");
            }),
          },
        },
      } as never);

      // Make cerebras fail
      vi.mocked(cerebras.getCerebrasClient).mockReturnValueOnce({
        chat: {
          completions: {
            create: vi.fn(async () => {
              throw new Error("503 overloaded");
            }),
          },
        },
      } as never);

      // sambanova should succeed — mock it
      vi.mock("./sambanova.js", () => ({
        getSambaNovaClient: vi.fn(() => ({
          chat: {
            completions: {
              create: vi.fn(async () => ({
                choices: [
                  { message: { content: "sambanova saved the day" }, finish_reason: "stop" },
                ],
                usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
              })),
            },
          },
        })),
        getSambaNovaModel: vi.fn(() => "llama3.1-405b"),
        isSambaNovaAvailable: vi.fn(() => true),
      }));

      // Re-import to pick up the sambanova mock
      vi.resetModules();
      const { callLlm: callLlmFresh, markProviderAvailable: markAvail } =
        await import("./aiGateway.js");
      markAvail("groq");
      markAvail("cerebras");
      markAvail("sambanova");

      const result = await callLlmFresh({
        messages: [{ role: "user", content: "cascade test" }],
        providerOrder: ["groq", "cerebras", "sambanova"],
        userId: "cascade-user",
        commandName: "cascade-test",
        maxRetries: 0,
      });

      expect(result.content).toBe("sambanova saved the day");
      expect(result.provider).toBe("sambanova");
      expect(result.fallbackCount).toBe(2);
    });
  });

  describe("budget exceeded (P1-8)", () => {
    it("should throw when budget is exceeded", async () => {
      setBudget("user:budget-test", { dailyTokenLimit: 0, dailyCostLimitEur: 0 });

      const result = callLlm({
        messages: [{ role: "user", content: "budget test" }],
        providerOrder: ["groq"],
        userId: "budget-test",
        commandName: "budget-test-cmd",
      });

      await expect(result).rejects.toThrow(/budget/i);
    });
  });
});
