import { describe, it, expect } from "vitest";
import { detectPrefetchableTool } from "./toolPrefetch.js";

describe("detectPrefetchableTool — casier", () => {
  it("prefetches getUserInfo for server-wide sanction logs even with the language prefix", () => {
    const prefix =
      "[LANGUAGE INSTRUCTION] The user is writing in français. You MUST respond in français. Always reply in the same language as the user's message.\n\n";
    const hit = detectPrefetchableTool(
      `${prefix}<@1512435587926200391> presente-moi les logs de sanctions des gens du serveur : bans, timeouts, kicks, mutes, le casier. Ne sanctionne personne.`,
    );
    expect(hit?.toolName).toBe("getUserInfo");
    expect(hit?.args).toEqual({});
  });

  it("passes a mentioned user id when asking for one casier", () => {
    const hit = detectPrefetchableTool("casier de <@620589482185457674>");
    expect(hit?.toolName).toBe("getUserInfo");
    expect(hit?.args).toEqual({ userId: "620589482185457674" });
  });

  it("does not prefetch getUserInfo for an actual ban order", () => {
    expect(detectPrefetchableTool("ban ce type pour spam")).toBeNull();
  });
});
