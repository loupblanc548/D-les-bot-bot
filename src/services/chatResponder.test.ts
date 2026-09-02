/**
 * chatResponder.test.ts — Tests pour le répondeur chatbot garanti
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./aiGateway.js", () => ({
  callLlm: vi.fn(),
  getProviderStatus: vi.fn(() => null),
}));
vi.mock("../utils/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../config.js", () => ({
  config: { aiSystemPrompt: "Tu es un bot utile.", aiTimeoutMs: 15000 },
}));

import { callLlm } from "./aiGateway.js";
import {
  respondChat,
  recoverChatReply,
  containsHallucinatedError,
  sanitizeResponse,
  orderProvidersBySpeed,
} from "./chatResponder.js";

const mockCallLlm = vi.mocked(callLlm);

describe("chatResponder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("containsHallucinatedError", () => {
    it("detects 'modèles IA temporairement indisponibles'", () => {
      expect(
        containsHallucinatedError("Tous les modèles IA sont temporairement indisponibles."),
      ).toBe(true);
    });

    it("detects circuit breaker mentions as error (not hallucination)", () => {
      // "CIRCUIT BREAKER ACTIVATED" is a technical error, not a hallucination
      expect(containsHallucinatedError("CIRCUIT BREAKER ACTIVATED for model")).toBe(false);
      // But "circuit breaker" alone (lowercase, in a sentence) is a hallucination
      expect(containsHallucinatedError("Le circuit breaker a coupé l'accès")).toBe(true);
    });

    it("detects quota/cooldown hallucinations", () => {
      expect(containsHallucinatedError("quota/cooldown en cours")).toBe(true);
    });

    it("does not flag normal responses", () => {
      expect(containsHallucinatedError("Bonjour ! Comment puis-je t'aider ?")).toBe(false);
    });
  });

  describe("sanitizeResponse", () => {
    it("removes hallucinated error lines but keeps content", () => {
      const dirty =
        "Voici la réponse utile.\nTous les modèles IA sont temporairement indisponibles.\nSuite utile.";
      const clean = sanitizeResponse(dirty);
      expect(clean).toContain("réponse utile");
      expect(clean).toContain("Suite utile");
      expect(clean).not.toContain("temporairement indisponibles");
    });
  });

  describe("orderProvidersBySpeed", () => {
    it("returns providers in base order when no stats", () => {
      const order = orderProvidersBySpeed();
      expect(order[0]).toBe("groq");
      expect(order).toContain("gemini");
    });
  });

  describe("respondChat", () => {
    it("returns provider content on success", async () => {
      mockCallLlm.mockResolvedValueOnce({
        content: "Salut soldat !",
        provider: "groq",
        model: "llama",
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        costEur: 0.0001,
        latencyMs: 300,
        finishReason: "stop",
        fallbackCount: 0,
      } as never);

      const result = await respondChat("Bonjour");
      expect(result.content).toBe("Salut soldat !");
      expect(result.provider).toBe("groq");
      expect(result.fromFallback).toBe(false);
    });

    it("retries when response is a hallucinated error", async () => {
      mockCallLlm
        .mockResolvedValueOnce({
          content: "Tous les modèles IA sont temporairement indisponibles.",
          provider: "groq",
          model: "llama",
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          costEur: 0,
          latencyMs: 200,
          finishReason: "stop",
          fallbackCount: 0,
        } as never)
        .mockResolvedValueOnce({
          content: "Réponse correcte finale",
          provider: "gemini",
          model: "flash",
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          costEur: 0,
          latencyMs: 400,
          finishReason: "stop",
          fallbackCount: 1,
        } as never);

      const result = await respondChat("Question ?");
      expect(result.content).toBe("Réponse correcte finale");
      expect(result.provider).toBe("gemini");
    });

    it("returns conversational fallback when everything fails — never a technical error", async () => {
      mockCallLlm.mockRejectedValue(new Error("All AI providers failed"));

      const result = await respondChat("Bonjour");
      expect(result.provider).toBe("fallback");
      expect(result.fromFallback).toBe(true);
      expect(result.content.length).toBeGreaterThan(10);
      expect(containsHallucinatedError(result.content)).toBe(false);
      expect(result.content).not.toContain("indisponible");
      expect(result.content).not.toContain("erreur");
    });

    it("returns fallback when retry also hallucinates", async () => {
      mockCallLlm
        .mockResolvedValueOnce({
          content: "Les modèles IA sont temporairement indisponibles",
          provider: "groq",
          model: "m",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          costEur: 0,
          latencyMs: 100,
          finishReason: "stop",
          fallbackCount: 0,
        } as never)
        .mockResolvedValueOnce({
          content: "quota/cooldown dépassé pour tous",
          provider: "gemini",
          model: "m",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          costEur: 0,
          latencyMs: 100,
          finishReason: "stop",
          fallbackCount: 1,
        } as never);

      const result = await respondChat("Test");
      expect(result.provider).toBe("fallback");
    });
  });

  describe("recoverChatReply", () => {
    it("keeps sanitized usable content without calling providers", async () => {
      const recovered = await recoverChatReply(
        "Voici la réponse utile.\nTous les modèles IA sont temporairement indisponibles.",
        "Question ?",
        { retryDelayMs: 0 },
      );
      expect(recovered).toContain("réponse utile");
      expect(recovered).not.toContain("temporairement indisponibles");
      expect(mockCallLlm).not.toHaveBeenCalled();
    });

    it("retries providers and returns a real answer", async () => {
      mockCallLlm.mockResolvedValueOnce({
        content: "Réponse après retry",
        provider: "groq",
        model: "llama",
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        costEur: 0,
        latencyMs: 200,
        finishReason: "stop",
        fallbackCount: 0,
      } as never);

      const recovered = await recoverChatReply("", "Quelle heure est-il ?", { retryDelayMs: 0 });
      expect(recovered).toBe("Réponse après retry");
    });

    it("returns canned fallback only after providers fail", async () => {
      mockCallLlm.mockRejectedValue(new Error("All AI providers failed"));

      const recovered = await recoverChatReply("", "Bonjour", { retryDelayMs: 0 });
      expect(recovered).toMatch(/petit blanc|repose/i);
    });
  });
});
