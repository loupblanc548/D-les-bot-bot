import { describe, expect, it } from "vitest";
import {
  CHAT_FIRST_COMMANDS_HINT,
  CHAT_FIRST_SLASH,
  formatChatFirstSlashHelp,
  isChatFirstSlash,
  matchSlashCommands,
} from "./chatFirstSlash.js";

describe("chatFirstSlash", () => {
  it("exposes the user-facing slash groups including game, ai and bot", () => {
    expect(isChatFirstSlash("help")).toBe(true);
    expect(isChatFirstSlash("bot")).toBe(true);
    expect(isChatFirstSlash("game")).toBe(true);
    expect(isChatFirstSlash("ai")).toBe(true);
    expect(isChatFirstSlash("mod")).toBe(true);
    expect(isChatFirstSlash("steam")).toBe(false);
    expect(CHAT_FIRST_SLASH).toContain("game");
  });

  it("matches the slash that goes with a topic", () => {
    const steam = matchSlashCommands("steam");
    expect(steam.some((l) => l.includes("/game steam"))).toBe(true);
    const mute = matchSlashCommands("mute");
    expect(mute.some((l) => /\/mod mute/i.test(l))).toBe(true);
  });

  it("explains that !help does not exist and lists matching commands", () => {
    const all = formatChatFirstSlashHelp();
    expect(all).toMatch(/!help n'existe pas/i);
    expect(all).toContain("/help");
    expect(all).toContain("/game");
    expect(formatChatFirstSlashHelp("steam")).toContain("/game steam");
    expect(CHAT_FIRST_COMMANDS_HINT).toMatch(/!help, !cmd/);
    expect(CHAT_FIRST_COMMANDS_HINT).toMatch(/\/game steam/);
  });
});
