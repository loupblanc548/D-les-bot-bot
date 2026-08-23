/**
 * responseQualityCheck.test.ts — Tests pour l'évaluation qualité post-réponse
 */

import { describe, it, expect } from "vitest";
import { evaluateResponseQuality } from "./responseQualityCheck.js";

describe("responseQualityCheck", () => {
  it("returns perfect score for a valid French response", () => {
    const result = evaluateResponseQuality(
      "Bonjour! Voici la réponse à ta question. J'espère que ça t'aide!",
    );
    expect(result.score).toBe(1);
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("detects empty response", () => {
    const result = evaluateResponseQuality("");
    expect(result.issues).toContainEqual(expect.objectContaining({ type: "empty" }));
    expect(result.passed).toBe(false);
  });

  it("detects wrong language (English when French expected)", () => {
    const result = evaluateResponseQuality(
      "The quick brown fox jumps over the lazy dog. This is a test of the system.",
      { expectedLanguage: "fr" },
    );
    expect(result.issues).toContainEqual(expect.objectContaining({ type: "wrong_language" }));
  });

  it("detects hallucinated error", () => {
    const result = evaluateResponseQuality("Tous les modèles IA sont temporairement indisponibles");
    expect(result.issues).toContainEqual(expect.objectContaining({ type: "hallucination" }));
    expect(result.passed).toBe(false);
  });

  it("detects too long response", () => {
    const longResponse = "a".repeat(5000);
    const result = evaluateResponseQuality(longResponse, { maxLength: 4000 });
    expect(result.issues).toContainEqual(expect.objectContaining({ type: "too_long" }));
  });

  it("detects missing citation when web search was used", () => {
    const result = evaluateResponseQuality("Voici la réponse sans référence.", {
      usedWebSearch: true,
    });
    expect(result.issues).toContainEqual(expect.objectContaining({ type: "missing_citation" }));
  });

  it("does not flag missing citation when source is present", () => {
    const result = evaluateResponseQuality("Selon https://example.com, voici la réponse.", {
      usedWebSearch: true,
    });
    expect(result.issues).not.toContainEqual(expect.objectContaining({ type: "missing_citation" }));
  });

  it("detects excessive repetition", () => {
    const result = evaluateResponseQuality(
      "test test test test test test test test test test test test test test test test",
    );
    expect(result.issues).toContainEqual(expect.objectContaining({ type: "repetition" }));
  });
});
