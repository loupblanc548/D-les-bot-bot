/**
 * aiConversation.test.ts — Tests du parsing d'extraction faits/liens.
 */
import { describe, it, expect } from "vitest";
import { parseExtractionJson } from "./aiConversation.js";

describe("parseExtractionJson", () => {
  it("parses valid facts and links", () => {
    const raw = JSON.stringify({
      facts: [
        { key: "jeu_prefere", value: "Hades II", category: "game" },
        { key: "plateforme", value: "PC Steam", category: "game" },
      ],
      links: [{ source: "jeu_prefere", target: "plateforme", relation: "joue_sur" }],
    });

    const result = parseExtractionJson(raw);
    expect(result.facts).toHaveLength(2);
    expect(result.facts[0]?.key).toBe("jeu_prefere");
    expect(result.links).toHaveLength(1);
    expect(result.links[0]?.relation).toBe("joue_sur");
  });

  it("extracts JSON surrounded by markdown prose", () => {
    const raw =
      'Voici le résultat:\n```json\n{"facts":[{"key":"langue","value":"français","category":"preference"}],"links":[]}\n```\nFin.';
    const result = parseExtractionJson(raw);
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]?.value).toBe("français");
  });

  it("filters links that reference unknown fact keys", () => {
    const raw = JSON.stringify({
      facts: [
        { key: "a", value: "A", category: "other" },
        { key: "b", value: "B", category: "other" },
      ],
      links: [
        { source: "a", target: "b", relation: "connait" },
        { source: "x", target: "y", relation: "ignore" },
      ],
    });
    const result = parseExtractionJson(raw);
    expect(result.links).toHaveLength(1);
    expect(result.links[0]?.target).toBe("b");
  });

  it("caps facts at 5 and links at 8", () => {
    const facts = Array.from({ length: 10 }, (_, i) => ({
      key: `k${i}`,
      value: `v${i}`,
      category: "other",
    }));
    const links = Array.from({ length: 12 }, (_, i) => ({
      source: `k${i % 5}`,
      target: `k${(i + 1) % 5}`,
      relation: "rel",
    }));
    const result = parseExtractionJson(JSON.stringify({ facts, links }));
    expect(result.facts).toHaveLength(5);
    expect(result.links).toHaveLength(8);
  });

  it("returns empty result for invalid JSON", () => {
    expect(parseExtractionJson("pas de json ici")).toEqual({ facts: [], links: [] });
  });

  it("defaults unknown categories to other", () => {
    const raw = JSON.stringify({
      facts: [{ key: "x", value: "y", category: "invalid_cat" }],
      links: [],
    });
    const result = parseExtractionJson(raw);
    expect(result.facts[0]?.category).toBe("other");
  });
});
