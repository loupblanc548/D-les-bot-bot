/**
 * responseClassifier.test.ts — Tests pour le classifieur unique de réponses IA
 */

import { describe, it, expect } from "vitest";
import {
  classifyResponse,
  isErrorResponse,
  isHallucinatedError,
  isEmptyResponse,
  sanitizeResponse,
  FALLBACK_MESSAGE,
  isCannedFallback,
} from "./responseClassifier.js";

describe("responseClassifier", () => {
  describe("classifyResponse", () => {
    it("classifies empty string as empty", () => {
      expect(classifyResponse("").category).toBe("empty");
      expect(classifyResponse("   ").category).toBe("empty");
      expect(classifyResponse("a").category).toBe("empty"); // < 2 chars
    });

    it("classifies valid responses as valid", () => {
      expect(classifyResponse("Bonjour tout le monde!").category).toBe("valid");
      expect(classifyResponse("Voici la réponse à ta question.").category).toBe("valid");
    });

    it("classifies technical errors correctly", () => {
      expect(classifyResponse("Le serveur IA a rencontré un problème").category).toBe(
        "technical_error",
      );
      expect(classifyResponse("CIRCUIT BREAKER ACTIVATED").category).toBe("technical_error");
      expect(classifyResponse("Circuit breaker activated for groq").category).toBe(
        "technical_error",
      );
    });

    it("classifies hallucinated errors correctly", () => {
      expect(
        classifyResponse("Tous les modèles IA sont temporairement indisponibles").category,
      ).toBe("hallucinated_error");
      expect(classifyResponse("Les modèles d'IA sont temporairement indisponibles").category).toBe(
        "hallucinated_error",
      );
      expect(classifyResponse("Réessaie dans 1-2 minutes").category).toBe("hallucinated_error");
      expect(classifyResponse("Aucun modèle n'est disponible").category).toBe("hallucinated_error");
      expect(classifyResponse("quota/cooldown actif").category).toBe("hallucinated_error");
    });

    it("classifies canned blank-stare fallbacks", () => {
      expect(
        classifyResponse("Petit blanc de mon côté — redis-moi ce que tu voulais savoir ?").category,
      ).toBe("canned_fallback");
      expect(
        classifyResponse(
          "Je suis en pleine réflexion là. Repose ta question, je te réponds tout de suite.",
        ).category,
      ).toBe("canned_fallback");
      expect(classifyResponse(FALLBACK_MESSAGE).category).toBe("canned_fallback");
    });

    it("classifies 'circuit breaker activated' as technical error (case-insensitive)", () => {
      expect(classifyResponse("CIRCUIT BREAKER ACTIVATED").category).toBe("technical_error");
      expect(classifyResponse("circuit breaker activated").category).toBe("technical_error");
    });

    it("is case-insensitive for hallucinated errors", () => {
      expect(classifyResponse("TOUS LES MODÈLES IA SONT INDISPONIBLES").category).toBe(
        "hallucinated_error",
      );
    });
  });

  describe("isErrorResponse", () => {
    it("returns true for technical and hallucinated errors", () => {
      expect(isErrorResponse("Le serveur IA a rencontré un problème")).toBe(true);
      expect(isErrorResponse("Tous les modèles IA sont temporairement indisponibles")).toBe(true);
    });

    it("returns false for valid, true for empty", () => {
      expect(isErrorResponse("Bonjour!")).toBe(false);
      expect(isErrorResponse("")).toBe(true); // empty is now an error
    });
  });

  describe("isHallucinatedError", () => {
    it("returns true only for hallucinated errors", () => {
      expect(isHallucinatedError("Tous les modèles IA sont temporairement indisponibles")).toBe(
        true,
      );
      expect(isHallucinatedError("Le serveur IA a rencontré un problème")).toBe(false); // technical, not hallucinated
    });
  });

  describe("isEmptyResponse", () => {
    it("returns true for empty or very short text", () => {
      expect(isEmptyResponse("")).toBe(true);
      expect(isEmptyResponse("a")).toBe(true);
      expect(isEmptyResponse("ok")).toBe(false);
    });
  });

  describe("sanitizeResponse", () => {
    it("removes hallucinated error lines but keeps valid content", () => {
      const input =
        "Voici ma réponse.\nTous les modèles IA sont temporairement indisponibles\nFin de la réponse.";
      const result = sanitizeResponse(input);
      expect(result).toContain("Voici ma réponse.");
      expect(result).toContain("Fin de la réponse.");
      expect(result).not.toContain("temporairement indisponibles");
    });

    it("removes technical error lines", () => {
      const input = "CIRCUIT BREAKER ACTIVATED\nVoici la vraie réponse.";
      const result = sanitizeResponse(input);
      expect(result).not.toContain("CIRCUIT BREAKER");
      expect(result).toContain("Voici la vraie réponse.");
    });

    it("returns clean text unchanged", () => {
      expect(sanitizeResponse("Bonjour tout le monde!")).toBe("Bonjour tout le monde!");
    });

    it("unwraps leftover [ANALYSIS]/[RESPONSE]/[SUGGESTION] blocks", () => {
      const input =
        "[ANALYSIS] Le tool a trouvé 12C à Lyon.\n[RESPONSE] Il fait 12 degrés à Lyon.\n[SUGGESTION] Tu veux la météo demain ?";
      const result = sanitizeResponse(input);
      expect(result).toContain("Il fait 12 degrés à Lyon.");
      expect(result).toContain("Tu veux la météo demain");
      expect(result).not.toContain("[ANALYSIS]");
      expect(result).not.toContain("[RESPONSE]");
    });
  });

  describe("FALLBACK_MESSAGE", () => {
    it("is a non-technical conversational message", () => {
      expect(FALLBACK_MESSAGE).not.toContain("erreur");
      expect(FALLBACK_MESSAGE).not.toContain("indisponible");
      expect(FALLBACK_MESSAGE.length).toBeGreaterThan(20);
      expect(FALLBACK_MESSAGE.toLowerCase()).toContain("relance");
      expect(FALLBACK_MESSAGE.toLowerCase()).not.toContain("go");
    });

    it("is classified as canned fallback, not a valid model answer", () => {
      expect(classifyResponse(FALLBACK_MESSAGE).category).toBe("canned_fallback");
      expect(isErrorResponse(FALLBACK_MESSAGE)).toBe(true);
      expect(isCannedFallback(FALLBACK_MESSAGE)).toBe(true);
    });
  });
});
