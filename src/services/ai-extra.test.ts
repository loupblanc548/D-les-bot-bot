import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockOpenAI, mockConfig, mockLogger } = vi.hoisted(() => ({
  mockOpenAI: {
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  },
  mockConfig: {
    openRouterModel: "openai/gpt-4o",
    openRouterApiKey: "test-key",
  },
  mockLogger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("./ai", () => ({
  getOpenAIClient: () => mockOpenAI as unknown,
}));

vi.mock("../config", () => ({
  config: mockConfig,
}));

vi.mock("../utils/logger", () => ({ default: mockLogger }));

import {
  translateText,
  summarizeMessages,
  getSupportedLanguages,
  getLanguageName,
} from "./ai-extra.js";

describe("ai-extra", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===== getSupportedLanguages =====
  describe("getSupportedLanguages", () => {
    it("should return all supported languages", () => {
      const langs = getSupportedLanguages();
      expect(langs).toHaveProperty("fr", "Français");
      expect(langs).toHaveProperty("en", "Anglais");
      expect(langs).toHaveProperty("ja", "Japonais");
      expect(Object.keys(langs).length).toBe(15);
    });
  });

  // ===== getLanguageName =====
  describe("getLanguageName", () => {
    it("should return the language name for a valid code", () => {
      expect(getLanguageName("fr")).toBe("Français");
      expect(getLanguageName("en")).toBe("Anglais");
    });

    it("should return the code itself for an unknown code", () => {
      expect(getLanguageName("zz")).toBe("zz");
    });
  });

  // ===== translateText =====
  describe("translateText", () => {
    const mockTranslateResponse = (json: object) => {
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(json) } }],
      });
    };

    it("should translate text and detect source language", async () => {
      mockTranslateResponse({
        translation: "Bonjour le monde",
        detectedSource: "en",
      });

      const result = await translateText("Hello world", "fr");

      expect(result.translation).toBe("Bonjour le monde");
      expect(result.detectedSource).toBe("en");
      expect(result.targetLanguage).toBe("Français");
    });

    it("should use configured model", async () => {
      mockTranslateResponse({ translation: "Hola", detectedSource: "en" });

      await translateText("Hello", "es");

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({ model: "openai/gpt-4o" }),
        expect.any(Object),
      );
    });

    it("should handle JSON wrapped in markdown code fences", async () => {
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: '```json\n{"translation": "Salut", "detectedSource": "en"}\n```',
            },
          },
        ],
      });

      const result = await translateText("Hi", "fr");

      expect(result.translation).toBe("Salut");
      expect(result.detectedSource).toBe("en");
    });

    it("should fallback to raw text if JSON parsing fails", async () => {
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{ message: { content: "Just plain text, no JSON" } }],
      });

      const result = await translateText("Hello", "fr");

      expect(result.translation).toBe("Just plain text, no JSON");
      expect(result.detectedSource).toBe("inconnue");
    });

    it("should throw on API error", async () => {
      mockOpenAI.chat.completions.create.mockRejectedValueOnce(new Error("API down"));

      await expect(translateText("test", "fr")).rejects.toThrow("Erreur lors de la traduction");
    });

    it("should throw on AbortError (timeout)", async () => {
      const abortError = new Error("aborted");
      abortError.name = "AbortError";
      mockOpenAI.chat.completions.create.mockRejectedValueOnce(abortError);

      await expect(translateText("test", "fr")).rejects.toThrow(
        "La traduction a pris trop de temps",
      );
    });
  });

  // ===== summarizeMessages =====
  describe("summarizeMessages", () => {
    it("should summarize a conversation", async () => {
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{ message: { content: "📋 Résumé : discussion sur le projet" } }],
      });

      const result = await summarizeMessages([
        { author: "Alice", content: "Salut !" },
        { author: "Bob", content: "Ça va ?" },
      ]);

      expect(result).toBe("📋 Résumé : discussion sur le projet");
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({ model: "openai/gpt-4o" }),
        expect.any(Object),
      );
    });

    it("should format messages as [author]: content", async () => {
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{ message: { content: "Résumé" } }],
      });

      await summarizeMessages([
        { author: "Alice", content: "Message 1" },
        { author: "Bob", content: "Message 2" },
      ]);

      // Verify the conversation was formatted correctly in the prompt
      const callArgs = mockOpenAI.chat.completions.create.mock.calls[0][0];
      const userMessage = callArgs.messages[1].content as string;
      expect(userMessage).toContain("[Alice]: Message 1");
      expect(userMessage).toContain("[Bob]: Message 2");
    });

    it("should return fallback when AI returns empty response", async () => {
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{ message: { content: "" } }],
      });

      const result = await summarizeMessages([{ author: "Alice", content: "Hello" }]);

      expect(result).toBe("Impossible de générer un résumé.");
    });

    it("should throw on API error", async () => {
      mockOpenAI.chat.completions.create.mockRejectedValueOnce(new Error("API down"));

      await expect(summarizeMessages([{ author: "A", content: "test" }])).rejects.toThrow(
        "Erreur lors du résumé",
      );
    });

    it("should throw on AbortError (timeout)", async () => {
      const abortError = new Error("aborted");
      abortError.name = "AbortError";
      mockOpenAI.chat.completions.create.mockRejectedValueOnce(abortError);

      await expect(summarizeMessages([{ author: "A", content: "test" }])).rejects.toThrow(
        "Le résumé a pris trop de temps",
      );
    });
  });
});
