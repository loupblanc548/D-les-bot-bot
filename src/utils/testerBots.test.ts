import { describe, expect, it } from "vitest";
import { isTesterBot, parseTesterBotIds } from "./testerBots.js";

describe("testerBots", () => {
  it("allows the encore-un-test bot by default", () => {
    expect(isTesterBot("1321693294933180538", {})).toBe(true);
    expect(isTesterBot("user-123", {})).toBe(false);
  });

  it("merges extra IDs from TESTER_BOT_IDS", () => {
    const ids = parseTesterBotIds({ TESTER_BOT_IDS: "111, 222" });
    expect(ids.has("111")).toBe(true);
    expect(ids.has("222")).toBe(true);
    expect(ids.has("1321693294933180538")).toBe(true);
  });
});
