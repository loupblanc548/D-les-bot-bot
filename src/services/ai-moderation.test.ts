import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockOpenAI, mockConfig, mockLogger } = vi.hoisted(() => ({
  mockOpenAI: {
    chat: { completions: { create: vi.fn() } },
  },
  mockConfig: {
    openRouterModel: "openai/gpt-4o-mini",
    openRouterApiKey: "test-key",
  },
  mockLogger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("./ai", () => ({ getOpenAIClient: () => mockOpenAI as unknown }));
vi.mock("../config", () => ({ config: mockConfig }));
vi.mock("../utils/logger", () => ({ default: mockLogger }));

import { analyzeToxicity, clearToxicityCache } from "./ai-moderation.js";

const mockAIResponse = (json: object) => {
  mockOpenAI.chat.completions.create.mockResolvedValueOnce({
    choices: [{ message: { content: JSON.stringify(json) } }],
  });
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
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({ model: "openai/gpt-4o-mini" }),
        expect.any(Object),
      );
    });

    it("should return defaults when AI returns empty object", async () => {
      mockAIResponse({});
      const result = await analyzeToxicity("test defaults");
      expect(result.isToxic).toBe(false);
      expect(result.category).toBe("normal");
      expect(result.confidence).toBe(0);
      expect(result.explanation).toBe("");
    });

    it("should cache results (second call uses cache)", async () => {
      mockAIResponse({ isToxic: false, category: "normal", confidence: 0.8, explanation: "ok" });
      await analyzeToxicity("cache test message unique");
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
      const result = await analyzeToxicity("cache test message unique");
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
      expect(result.category).toBe("normal");
    });

    it("should fail-open on API error", async () => {
      mockOpenAI.chat.completions.create.mockRejectedValueOnce(new Error("API down"));
      const result = await analyzeToxicity("test api error unique");
      expect(result.isToxic).toBe(false);
      expect(result.category).toBe("normal");
      expect(result.explanation).toBe("Erreur API");
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it("should fail-open on AbortError", async () => {
      const abortError = new Error("aborted");
      abortError.name = "AbortError";
      mockOpenAI.chat.completions.create.mockRejectedValueOnce(abortError);
      const result = await analyzeToxicity("test abort unique");
      expect(result.isToxic).toBe(false);
      expect(result.category).toBe("normal");
      expect(result.explanation).toBe("Timeout");
    });

    it("should fail-open on malformed JSON", async () => {
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{ message: { content: "not valid json!!" } }],
      });
      const result = await analyzeToxicity("test json unique");
      expect(result.isToxic).toBe(false);
      expect(result.category).toBe("normal");
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
