import { ChannelType } from "discord.js";
import { afterEach, describe, expect, it } from "vitest";
import {
  BASIC_SERVER_LAYOUT,
  BASIC_RULES_TEXT,
  BASIC_WELCOME_TEXT,
  applyBasicServerLayout,
  maybeSetupJoinedGuild,
  buildBotInviteUrl,
  clearPendingServerSetups,
  consumePendingServerSetup,
  describeBasicLayout,
  looksLikeFreshGuild,
  normalizeChannelName,
  peekPendingServerSetup,
  registerPendingServerSetup,
  runSetupBasicServerTool,
} from "./basicServerSetup.js";
import type { ToolContext } from "./agentTools.js";

afterEach(() => {
  clearPendingServerSetups();
});

function mockGuild(seed: { name: string; type: number }[] = []) {
  const cache = new Map<string, Record<string, unknown>>();
  let seq = 0;
  const add = (data: Record<string, unknown>) => {
    seq += 1;
    const channel: Record<string, unknown> = {
      id: `ch-${seq}`,
      parentId: data.parent ?? null,
      ...data,
    };
    channel.setParent = async (id: string) => {
      channel.parentId = id;
    };
    channel.setTopic = async (topic: string) => {
      channel.topic = topic;
    };
    channel.send = async () => undefined;
    cache.set(String(channel.id), channel);
    return channel;
  };
  for (const item of seed) add({ name: item.name, type: item.type });

  const guild = {
    id: "guild-1",
    name: "Nouveau",
    ownerId: "owner-1",
    memberCount: 2,
    client: { user: { id: "bot-1" } },
    members: { me: { id: "bot-1" } },
    channels: {
      cache,
      fetch: async () => cache,
      create: async (data: Record<string, unknown>) => add(data),
    },
    setName: async (name: string) => {
      guild.name = name;
    },
    setSystemChannel: async () => undefined,
    setAFKChannel: async () => undefined,
    setAFKTimeout: async () => undefined,
  };
  return guild as unknown as Parameters<typeof applyBasicServerLayout>[0];
}

describe("basic server layout", () => {
  it("covers the usual French community rooms", () => {
    const names = BASIC_SERVER_LAYOUT.map((spec) => spec.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "Informations",
        "bienvenue",
        "règles",
        "annonces",
        "général",
        "media",
        "bots",
        "Général",
        "AFK",
        "staff",
      ]),
    );
    expect(BASIC_SERVER_LAYOUT.filter((spec) => spec.kind === "category")).toHaveLength(4);
    expect(BASIC_SERVER_LAYOUT.filter((spec) => spec.kind === "text")).toHaveLength(8);
    expect(BASIC_SERVER_LAYOUT.filter((spec) => spec.kind === "voice")).toHaveLength(2);
    expect(describeBasicLayout().some((line) => line.includes("#général"))).toBe(true);
    expect(BASIC_WELCOME_TEXT.toLowerCase()).toContain("bienvenue");
    expect(BASIC_RULES_TEXT).toMatch(/harcèlement/i);
  });

  it("treats a tiny new guild as fresh and a busy one as not", () => {
    expect(looksLikeFreshGuild({ memberCount: 2, channelCount: 2 })).toBe(true);
    expect(looksLikeFreshGuild({ memberCount: 40, channelCount: 2 })).toBe(false);
    expect(looksLikeFreshGuild({ memberCount: 3, channelCount: 20 })).toBe(false);
  });

  it("normalizes accented channel names", () => {
    expect(normalizeChannelName("Règles")).toBe("regles");
    expect(normalizeChannelName("  Général ")).toBe("general");
  });

  it("builds an admin bot invite and ignores empty ids", () => {
    expect(buildBotInviteUrl("1512435587926200391")).toBe(
      "https://discord.com/oauth2/authorize?client_id=1512435587926200391&permissions=8&scope=bot%20applications.commands",
    );
    expect(buildBotInviteUrl("")).toBe("");
  });
});

describe("pending setup + apply", () => {
  it("stores then consumes a pending setup for the requester", () => {
    registerPendingServerSetup("user-9", "Les potes");
    expect(peekPendingServerSetup("user-9")?.name).toBe("Les potes");
    expect(consumePendingServerSetup("user-9")).toEqual({ name: "Les potes" });
    expect(consumePendingServerSetup("user-9")).toBeNull();
  });

  it("creates missing rooms and reuses #général", async () => {
    const guild = mockGuild([{ name: "général", type: ChannelType.GuildText }]);
    const result = await applyBasicServerLayout(guild);
    expect(result.reused).toContain("général");
    expect(result.created).toEqual(
      expect.arrayContaining(["Informations", "bienvenue", "règles", "Salons", "Vocal", "AFK"]),
    );
    expect(result.created).not.toContain("général");
    const names = [...guild.channels.cache.values()].map((ch) => (ch as { name: string }).name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("auto-setups a fresh join and skips a busy guild", async () => {
    const fresh = mockGuild([{ name: "général", type: ChannelType.GuildText }]);
    const auto = await maybeSetupJoinedGuild(fresh);
    expect(auto?.created.length).toBeGreaterThan(5);

    const busy = mockGuild([
      { name: "général", type: ChannelType.GuildText },
      { name: "offtopic", type: ChannelType.GuildText },
      { name: "memes", type: ChannelType.GuildText },
      { name: "clips", type: ChannelType.GuildText },
      { name: "music", type: ChannelType.GuildVoice },
      { name: "afk", type: ChannelType.GuildVoice },
      { name: "staff", type: ChannelType.GuildText },
    ]);
    (busy as { memberCount: number }).memberCount = 40;
    expect(await maybeSetupJoinedGuild(busy)).toBeNull();
  });

  it("is idempotent on a second pass", async () => {
    const guild = mockGuild();
    const first = await applyBasicServerLayout(guild);
    const second = await applyBasicServerLayout(guild);
    expect(first.created.length).toBeGreaterThan(8);
    expect(second.created).toEqual([]);
    expect(second.reused.length).toBe(BASIC_SERVER_LAYOUT.length);
  });
});

describe("setup_basic_server tool", () => {
  it("returns an invite instead of creating a guild", async () => {
    const ctx = {
      client: { user: { id: "bot-99" }, guilds: { cache: { get: () => undefined } } },
      message: {} as ToolContext["message"],
      userId: "user-1",
      guildId: "guild-1",
      channelId: "chan-1",
    } as unknown as ToolContext;

    const result = await runSetupBasicServerTool({ name: "Soirée" }, ctx);
    expect(result.success).toBe(true);
    const payload = JSON.parse(String(result.data)) as {
      discordBlocksBotGuildCreate: boolean;
      inviteUrl: string;
      pending: boolean;
    };
    expect(payload.discordBlocksBotGuildCreate).toBe(true);
    expect(payload.inviteUrl).toContain("client_id=bot-99");
    expect(payload.pending).toBe(true);
    expect(peekPendingServerSetup("user-1")?.name).toBe("Soirée");
  });
});
