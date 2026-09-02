/**
 * personalityMiddleware.test.ts — Persona généraliste
 */
import { describe, it, expect } from "vitest";
import {
  GENERALIST_PERSONA_PROMPT,
  HELLDIVER_PERSONA_PROMPT,
  PERSONALITY_TEMPERATURE,
  buildPersonalitySystemPrompt,
} from "./personalityMiddleware.js";

describe("personalityMiddleware", () => {
  it("keeps a light John identity without locking into military Helldiver RP", () => {
    expect(GENERALIST_PERSONA_PROMPT).toMatch(/IA généraliste/i);
    expect(GENERALIST_PERSONA_PROMPT).toMatch(/cuisine/i);
    expect(GENERALIST_PERSONA_PROMPT).toMatch(/code/i);
    expect(GENERALIST_PERSONA_PROMPT).not.toMatch(/IMPIToyABLE/i);
    expect(GENERALIST_PERSONA_PROMPT).not.toMatch(/Tu ne t'excuses JAMAIS/i);
    expect(GENERALIST_PERSONA_PROMPT).not.toMatch(/Pas de "Bonjour/i);
    expect(HELLDIVER_PERSONA_PROMPT).toBe(GENERALIST_PERSONA_PROMPT);
  });

  it("uses a competence-oriented temperature", () => {
    expect(PERSONALITY_TEMPERATURE).toBeLessThanOrEqual(0.75);
    expect(PERSONALITY_TEMPERATURE).toBeGreaterThanOrEqual(0.5);
  });

  it("prepends persona to short env prompts", () => {
    const prompt = buildPersonalitySystemPrompt("Réponds en français.");
    expect(prompt).toContain("IA généraliste");
    expect(prompt).toContain("Réponds en français.");
  });

  it("does not stack two full John identities", () => {
    const custom = "Tu es John, un bot custom très long ".repeat(20);
    expect(buildPersonalitySystemPrompt(custom)).toBe(custom);
  });
});
