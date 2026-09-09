import { describe, expect, it } from "vitest";
import {
  NETWORK_DEFENSE_ITEMS,
  buildNetworkDefenseEmbeds,
  findNetworkDefenseItem,
  formatNetworkDefenseForAgent,
} from "./networkDefenseBrief.js";

describe("networkDefenseBrief", () => {
  it("covers the seven named Kali techniques as defenses", () => {
    expect(NETWORK_DEFENSE_ITEMS.map((item) => item.id)).toEqual([
      "nmap",
      "hydra",
      "ettercap",
      "hashcat",
      "metasploit",
      "wifite",
      "searchsploit",
    ]);
  });

  it("never includes Kali attack command recipes", () => {
    const blob = JSON.stringify(NETWORK_DEFENSE_ITEMS) + formatNetworkDefenseForAgent();
    expect(blob).not.toMatch(/\bhydra -/);
    expect(blob).not.toMatch(/\bnmap -/);
    expect(blob).not.toMatch(/\bmsfconsole\b/);
    expect(blob).not.toMatch(/\bwifite --/);
    expect(blob).not.toMatch(/\| Date \|/);
  });

  it("builds a header plus one card per threat", () => {
    const embeds = buildNetworkDefenseEmbeds();
    expect(embeds).toHaveLength(8);
    expect(embeds[0].data.title).toBe("Défense réseau");
    expect(embeds[1].data.title).toBe("Nmap");
    expect(embeds[1].data.fields?.[1]?.name).toMatch(/protéger/i);
  });

  it("filters a single tool by name", () => {
    const item = findNetworkDefenseItem("Hydra");
    expect(item?.id).toBe("hydra");
    const embeds = buildNetworkDefenseEmbeds(item);
    expect(embeds).toHaveLength(2);
    expect(embeds[1].data.title).toBe("Hydra");
  });
});
