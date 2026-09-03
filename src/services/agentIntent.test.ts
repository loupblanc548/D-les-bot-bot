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

  it("treats URLs, images and very long briefs as agent work — not every medium message", () => {
    expect(needsAgentLoop("a".repeat(26))).toBe(false);
    expect(needsAgentLoop("a".repeat(801))).toBe(true);
    expect(needsAgentLoop("regarde https://example.com")).toBe(true);
    expect(needsAgentLoop("[Image jointe: https://cdn.discord.com/x.png]")).toBe(true);
  });

  it("ignores the Discord language prefix so chit-chat is not forced into tools", () => {
    const prefix =
      "[LANGUAGE INSTRUCTION] The user is writing in français. You MUST respond in français. Always reply in the same language as the user's message.\n\n";
    expect(needsAgentLoop(`${prefix}pingok`)).toBe(false);
    expect(needsAgentLoop(`${prefix}ok merci john continue comme ca`)).toBe(false);
    expect(needsAgentLoop(`${prefix}capitale de l'Allemagne ?`)).toBe(true);
    expect(needsAgentLoop(`${prefix}cherche le repo nmap`)).toBe(true);
  });
});
