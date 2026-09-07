import { describe, expect, it } from "vitest";
import { extractSpokenFacts, matchJohnWakeWord } from "./memoryHints.js";

describe("extractSpokenFacts", () => {
  it("picks games, nicknames and likes from casual French", () => {
    const facts = extractSpokenFacts(
      "Moi c'est LB, appelle-moi LB. Je joue à Fortnite et j'aime Minecraft.",
    );
    expect(facts.some((f) => f.key === "surnom" && /lb/i.test(f.value))).toBe(true);
    expect(facts.some((f) => f.key === "jeu" && /fortnite/i.test(f.value))).toBe(true);
    expect(facts.some((f) => f.key === "aime" && /minecraft/i.test(f.value))).toBe(true);
  });

  it("ignores empty or generic chatter", () => {
    expect(extractSpokenFacts("mdr ok")).toEqual([]);
    expect(extractSpokenFacts("je joue à pas")).toEqual([]);
  });
});

describe("matchJohnWakeWord", () => {
  it("hears John and strips the name", () => {
    expect(matchJohnWakeWord("hé John t'as vu la boutique")).toEqual({
      hit: true,
      prompt: "t'as vu la boutique",
    });
    expect(matchJohnWakeWord("John")).toEqual({
      hit: true,
      prompt: "on t'a appelé dans le vocal, réponds court",
    });
  });

  it("ignores talk that is not for him", () => {
    expect(matchJohnWakeWord("passe-moi le shotgun")).toEqual({ hit: false, prompt: "" });
  });
});
