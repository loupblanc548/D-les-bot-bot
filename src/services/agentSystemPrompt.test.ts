/**
 * agentSystemPrompt.test.ts
 */
import { describe, it, expect } from "vitest";
import { buildAgentOperatingRules } from "./agentSystemPrompt.js";

describe("buildAgentOperatingRules", () => {
  const rules = buildAgentOperatingRules(42);

  it("does not force the old ANALYSIS/RESPONSE/SUGGESTION template", () => {
    expect(rules).not.toMatch(/FORMAT DE RÉPONSE OBLIGATOIRE/);
    expect(rules).toMatch(/pas de tags \[ANALYSIS\]/i);
  });

  it("frames the bot as a generalist with tools, not a military specialty", () => {
    expect(rules).toMatch(/IA généraliste/i);
    expect(rules).toContain("42");
    expect(rules).not.toMatch(/COMMANDANT/i);
    expect(rules).toMatch(/TYPE A/i);
  });
});
