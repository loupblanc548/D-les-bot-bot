/**
 * citationEnforcer.test.ts — Tests pour le système de citations
 */
import { describe, it, expect } from "vitest";
import { extractCitations, verifyCitations, type Citation } from "./citationEnforcer.js";

describe("citationEnforcer", () => {
  const sources: Citation[] = [
    { source: "Wikipedia", url: "https://en.wikipedia.org/wiki/Test", relevanceScore: 0.9 },
    { source: "GitHub Docs", url: "https://docs.github.com/" },
  ];

  describe("extractCitations", () => {
    it("should append citations when none exist", () => {
      const result = extractCitations("Here is some info.", sources);
      expect(result.hasCitations).toBe(true);
      expect(result.content).toContain("Sources");
      expect(result.content).toContain("Wikipedia");
      expect(result.citations).toHaveLength(2);
    });

    it("should keep inline citations if present", () => {
      const content = "Some fact [1] and another [2].";
      const result = extractCitations(content, sources);
      expect(result.hasCitations).toBe(true);
      expect(result.content).toBe(content);
    });

    it("should return no citations when sources empty", () => {
      const result = extractCitations("Hello", []);
      expect(result.hasCitations).toBe(false);
      expect(result.citations).toHaveLength(0);
    });
  });

  describe("verifyCitations", () => {
    it("should pass when citations present", () => {
      const result = verifyCitations("Info [1]\n\nSources:\n[1] Wiki", sources);
      expect(result.valid).toBe(true);
    });

    it("should fail when no citations but sources expected", () => {
      const result = verifyCitations("Just a response", sources);
      expect(result.valid).toBe(false);
      expect(result.missing).toBe(2);
    });

    it("should pass when no sources expected", () => {
      const result = verifyCitations("Hello", []);
      expect(result.valid).toBe(true);
    });
  });
});
