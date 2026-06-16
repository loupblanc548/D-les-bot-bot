"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const { mockOpenAI, mockConfig, mockLogger } = vitest_1.vi.hoisted(() => ({
    mockOpenAI: {
        chat: { completions: { create: vitest_1.vi.fn() } },
    },
    mockConfig: {
        openRouterModel: "openai/gpt-4o-mini",
        openRouterApiKey: "test-key",
    },
    mockLogger: { info: vitest_1.vi.fn(), error: vitest_1.vi.fn(), warn: vitest_1.vi.fn() },
}));
vitest_1.vi.mock("./ai", () => ({ getOpenAIClient: () => mockOpenAI }));
vitest_1.vi.mock("../config", () => ({ config: mockConfig }));
vitest_1.vi.mock("../utils/logger", () => ({ default: mockLogger }));
const ai_moderation_1 = require("./ai-moderation");
const mockAIResponse = (json) => {
    mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(json) } }],
    });
};
(0, vitest_1.describe)("ai-moderation", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        (0, ai_moderation_1.clearToxicityCache)();
    });
    (0, vitest_1.describe)("analyzeToxicity", () => {
        (0, vitest_1.it)("should detect toxic content (hate_speech)", async () => {
            mockAIResponse({ isToxic: true, category: "hate_speech", confidence: 0.95, explanation: "Contenu haineux" });
            const result = await (0, ai_moderation_1.analyzeToxicity)("message haineux unique");
            (0, vitest_1.expect)(result.isToxic).toBe(true);
            (0, vitest_1.expect)(result.category).toBe("hate_speech");
            (0, vitest_1.expect)(result.confidence).toBe(0.95);
            (0, vitest_1.expect)(result.explanation).toBe("Contenu haineux");
        });
        (0, vitest_1.it)("should detect normal content", async () => {
            mockAIResponse({ isToxic: false, category: "normal", confidence: 0.99, explanation: "ok" });
            const result = await (0, ai_moderation_1.analyzeToxicity)("bonjour tout le monde");
            (0, vitest_1.expect)(result.isToxic).toBe(false);
            (0, vitest_1.expect)(result.category).toBe("normal");
        });
        (0, vitest_1.it)("should use configured model", async () => {
            mockAIResponse({ isToxic: false, category: "normal", confidence: 0.9, explanation: "" });
            await (0, ai_moderation_1.analyzeToxicity)("test model");
            (0, vitest_1.expect)(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ model: "openai/gpt-4o-mini" }), vitest_1.expect.any(Object));
        });
        (0, vitest_1.it)("should return defaults when AI returns empty object", async () => {
            mockAIResponse({});
            const result = await (0, ai_moderation_1.analyzeToxicity)("test defaults");
            (0, vitest_1.expect)(result.isToxic).toBe(false);
            (0, vitest_1.expect)(result.category).toBe("normal");
            (0, vitest_1.expect)(result.confidence).toBe(0);
            (0, vitest_1.expect)(result.explanation).toBe("");
        });
        (0, vitest_1.it)("should cache results (second call uses cache)", async () => {
            mockAIResponse({ isToxic: false, category: "normal", confidence: 0.8, explanation: "ok" });
            await (0, ai_moderation_1.analyzeToxicity)("cache test message unique");
            (0, vitest_1.expect)(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
            const result = await (0, ai_moderation_1.analyzeToxicity)("cache test message unique");
            (0, vitest_1.expect)(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
            (0, vitest_1.expect)(result.category).toBe("normal");
        });
        (0, vitest_1.it)("should fail-open on API error", async () => {
            mockOpenAI.chat.completions.create.mockRejectedValueOnce(new Error("API down"));
            const result = await (0, ai_moderation_1.analyzeToxicity)("test api error unique");
            (0, vitest_1.expect)(result.isToxic).toBe(false);
            (0, vitest_1.expect)(result.category).toBe("normal");
            (0, vitest_1.expect)(result.explanation).toBe("Erreur API");
            (0, vitest_1.expect)(mockLogger.error).toHaveBeenCalled();
        });
        (0, vitest_1.it)("should fail-open on AbortError", async () => {
            const abortError = new Error("aborted");
            abortError.name = "AbortError";
            mockOpenAI.chat.completions.create.mockRejectedValueOnce(abortError);
            const result = await (0, ai_moderation_1.analyzeToxicity)("test abort unique");
            (0, vitest_1.expect)(result.isToxic).toBe(false);
            (0, vitest_1.expect)(result.category).toBe("normal");
            (0, vitest_1.expect)(result.explanation).toBe("Timeout");
        });
        (0, vitest_1.it)("should fail-open on malformed JSON", async () => {
            mockOpenAI.chat.completions.create.mockResolvedValueOnce({
                choices: [{ message: { content: "not valid json!!" } }],
            });
            const result = await (0, ai_moderation_1.analyzeToxicity)("test json unique");
            (0, vitest_1.expect)(result.isToxic).toBe(false);
            (0, vitest_1.expect)(result.category).toBe("normal");
            (0, vitest_1.expect)(mockLogger.error).toHaveBeenCalled();
        });
    });
});
//# sourceMappingURL=ai-moderation.test.js.map