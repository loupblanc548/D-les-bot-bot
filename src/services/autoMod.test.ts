import { describe, it, expect } from "vitest";
import { checkMessage, DEFAULT_RULES, type AutoModRule } from "./autoMod.js";

describe("autoMod", () => {
  const mockMessage = (content: string, authorId = "123") =>
    ({
      content,
      author: { id: authorId },
      guildId: "guild1",
      reply: async () => {},
      delete: async () => {},
      member: null,
    }) as any;

  it("detects banned words", () => {
    const rules: AutoModRule = { ...DEFAULT_RULES, bannedWords: ["badword"] };
    const result = checkMessage(mockMessage("this contains badword here"), rules);
    expect(result.violated).toBe(true);
    expect(result.reason).toContain("badword");
  });

  it("detects discord invites", () => {
    const rules: AutoModRule = { ...DEFAULT_RULES, blockInvites: true };
    const result = checkMessage(mockMessage("join https://discord.gg/abc123"), rules);
    expect(result.violated).toBe(true);
    expect(result.reason.toLowerCase()).toContain("invite");
  });

  it("detects links when blocked", () => {
    const rules: AutoModRule = { ...DEFAULT_RULES, blockLinks: true, allowedLinkDomains: [] };
    const result = checkMessage(mockMessage("check https://example.com"), rules);
    expect(result.violated).toBe(true);
  });

  it("allows whitelisted domains", () => {
    const rules: AutoModRule = { ...DEFAULT_RULES, blockLinks: true, allowedLinkDomains: ["example.com"] };
    const result = checkMessage(mockMessage("check https://example.com"), rules);
    expect(result.violated).toBe(false);
  });

  it("detects caps spam", () => {
    const rules: AutoModRule = { ...DEFAULT_RULES, capsThreshold: 70, capsMinLength: 10 };
    const result = checkMessage(mockMessage("HELLO WORLD THIS IS VERY LOUD"), rules);
    expect(result.violated).toBe(true);
    expect(result.reason).toContain("majuscules");
  });

  it("ignores short messages for caps check", () => {
    const rules: AutoModRule = { ...DEFAULT_RULES, capsThreshold: 70, capsMinLength: 10 };
    const result = checkMessage(mockMessage("HI"), rules);
    expect(result.violated).toBe(false);
  });

  it("does not violate on clean message", () => {
    const result = checkMessage(mockMessage("hello world how are you"), DEFAULT_RULES);
    expect(result.violated).toBe(false);
  });

  it("respects disabled rules", () => {
    const rules: AutoModRule = { ...DEFAULT_RULES, enabled: false, bannedWords: ["bad"] };
    const result = checkMessage(mockMessage("this is bad"), rules);
    expect(result.violated).toBe(false);
  });
});
