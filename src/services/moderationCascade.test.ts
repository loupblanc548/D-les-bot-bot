/**
 * moderationCascade.test.ts — Tests pour la cascade de modération
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("./localLlm.js", () => ({
  isLocalLlmAvailable: () => false,
}));
vi.mock("./gemini.js", () => ({
  isGeminiAvailable: () => false,
  chatWithGemini: vi.fn(),
}));
vi.mock("../utils/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { moderate, type ModerationInput } from "./moderationCascade.js";

describe("moderationCascade", () => {
  const baseInput: ModerationInput = {
    content: "Hello world",
    userId: "123",
    guildId: "456",
    channelType: "text",
    isBot: false,
    hasAttachments: false,
    accountAgeDays: 100,
  };

  describe("deterministic level (L1)", () => {
    it("should allow clean messages", async () => {
      const result = await moderate(baseInput);
      expect(result.action).toBe("allow");
      expect(result.level).toBe("deterministic");
      expect(result.confidence).toBe(1.0);
    });

    it("should delete messages with banned words", async () => {
      const result = await moderate({ ...baseInput, content: "kys now" });
      expect(result.action).toBe("delete");
      expect(result.level).toBe("deterministic");
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it("should delete messages with spam patterns", async () => {
      const result = await moderate({ ...baseInput, content: "aaaaaaaaaaaaaaaaaaaaaaa" });
      expect(result.action).toBe("delete");
      expect(result.level).toBe("deterministic");
    });

    it("should escalate suspicious patterns (free nitro)", async () => {
      // Without L2/L3 available, should default to allow
      const result = await moderate({ ...baseInput, content: "free nitro click here!" });
      expect(result.action).toBe("allow");
    });

    it("should escalate for new accounts with long messages", async () => {
      const result = await moderate({
        ...baseInput,
        content:
          "This is a long message from a new user that should be escalated to higher moderation levels for review because the account is very new.",
        accountAgeDays: 3,
      });
      // Without L2/L3, defaults to allow
      expect(result.action).toBe("allow");
    });
  });
});
