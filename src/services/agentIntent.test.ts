/**
 * agentIntent.test.ts
 */
import { describe, it, expect } from "vitest";
import { isPresencePing, needsAgentLoop } from "./agentIntent.js";

describe("isPresencePing", () => {
  it("treats « tu es là » variants as a presence check, including the tu/est typo", () => {
    expect(isPresencePing("tu es là")).toBe(true);
    expect(isPresencePing("tu est la")).toBe(true);
    expect(isPresencePing("tu es là ?")).toBe(true);
    expect(isPresencePing("t'es là")).toBe(true);
    expect(isPresencePing("you there")).toBe(true);
    expect(isPresencePing("c'est quoi Docker")).toBe(false);
    expect(isPresencePing("tu es où exactement")).toBe(false);
  });
});

describe("needsAgentLoop", () => {
  it("lets short chit-chat skip the agent loop", () => {
    expect(needsAgentLoop("salut")).toBe(false);
    expect(needsAgentLoop("yo")).toBe(false);
    expect(needsAgentLoop("t'es là")).toBe(false);
    expect(needsAgentLoop("tu est la")).toBe(false);
    expect(needsAgentLoop("tu es là ?")).toBe(false);
  });

  it("sends real questions and tasks to the agent", () => {
    expect(needsAgentLoop("explique la relativité")).toBe(true);
    expect(needsAgentLoop("comment faire des pâtes carbonara")).toBe(true);
    expect(needsAgentLoop("c'est quoi un mutex")).toBe(true);
    expect(needsAgentLoop("écris un poème sur la pluie")).toBe(true);
    expect(needsAgentLoop("quel temps fait-il à Lyon ?")).toBe(true);
    expect(needsAgentLoop("cherche les sorties steam cette semaine")).toBe(true);
  });

  it("treats long messages, URLs and images as agent work", () => {
    expect(needsAgentLoop("a".repeat(81))).toBe(true);
    expect(needsAgentLoop("regarde https://example.com")).toBe(true);
    expect(needsAgentLoop("[Image jointe: https://cdn.discord.com/x.png]")).toBe(true);
  });
});
