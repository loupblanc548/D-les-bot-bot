/**
 * discord.ts — Factory centralisée de mocks Discord pour les tests Vitest
 *
 * Fournit des mocks réutilisables pour Guild, Member, User, Message, Channel,
 * Interaction, Client — évite la duplication de mocks ad-hoc dans chaque test.
 */

import { vi } from "vitest";

// ─── Types helpers ────────────────────────────────────────────────

type DeepPartial<T> = { [P in keyof T]?: DeepPartial<T[P]> };

// ─── Mock User ────────────────────────────────────────────────────

export function mockUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "123456789012345678",
    tag: "testuser#0001",
    username: "testuser",
    discriminator: "0001",
    bot: false,
    createdTimestamp: Date.now() - 999_999_999,
    avatar: null,
    displayAvatarURL: vi.fn(() => "https://cdn.discordapp.com/embed/avatar/0.png"),
    fetch: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

// ─── Mock Member ──────────────────────────────────────────────────

export function mockMember(overrides: Record<string, unknown> = {}) {
  const perms = new Set<string>(["SendMessages", "ViewChannel"]);
  return {
    id: "123456789012345678",
    user: mockUser(),
    guild: mockGuild(),
    nickname: null,
    roles: {
      cache: new Map([
        ["role1", { id: "role1", name: "Member", permissions: { has: vi.fn(() => false) } }],
      ]),
      add: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      highest: { id: "role1", name: "Member", position: 1 },
    },
    permissions: {
      has: vi.fn((perm: string) => perms.has(perm)),
      toArray: vi.fn(() => Array.from(perms)),
    },
    kick: vi.fn().mockResolvedValue(undefined),
    ban: vi.fn().mockResolvedValue(undefined),
    timeout: vi.fn().mockResolvedValue(undefined),
    removeTimeout: vi.fn().mockResolvedValue(undefined),
    fetch: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

// ─── Mock Guild ───────────────────────────────────────────────────

export function mockGuild(overrides: Record<string, unknown> = {}) {
  return {
    id: "987654321098765432",
    name: "Test Guild",
    ownerId: "111111111111111111",
    memberCount: 100,
    members: {
      cache: new Map(),
      fetch: vi.fn().mockResolvedValue(new Map()),
    },
    roles: {
      cache: new Map([
        ["role1", { id: "role1", name: "Member", position: 1 }],
        ["role2", { id: "role2", name: "Admin", position: 10 }],
      ]),
      create: vi.fn().mockResolvedValue({ id: "newrole" }),
    },
    channels: {
      cache: new Map(),
      create: vi.fn().mockResolvedValue(mockChannel()),
    },
    bans: {
      create: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    },
    fetch: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

// ─── Mock Channel ─────────────────────────────────────────────────

export function mockChannel(overrides: Record<string, unknown> = {}) {
  return {
    id: "555555555555555555",
    type: 0, // GuildText
    name: "general",
    guildId: "987654321098765432",
    send: vi.fn().mockResolvedValue({ id: "msg-reply", content: "" }),
    sendTyping: vi.fn().mockResolvedValue(undefined),
    messages: {
      fetch: vi.fn().mockResolvedValue(new Map()),
      bulkDelete: vi.fn().mockResolvedValue(undefined),
    },
    createWebhook: vi.fn().mockResolvedValue({ id: "wh1", url: "https://discord.com/api/webhooks/1/token" }),
    ...overrides,
  };
}

// ─── Mock Message ─────────────────────────────────────────────────

export function mockMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: "999999999999999999",
    content: "",
    author: mockUser(),
    member: mockMember(),
    guild: mockGuild(),
    guildId: "987654321098765432",
    channel: mockChannel(),
    channelId: "555555555555555555",
    createdTimestamp: Date.now(),
    deletable: true,
    editable: true,
    reply: vi.fn().mockResolvedValue({ id: "msg-reply", content: "" }),
    delete: vi.fn().mockResolvedValue(undefined),
    edit: vi.fn().mockResolvedValue(undefined),
    react: vi.fn().mockResolvedValue(undefined),
    pin: vi.fn().mockResolvedValue(undefined),
    unpin: vi.fn().mockResolvedValue(undefined),
    fetch: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

// ─── Mock ChatInputCommandInteraction ─────────────────────────────

export function mockInteraction(overrides: Record<string, unknown> = {}) {
  const options = new Map<string, { value: unknown }>();
  return {
    id: "interaction-1",
    type: 2, // ApplicationCommand
    commandName: "test",
    user: mockUser(),
    member: mockMember(),
    guild: mockGuild(),
    guildId: "987654321098765432",
    channel: mockChannel(),
    channelId: "555555555555555555",
    deferred: false,
    replied: false,
    ephemeral: false,
    isChatInputCommand: vi.fn(() => true),
    isButton: vi.fn(() => false),
    isSelectMenu: vi.fn(() => false),
    isContextMenuCommand: vi.fn(() => false),
    options: {
      getSubcommand: vi.fn(() => null),
      getSubcommandGroup: vi.fn(() => null),
      getString: vi.fn((name: string) => options.get(name)?.value ?? null),
      getInteger: vi.fn((name: string) => options.get(name)?.value ?? null),
      getBoolean: vi.fn((name: string) => options.get(name)?.value ?? null),
      getUser: vi.fn(() => mockUser()),
      getMember: vi.fn(() => mockMember()),
      getChannel: vi.fn(() => mockChannel()),
      getRole: vi.fn(() => ({ id: "role1", name: "Member" })),
      getNumber: vi.fn((name: string) => options.get(name)?.value ?? null),
      getFocused: vi.fn(() => ({ name: "", value: "" })),
      data: { options: [] },
    },
    reply: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    deleteReply: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    deferUpdate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ─── Mock Client ──────────────────────────────────────────────────

export function mockClient(overrides: Record<string, unknown> = {}) {
  return {
    user: mockUser({ bot: true, id: "botid", username: "TestBot" }),
    application: { id: "appid", fetch: vi.fn().mockResolvedValue({ id: "appid" }) },
    guilds: {
      cache: new Map([["987654321098765432", mockGuild()]]),
      fetch: vi.fn().mockResolvedValue(new Map()),
      size: 1,
    },
    channels: {
      cache: new Map(),
      fetch: vi.fn().mockResolvedValue(mockChannel()),
    },
    users: {
      cache: new Map(),
      fetch: vi.fn().mockResolvedValue(mockUser()),
    },
    ws: { ping: 42 },
    readyAt: new Date(Date.now() - 3600_000),
    uptime: 3600_000,
    isReady: vi.fn(() => true),
    destroy: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    ...overrides,
  };
}

// ─── Mock REST ────────────────────────────────────────────────────

export function mockRest() {
  return {
    put: vi.fn().mockResolvedValue(undefined),
    post: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    patch: vi.fn().mockResolvedValue(undefined),
  };
}

// ─── Helper: créer une collection Discord-like ────────────────────

export function mockCollection<K, V>(entries: [K, V][] = []): Map<K, V> {
  return new Map(entries);
}
