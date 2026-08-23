/**
 * aiFallbackHelpers.test.ts — Tests pour les helpers de détection d'erreurs IA
 */
import { describe, it, expect } from "vitest";
import {
  isAiHallucinatedError,
  isStillError,
  DEFAULT_ERROR_MESSAGE,
} from "./aiFallbackHelpers.js";

describe("aiFallbackHelpers", () => {
  describe("isAiHallucinatedError", () => {
    it("should detect hallucinated error about model unavailability", () => {
      expect(isAiHallucinatedError("Tous les modèles IA sont temporairement indisponibles")).toBe(true);
      expect(isAiHallucinatedError("Les modèles IA sont temporairement en cooldown")).toBe(true);
    });

    it("should detect quota/cooldown hallucinations", () => {
      expect(isAiHallucinatedError("quota/cooldown atteint sur tous les providers")).toBe(true);
    });

    it("should detect retry suggestion hallucinations", () => {
      expect(isAiHallucinatedError("Réessaie dans 1-2 minutes")).toBe(true);
    });

    it("should not flag normal AI responses", () => {
      expect(isAiHallucinatedError("Bonjour ! Comment puis-je t'aider ?")).toBe(false);
      expect(isAiHallucinatedError("Voici les résultats de ta recherche.")).toBe(false);
      expect(isAiHallucinatedError("Le prix du Bitcoin est de 45000€")).toBe(false);
    });

    it("should not flag empty string as hallucinated error", () => {
      expect(isAiHallucinatedError("")).toBe(false);
    });
  });

  describe("isStillError", () => {
    it("should detect empty string as error", () => {
      expect(isStillError("")).toBe(true);
    });

    it("should detect known hardcoded error messages", () => {
      expect(isStillError("Le serveur IA a rencontré un problème")).toBe(true);
      expect(isStillError("Problème de communication avec le serveur IA")).toBe(true);
      expect(isStillError("Le serveur IA est sous forte charge")).toBe(true);
    });

    it("should detect circuit breaker messages", () => {
      expect(isStillError("CIRCUIT BREAKER ACTIVATED — L'agent a dépassé la limite")).toBe(true);
      expect(isStillError("Circuit breaker activated")).toBe(true);
    });

    it("should detect hallucinated errors", () => {
      expect(isStillError("Tous les modèles IA sont temporairement indisponibles")).toBe(true);
    });

    it("should not flag normal responses", () => {
      expect(isStillError("Voici ma réponse à ta question.")).toBe(false);
      expect(isStillError("J'ai analysé les données et voici les résultats.")).toBe(false);
    });
  });

  describe("DEFAULT_ERROR_MESSAGE", () => {
    it("should be a non-empty string", () => {
      expect(typeof DEFAULT_ERROR_MESSAGE).toBe("string");
      expect(DEFAULT_ERROR_MESSAGE.length).toBeGreaterThan(10);
    });

    it("should contain warning emoji", () => {
      expect(DEFAULT_ERROR_MESSAGE).toContain("⚠️");
    });
  });
});
