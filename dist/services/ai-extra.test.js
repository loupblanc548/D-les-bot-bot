"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const { mockOpenAI, mockConfig, mockLogger } = vitest_1.vi.hoisted(() => ({
    mockOpenAI: {
        chat: {
            completions: {
                create: vitest_1.vi.fn(),
            },
        },
    },
    mockConfig: {
        openRouterModel: "openai/gpt-4o",
        openRouterApiKey: "test-key",
    },
    mockLogger: {
        info: vitest_1.vi.fn(),
        error: vitest_1.vi.fn(),
        warn: vitest_1.vi.fn(),
    },
}));
vitest_1.vi.mock("./ai", () => ({
    getOpenAIClient: () => mockOpenAI,
}));
vitest_1.vi.mock("../config", () => ({
    config: mockConfig,
}));
vitest_1.vi.mock("../utils/logger", () => ({ default: mockLogger }));
const ai_extra_1 = require("./ai-extra");
(0, vitest_1.describe)("ai-extra", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    // ===== getSupportedLanguages =====
    (0, vitest_1.describe)("getSupportedLanguages", () => {
        (0, vitest_1.it)("should return all supported languages", () => {
            const langs = (0, ai_extra_1.getSupportedLanguages)();
            (0, vitest_1.expect)(langs).toHaveProperty("fr", "Français");
            (0, vitest_1.expect)(langs).toHaveProperty("en", "Anglais");
            (0, vitest_1.expect)(langs).toHaveProperty("ja", "Japonais");
            (0, vitest_1.expect)(Object.keys(langs).length).toBe(15);
        });
    });
    // ===== getLanguageName =====
    (0, vitest_1.describe)("getLanguageName", () => {
        (0, vitest_1.it)("should return the language name for a valid code", () => {
            (0, vitest_1.expect)((0, ai_extra_1.getLanguageName)("fr")).toBe("Français");
            (0, vitest_1.expect)((0, ai_extra_1.getLanguageName)("en")).toBe("Anglais");
        });
        (0, vitest_1.it)("should return the code itself for an unknown code", () => {
            (0, vitest_1.expect)((0, ai_extra_1.getLanguageName)("zz")).toBe("zz");
        });
    });
    // ===== translateText =====
    (0, vitest_1.describe)("translateText", () => {
        const mockTranslateResponse = (json) => {
            mockOpenAI.chat.completions.create.mockResolvedValueOnce({
                choices: [{ message: { content: JSON.stringify(json) } }],
            });
        };
        (0, vitest_1.it)("should translate text and detect source language", async () => {
            mockTranslateResponse({
                translation: "Bonjour le monde",
                detectedSource: "en",
            });
            const result = await (0, ai_extra_1.translateText)("Hello world", "fr");
            (0, vitest_1.expect)(result.translation).toBe("Bonjour le monde");
            (0, vitest_1.expect)(result.detectedSource).toBe("en");
            (0, vitest_1.expect)(result.targetLanguage).toBe("Français");
        });
        (0, vitest_1.it)("should use configured model", async () => {
            mockTranslateResponse({ translation: "Hola", detectedSource: "en" });
            await (0, ai_extra_1.translateText)("Hello", "es");
            (0, vitest_1.expect)(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ model: "openai/gpt-4o" }), vitest_1.expect.any(Object));
        });
        (0, vitest_1.it)("should handle JSON wrapped in markdown code fences", async () => {
            mockOpenAI.chat.completions.create.mockResolvedValueOnce({
                choices: [
                    {
                        message: {
                            content: '```json\n{"translation": "Salut", "detectedSource": "en"}\n```',
                        },
                    },
                ],
            });
            const result = await (0, ai_extra_1.translateText)("Hi", "fr");
            (0, vitest_1.expect)(result.translation).toBe("Salut");
            (0, vitest_1.expect)(result.detectedSource).toBe("en");
        });
        (0, vitest_1.it)("should fallback to raw text if JSON parsing fails", async () => {
            mockOpenAI.chat.completions.create.mockResolvedValueOnce({
                choices: [{ message: { content: "Just plain text, no JSON" } }],
            });
            const result = await (0, ai_extra_1.translateText)("Hello", "fr");
            (0, vitest_1.expect)(result.translation).toBe("Just plain text, no JSON");
            (0, vitest_1.expect)(result.detectedSource).toBe("inconnue");
        });
        (0, vitest_1.it)("should throw on API error", async () => {
            mockOpenAI.chat.completions.create.mockRejectedValueOnce(new Error("API down"));
            await (0, vitest_1.expect)((0, ai_extra_1.translateText)("test", "fr")).rejects.toThrow("Erreur lors de la traduction");
        });
        (0, vitest_1.it)("should throw on AbortError (timeout)", async () => {
            const abortError = new Error("aborted");
            abortError.name = "AbortError";
            mockOpenAI.chat.completions.create.mockRejectedValueOnce(abortError);
            await (0, vitest_1.expect)((0, ai_extra_1.translateText)("test", "fr")).rejects.toThrow("La traduction a pris trop de temps");
        });
    });
    // ===== summarizeMessages =====
    (0, vitest_1.describe)("summarizeMessages", () => {
        (0, vitest_1.it)("should summarize a conversation", async () => {
            mockOpenAI.chat.completions.create.mockResolvedValueOnce({
                choices: [{ message: { content: "📋 Résumé : discussion sur le projet" } }],
            });
            const result = await (0, ai_extra_1.summarizeMessages)([
                { author: "Alice", content: "Salut !" },
                { author: "Bob", content: "Ça va ?" },
            ]);
            (0, vitest_1.expect)(result).toBe("📋 Résumé : discussion sur le projet");
            (0, vitest_1.expect)(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ model: "openai/gpt-4o" }), vitest_1.expect.any(Object));
        });
        (0, vitest_1.it)("should format messages as [author]: content", async () => {
            mockOpenAI.chat.completions.create.mockResolvedValueOnce({
                choices: [{ message: { content: "Résumé" } }],
            });
            await (0, ai_extra_1.summarizeMessages)([
                { author: "Alice", content: "Message 1" },
                { author: "Bob", content: "Message 2" },
            ]);
            // Verify the conversation was formatted correctly in the prompt
            const callArgs = mockOpenAI.chat.completions.create.mock.calls[0][0];
            const userMessage = callArgs.messages[1].content;
            (0, vitest_1.expect)(userMessage).toContain("[Alice]: Message 1");
            (0, vitest_1.expect)(userMessage).toContain("[Bob]: Message 2");
        });
        (0, vitest_1.it)("should return fallback when AI returns empty response", async () => {
            mockOpenAI.chat.completions.create.mockResolvedValueOnce({
                choices: [{ message: { content: "" } }],
            });
            const result = await (0, ai_extra_1.summarizeMessages)([
                { author: "Alice", content: "Hello" },
            ]);
            (0, vitest_1.expect)(result).toBe("Impossible de générer un résumé.");
        });
        (0, vitest_1.it)("should throw on API error", async () => {
            mockOpenAI.chat.completions.create.mockRejectedValueOnce(new Error("API down"));
            await (0, vitest_1.expect)((0, ai_extra_1.summarizeMessages)([{ author: "A", content: "test" }])).rejects.toThrow("Erreur lors du résumé");
        });
        (0, vitest_1.it)("should throw on AbortError (timeout)", async () => {
            const abortError = new Error("aborted");
            abortError.name = "AbortError";
            mockOpenAI.chat.completions.create.mockRejectedValueOnce(abortError);
            await (0, vitest_1.expect)((0, ai_extra_1.summarizeMessages)([{ author: "A", content: "test" }])).rejects.toThrow("Le résumé a pris trop de temps");
        });
    });
});
//# sourceMappingURL=ai-extra.test.js.map