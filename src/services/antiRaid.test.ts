import { describe, it, expect } from "vitest";
import {
  checkJoinBurst,
  checkMessageSimilarity,
  resetRaidTracking,
  DEFAULT_RAID_CONFIG,
} from "./antiRaid.js";

describe("antiRaid", () => {
  it("does not trigger on single join", () => {
    resetRaidTracking();
    const member = { user: { createdTimestamp: Date.now() - 999_999_999, tag: "old#0001" } } as any;
    const result = checkJoinBurst(member, { ...DEFAULT_RAID_CONFIG, joinThreshold: 10 });
    expect(result).toBeNull();
  });

  it("detects join burst", () => {
    resetRaidTracking();
    const config = { ...DEFAULT_RAID_CONFIG, joinThreshold: 3, joinWindowMs: 10_000 };
    const member = {
      user: { createdTimestamp: Date.now() - 999_999_999, tag: "user#0001" },
    } as any;
    checkJoinBurst(member, config);
    checkJoinBurst(member, config);
    const result = checkJoinBurst(member, config);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("join_burst");
  });

  it("detects new accounts", () => {
    resetRaidTracking();
    const member = { user: { createdTimestamp: Date.now() - 1000, tag: "newbie#0001" } } as any;
    const result = checkJoinBurst(member, DEFAULT_RAID_CONFIG);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("new_accounts");
  });

  it("detects message similarity spam", () => {
    resetRaidTracking();
    const msg1 = { content: "free nitro click here", author: { id: "1" } } as any;
    const msg2 = { content: "free nitro click here now", author: { id: "2" } } as any;
    const msg3 = { content: "free nitro click here", author: { id: "3" } } as any;
    const msg4 = { content: "free nitro click here", author: { id: "4" } } as any;

    checkMessageSimilarity(msg1);
    checkMessageSimilarity(msg2);
    checkMessageSimilarity(msg3);
    const result = checkMessageSimilarity(msg4);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("message_spam");
  });

  it("does not trigger on diverse messages", () => {
    resetRaidTracking();
    const msg1 = { content: "hello world", author: { id: "1" } } as any;
    const msg2 = { content: "how are you today", author: { id: "2" } } as any;
    const msg3 = { content: "totally different content", author: { id: "3" } } as any;
    const msg4 = { content: "another unique message", author: { id: "4" } } as any;

    checkMessageSimilarity(msg1);
    checkMessageSimilarity(msg2);
    checkMessageSimilarity(msg3);
    const result = checkMessageSimilarity(msg4);
    expect(result).toBeNull();
  });
});
