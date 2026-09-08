import { describe, expect, it } from "vitest";
import {
  CHAT_FIRST_COMMANDS_HINT,
  CHAT_FIRST_SLASH,
  formatChatFirstSlashHelp,
  isChatFirstSlash,
} from "./chatFirstSlash.js";

describe("chatFirstSlash", () => {
  it("keeps /help in the reduced menu and rejects prefix-style names", () => {
    expect(isChatFirstSlash("help")).toBe(true);
    expect(isChatFirstSlash("mod")).toBe(true);
    expect(isChatFirstSlash("steam")).toBe(false);
    expect(isChatFirstSlash("game")).toBe(false);
    expect(isChatFirstSlash("ai")).toBe(false);
    expect(CHAT_FIRST_SLASH).toContain("help");
  });

  it("explains that !help does not exist and points to /help", () => {
    const text = formatChatFirstSlashHelp();
    expect(text).toMatch(/!help n'existe pas/i);
    expect(text).toContain("/help");
    expect(text).not.toMatch(/tapez simplement/i);
    expect(CHAT_FIRST_COMMANDS_HINT).toMatch(/!help, !cmd/);
    expect(CHAT_FIRST_COMMANDS_HINT).toMatch(/\/help/);
  });
});
