import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCallLlm, mockConfig, mockLogger } = vi.hoisted(() => ({
  mockCallLlm: vi.fn(),
  mockConfig: {
    openRouterModel: "nvidia/nemotron-3-ultra-550b-a55b:free",
    openRouterApiKey: "test-key",
    aiModerationTimeoutMs: 15_000,
  },
  mockLogger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("./aiGateway", () => ({ callLlm: mockCallLlm }));
vi.mock("../config", () => ({ config: mockConfig }));
vi.mock("../utils/logger", () => ({ default: mockLogger }));

import { analyzeToxicity, clearToxicityCache } from "./ai-moderation.js";

const mockAIResponse = (json: object) => {
  mockCallLlm.mockResolvedValueOnce({ content: JSON.stringify(json) });
};

describe("ai-moderation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearToxicityCache();
  });

  describe("analyzeToxicity", () => {
    it("should detect toxic content (hate_speech)", async () => {
      mockAIResponse({
        isToxic: true,
        category: "hate_speech",
        confidence: 0.95,
        explanation: "Contenu haineux",
      });
      const result = await analyzeToxicity("message haineux unique");
      expect(result.isToxic).toBe(true);
      expect(result.category).toBe("hate_speech");
      expect(result.confidence).toBe(0.95);
      expect(result.explanation).toBe("Contenu haineux");
    });

    it("should detect normal content", async () => {
      mockAIResponse({ isToxic: false, category: "normal", confidence: 0.99, explanation: "ok" });
      const result = await analyzeToxicity("bonjour tout le monde");
      expect(result.isToxic).toBe(false);
      expect(result.category).toBe("normal");
    });

    it("should use configured model", async () => {
      mockAIResponse({ isToxic: false, category: "normal", confidence: 0.9, explanation: "" });
      await analyzeToxicity("test model");
      expect(mockCallLlm).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "nvidia/nemotron-3-ultra-550b-a55b:free",
          maxTokens: 200,
          timeoutMs: 15_000,
        }),
      );
    });

    it("should return validation error when AI returns empty object", async () => {
      mockAIResponse({});
      const result = await analyzeToxicity("test defaults");
      expect(result.isToxic).toBe(false);
      expect(result.category).toBe("normal");
      expect(result.confidence).toBe(0);
      expect(result.explanation).toBe("Validation error");
    });

    it("should cache results (second call uses cache)", async () => {
      mockAIResponse({ isToxic: false, category: "normal", confidence: 0.8, explanation: "ok" });
      await analyzeToxicity("cache test message unique");
      expect(mockCallLlm).toHaveBeenCalledTimes(1);
      const result = await analyzeToxicity("cache test message unique");
      expect(mockCallLlm).toHaveBeenCalledTimes(1);
      expect(result.category).toBe("normal");
    });

    it("should fail-closed on API error", async () => {
      mockCallLlm.mockRejectedValueOnce(new Error("API down"));
      const result = await analyzeToxicity("test api error unique");
      expect(result.isToxic).toBe(true);
      expect(result.category).toBe("inappropriate");
      expect(result.explanation).toBe("Provider error — uncertain");
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it("should fail-closed on AbortError", async () => {
      const abortError = new Error("aborted");
      abortError.name = "AbortError";
      mockCallLlm.mockRejectedValueOnce(abortError);
      const result = await analyzeToxicity("test abort unique");
      expect(result.isToxic).toBe(true);
      expect(result.category).toBe("inappropriate");
      expect(result.explanation).toBe("Provider error — uncertain");
    });

    it("should fail-closed on malformed JSON", async () => {
      mockCallLlm.mockResolvedValueOnce({ content: "not valid json!!" });
      const result = await analyzeToxicity("test json unique");
      expect(result.isToxic).toBe(true);
      expect(result.category).toBe("inappropriate");
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
