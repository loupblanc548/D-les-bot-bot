import { describe, expect, it } from "vitest";
import { ENCORE_UN_TEST_BOT_ID, isTesterBot, parseTesterBotIds } from "./testerBots.js";

describe("testerBots", () => {
  it("allows the encore-un-test bot by default", () => {
    expect(isTesterBot(ENCORE_UN_TEST_BOT_ID, {})).toBe(true);
    expect(isTesterBot("user-123", {})).toBe(false);
  });

  it("merges extra IDs from TESTER_BOT_IDS", () => {
    const ids = parseTesterBotIds({ TESTER_BOT_IDS: "111, 222" });
    expect(ids.has("111")).toBe(true);
    expect(ids.has("222")).toBe(true);
    expect(ids.has(ENCORE_UN_TEST_BOT_ID)).toBe(true);
  });
});
