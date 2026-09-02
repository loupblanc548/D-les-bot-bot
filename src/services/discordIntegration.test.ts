/**
 * discordIntegration.test.ts — Tests d'intégration pour les interactions Discord
 *
 * Vérifie le comportement réel de reply, edit, fallback avec des mocks Discord
 * plus réalistes (sans mocker toutes les dépendances IA).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock logger
vi.mock("../utils/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock prisma
vi.mock("../prisma.js", () => ({
  default: {
    aiUsageLog: { create: vi.fn().mockResolvedValue({}), findMany: vi.fn().mockResolvedValue([]) },
    userMemory: { upsert: vi.fn().mockResolvedValue({}) },
    memoryFact: { upsert: vi.fn().mockResolvedValue({}) },
  },
}));

// Mock config
vi.mock("../config.js", () => ({
  config: {
    openRouterModel: "test-model",
    openRouterApiKey: "test-key",
    groqModel: "test-groq",
    geminiModel: "test-gemini",
    openaiModel: "test-openai",
    aiTimeoutMs: 30_000,
    aiModerationTimeoutMs: 15_000,
    hfApiKey: "test-hf",
  },
}));

// Mock aiGateway for moderation tests
const { mockCallLlm } = vi.hoisted(() => ({ mockCallLlm: vi.fn() }));
vi.mock("./aiGateway.js", () => ({ callLlm: mockCallLlm }));

import {
  classifyResponse,
  isErrorResponse,
  sanitizeResponse,
  FALLBACK_MESSAGE,
} from "./responseClassifier.js";
import { containsHallucinatedError } from "./chatResponder.js";

// Simulated Discord message
function createMockMessage(content: string, authorId = "123456789") {
  const replies: string[] = [];
  return {
    content,
    author: { id: authorId, username: "testuser", bot: false },
    guildId: "987654321",
    channelId: "555555555",
    client: { user: { id: "bot-id" } },
    reply: vi.fn(async (msg: string) => {
      replies.push(msg);
      return { edit: vi.fn(), delete: vi.fn() };
    }),
    channel: {
      send: vi.fn(async (msg: string) => {
        replies.push(msg);
        return { edit: vi.fn(), delete: vi.fn() };
      }),
      sendTyping: vi.fn(),
    },
    _replies: replies,
  };
}

describe("Discord Integration", () => {
  describe("response classification in Discord context", () => {
    it("classifies a normal Discord reply as valid", () => {
      const response = "Salut! Bienvenue sur le serveur!";
      expect(classifyResponse(response).category).toBe("valid");
      expect(isErrorResponse(response)).toBe(false);
    });

    it("detects hallucinated error in a Discord reply", () => {
      const response =
        "Désolé, tous les modèles IA sont temporairement indisponibles. Réessaie plus tard.";
      expect(containsHallucinatedError(response)).toBe(true);
      expect(isErrorResponse(response)).toBe(true);
    });

    it("detects technical error in a Discord reply", () => {
      const response = "CIRCUIT BREAKER ACTIVATED";
      expect(classifyResponse(response).category).toBe("technical_error");
      expect(isErrorResponse(response)).toBe(true);
    });

    it("sanitizes a mixed Discord reply (valid content + hallucinated line)", () => {
      const response =
        "Voici ta réponse!\nTous les modèles IA sont temporairement indisponibles\nJ'espère que ça t'aide!";
      const sanitized = sanitizeResponse(response);
      expect(sanitized).toContain("Voici ta réponse!");
      expect(sanitized).toContain("J'espère que ça t'aide!");
      expect(sanitized).not.toContain("temporairement indisponibles");
    });
  });

  describe("fallback message quality", () => {
    it("fallback message is conversational, not technical", () => {
      const msg: string = FALLBACK_MESSAGE;
      expect(msg).not.toContain("erreur");
      expect(msg).not.toContain("indisponible");
      expect(msg).not.toContain("modèle");
      expect(msg).not.toContain("API");
      expect(msg.length).toBeGreaterThan(20);
      expect(msg.toLowerCase()).toContain("go");
    });
  });

  describe("moderation fail-closed in Discord context", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("toxicity check returns isToxic=true on provider error (fail-closed)", async () => {
      const { analyzeToxicity, clearToxicityCache } = await import("./ai-moderation.js");
      clearToxicityCache();
      mockCallLlm.mockRejectedValueOnce(new Error("Provider down"));

      const result = await analyzeToxicity("some message unique test");
      expect(result.isToxic).toBe(true);
      expect(result.category).toBe("inappropriate");
      expect(result.explanation).toContain("Provider error");
    });

    it("spam detection returns uncertain on provider error (fail-closed)", async () => {
      const { detectSpamPhishing } = await import("./ai-moderation.js");
      mockCallLlm.mockRejectedValueOnce(new Error("Provider down"));

      const result = await detectSpamPhishing("check this spam message unique");
      expect(result.verdict).toBe("uncertain");
      expect(result.action).toBe("flag");
    });
  });
});
