/**
 * discord.test.ts — Tests de la factory de mocks Discord
 */

import { describe, it, expect } from "vitest";
import {
  mockUser,
  mockMember,
  mockGuild,
  mockChannel,
  mockMessage,
  mockInteraction,
  mockClient,
  mockCollection,
} from "./discord.js";

describe("discord mocks", () => {
  it("mockUser has default values", () => {
    const user = mockUser();
    expect(user.id).toBe("123456789012345678");
    expect(user.bot).toBe(false);
    expect(user.tag).toContain("testuser");
  });

  it("mockUser accepts overrides", () => {
    const user = mockUser({ id: "custom", bot: true });
    expect(user.id).toBe("custom");
    expect(user.bot).toBe(true);
  });

  it("mockMember has permissions", () => {
    const member = mockMember();
    expect(member.permissions.has("SendMessages")).toBe(true);
    expect(member.permissions.has("Administrator")).toBe(false);
  });

  it("mockGuild has roles cache", () => {
    const guild = mockGuild();
    expect(guild.id).toBe("987654321098765432");
    expect(guild.roles.cache.size).toBeGreaterThan(0);
  });

  it("mockChannel send returns a message", async () => {
    const channel = mockChannel();
    const msg = await channel.send("hello");
    expect(msg).toBeDefined();
    expect(channel.send).toHaveBeenCalledWith("hello");
  });

  it("mockMessage reply works", async () => {
    const msg = mockMessage({ content: "test" });
    await msg.reply("response");
    expect(msg.reply).toHaveBeenCalledWith("response");
  });

  it("mockInteraction is chat input command", () => {
    const interaction = mockInteraction();
    expect(interaction.isChatInputCommand()).toBe(true);
    expect(interaction.isButton()).toBe(false);
  });

  it("mockInteraction options work", () => {
    const interaction = mockInteraction();
    const val = interaction.options.getString("nonexistent");
    expect(val).toBeNull();
  });

  it("mockClient has guilds", () => {
    const client = mockClient();
    expect(client.guilds.cache.size).toBe(1);
    expect(client.ws.ping).toBe(42);
  });

  it("mockCollection creates a Map", () => {
    const col = mockCollection([["key", "value"]]);
    expect(col.get("key")).toBe("value");
    expect(col.size).toBe(1);
  });
});
