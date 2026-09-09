import { describe, it, expect } from "vitest";
import { detectAmbiguity } from "./agentPlanner.js";

describe("detectAmbiguity — moderation history vs sanction action", () => {
  it("does not ask who to punish when the user wants sanction logs", () => {
    expect(
      detectAmbiguity(
        "presente-moi les logs de sanctions des gens du serveur : bans, timeouts, kicks, mutes",
      ),
    ).toBeNull();
    expect(detectAmbiguity("montre le casier judiciaire")).toBeNull();
    expect(detectAmbiguity("historique des bans et timeouts")).toBeNull();
  });

  it("still asks for a target when the user wants to apply a ban", () => {
    const qs = detectAmbiguity("ban ce type pour spam");
    expect(qs?.some((q) => /sanctionner/i.test(q))).toBe(true);
  });
});
