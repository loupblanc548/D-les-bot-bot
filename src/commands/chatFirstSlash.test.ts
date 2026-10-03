import { describe, expect, it } from "vitest";
import {
  CHAT_FIRST_COMMANDS_HINT,
  CHAT_FIRST_SLASH,
  formatChatFirstSlashHelp,
  isChatFirstSlash,
  matchSlashCommands,
} from "./chatFirstSlash.js";

describe("chatFirstSlash", () => {
  it("keeps only wishlist, minecraft, and the admin slash commands", () => {
    expect(isChatFirstSlash("wishlist")).toBe(true);
    expect(isChatFirstSlash("mc")).toBe(true);
    expect(isChatFirstSlash("admin")).toBe(true);
    expect(isChatFirstSlash("bot")).toBe(true);
    expect(isChatFirstSlash("game")).toBe(false);
    expect(isChatFirstSlash("mod")).toBe(false);
    expect(isChatFirstSlash("ai")).toBe(false);
    expect(isChatFirstSlash("help")).toBe(false);
    expect(CHAT_FIRST_SLASH).toEqual(["wishlist", "mc", "admin", "bot"]);
  });

  it("matches minecraft and backup, not removed slash groups", () => {
    const mc = matchSlashCommands("farm");
    expect(mc.some((l) => l.includes("/mc"))).toBe(true);
    const backup = matchSlashCommands("backup");
    expect(backup.some((l) => /\/admin backup/i.test(l))).toBe(true);
    expect(matchSlashCommands("steam").some((l) => l.includes("/game"))).toBe(false);
  });

  it("explains that !help does not exist and lists the remaining slash commands", () => {
    const all = formatChatFirstSlashHelp();
    expect(all).toMatch(/!help n'existe pas/i);
    expect(all).toContain("/wishlist");
    expect(all).toContain("/mc");
    expect(all).not.toContain("/game");
    expect(formatChatFirstSlashHelp("diagnostic")).toContain("/bot diagnostic");
    expect(CHAT_FIRST_COMMANDS_HINT).toMatch(/!help, !cmd/);
    expect(CHAT_FIRST_COMMANDS_HINT).toMatch(/\/wishlist/);
    expect(CHAT_FIRST_COMMANDS_HINT).not.toMatch(/\/game steam/);
  });
});
