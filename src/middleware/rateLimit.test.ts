import { describe, it, expect, vi, beforeEach } from "vitest";
import { MessageFlags, PermissionsBitField } from "discord.js";

// ── Mocks hoisted (avant les imports du module testé) ────────────────────────
const mocks = vi.hoisted(() => {
  const cache = new Map<string, { value: number; expireAt: number | null }>();
  return {
    cache,
    incrementCache: vi.fn(async (key: string) => {
      const entry = cache.get(key);
      if (!entry) {
        cache.set(key, { value: 1, expireAt: Date.now() + 5000 });
        return 1;
      }
      entry.value += 1;
      return entry.value;
    }),
    setCacheExpire: vi.fn(async (key: string, seconds: number) => {
      const entry = cache.get(key);
      if (entry) entry.expireAt = Date.now() + seconds * 1000;
    }),
    getCacheTTL: vi.fn(async (key: string) => {
      const entry = cache.get(key);
      if (!entry || entry.expireAt === null) return -2;
      return Math.max(0, Math.ceil((entry.expireAt - Date.now()) / 1000));
    }),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  };
});

vi.mock("../utils/redis", () => ({
  incrementCache: mocks.incrementCache,
  setCacheExpire: mocks.setCacheExpire,
  getCacheTTL: mocks.getCacheTTL,
}));

vi.mock("../utils/logger", () => ({
  default: { info: mocks.info, warn: mocks.warn, error: mocks.error },
}));

vi.mock("../config", () => ({
  config: {
    rateLimit: { windowSeconds: 5, maxRequests: 3, bypassAdmins: true },
  },
}));

import { createRateLimitMiddleware } from "./rateLimit.js";

// ── Helpers ────────────────────────────────────────────────────────────────
function makeInteraction(overrides: {
  commandName?: string;
  guildId?: string | null;
  isAdmin?: boolean;
  isOwner?: boolean;
  replied?: boolean;
}) {
  const guildId = overrides.guildId !== undefined ? overrides.guildId : "g1";
  return {
    isChatInputCommand: () => true,
    commandName: overrides.commandName ?? "ping",
    guildId,
    guild: guildId ? { ownerId: overrides.isOwner ? "u_owner" : "u_other" } : null,
    inGuild: () => !!guildId,

    user: { id: overrides.isOwner ? "u_owner" : "u1", tag: "user#0001" },    member: overrides.isAdmin
      ? { permissions: { has: (f: bigint) => f === PermissionsBitField.Flags.Administrator } }
      : { permissions: { has: () => false } },
    deferred: false,
    replied: overrides.replied ?? false,
    reply: vi.fn(async () => undefined),
    followUp: vi.fn(async () => undefined),
  } as any;
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe("rateLimit middleware", () => {
  beforeEach(() => {
    mocks.cache.clear();
    mocks.incrementCache.mockClear();
    mocks.setCacheExpire.mockClear();
    mocks.getCacheTTL.mockClear();
    mocks.info.mockClear();
    mocks.warn.mockClear();
  });

  it("laisse passer sous le seuil", async () => {
    const mw = createRateLimitMiddleware();
    const next = vi.fn(async () => undefined);
    await mw(makeInteraction({}), {} as any, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("bloque au-delà du seuil avec message éphémère", async () => {
    const mw = createRateLimitMiddleware();
    const next = vi.fn(async () => undefined);
    const interaction = makeInteraction({});

    await mw(interaction, {} as any, next);
    await mw(interaction, {} as any, next);
    await mw(interaction, {} as any, next);
    await mw(interaction, {} as any, next);

    // 3 passes, 1 bloquée
    expect(next).toHaveBeenCalledTimes(3);
    expect(interaction.reply).toHaveBeenCalledTimes(1);
    expect(interaction.reply.mock.calls[0][0]).toMatchObject({
      flags: [MessageFlags.Ephemeral],
    });
  });

  it("bypass admins", async () => {
    const mw = createRateLimitMiddleware();
    const next = vi.fn(async () => undefined);
    const interaction = makeInteraction({ isAdmin: true });
    for (let i = 0; i < 10; i++) await mw(interaction, {} as any, next);
    expect(next).toHaveBeenCalledTimes(10);
  });

  it("bypass owner", async () => {
    const mw = createRateLimitMiddleware();
    const next = vi.fn(async () => undefined);
    const interaction = makeInteraction({ isOwner: true });
    for (let i = 0; i < 10; i++) await mw(interaction, {} as any, next);
    expect(next).toHaveBeenCalledTimes(10);
  });

  it("utilise followUp si déjà répondu", async () => {
    const mw = createRateLimitMiddleware();
    const next = vi.fn(async () => undefined);
    const interaction = makeInteraction({ replied: true });

    for (let i = 0; i < 4; i++) await mw(interaction, {} as any, next);

    expect(interaction.reply).not.toHaveBeenCalled();
    expect(interaction.followUp).toHaveBeenCalledTimes(1);
  });

  it("laisse passer si pas une ChatInputCommand", async () => {
    const mw = createRateLimitMiddleware();
    const next = vi.fn(async () => undefined);
    const interaction = { isChatInputCommand: () => false } as any;
    await mw(interaction, {} as any, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
