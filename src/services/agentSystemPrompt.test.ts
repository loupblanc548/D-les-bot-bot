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

  it("tells John to use tools and memory instead of slash menus", () => {
    expect(rules).toMatch(/searchUserMemory/);
    expect(rules).toMatch(/saveMemoryFact/);
    expect(rules).toMatch(/Ne dis pas « utilise \/\… »/);
  });

  it("explains that John cannot create a Discord guild and must use setup_basic_server", () => {
    expect(rules).toMatch(/setup_basic_server/);
    expect(rules).toMatch(/interdit à un bot de créer le serveur/);
  });

  it("exposes internet search and network OSINT in chat", () => {
    expect(rules).toMatch(/exa_web_search/);
    expect(rules).toMatch(/OSINT RÉSEAU/);
    expect(rules).toMatch(/dns_lookup/);
    expect(rules).toMatch(/whois_lookup/);
    expect(rules).toMatch(/Pas de scan de ports/);
  });
});
