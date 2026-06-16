"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const discord_js_1 = require("discord.js");
// ── Mocks hoisted (avant les imports du module testé) ────────────────────────
const mocks = vitest_1.vi.hoisted(() => {
    const cache = new Map();
    return {
        cache,
        incrementCache: vitest_1.vi.fn(async (key) => {
            const entry = cache.get(key);
            if (!entry) {
                cache.set(key, { value: 1, expireAt: Date.now() + 5000 });
                return 1;
            }
            entry.value += 1;
            return entry.value;
        }),
        setCacheExpire: vitest_1.vi.fn(async (key, seconds) => {
            const entry = cache.get(key);
            if (entry)
                entry.expireAt = Date.now() + seconds * 1000;
        }),
        getCacheTTL: vitest_1.vi.fn(async (key) => {
            const entry = cache.get(key);
            if (!entry || entry.expireAt === null)
                return -2;
            return Math.max(0, Math.ceil((entry.expireAt - Date.now()) / 1000));
        }),
        warn: vitest_1.vi.fn(),
        info: vitest_1.vi.fn(),
        error: vitest_1.vi.fn(),
    };
});
vitest_1.vi.mock("../utils/redis", () => ({
    incrementCache: mocks.incrementCache,
    setCacheExpire: mocks.setCacheExpire,
    getCacheTTL: mocks.getCacheTTL,
}));
vitest_1.vi.mock("../utils/logger", () => ({
    default: { info: mocks.info, warn: mocks.warn, error: mocks.error },
}));
vitest_1.vi.mock("../config", () => ({
    config: {
        rateLimit: { windowSeconds: 5, maxRequests: 3, bypassAdmins: true },
    },
}));
const rateLimit_1 = require("./rateLimit");
// ── Helpers ────────────────────────────────────────────────────────────────
function makeInteraction(overrides) {
    const guildId = overrides.guildId !== undefined ? overrides.guildId : "g1";
    return {
        isChatInputCommand: () => true,
        commandName: overrides.commandName ?? "ping",
        guildId,
        guild: guildId ? { ownerId: overrides.isOwner ? "u_owner" : "u_other" } : null,
        inGuild: () => !!guildId,
        user: { id: overrides.isOwner ? "u_owner" : "u1", tag: "user#0001" }, member: overrides.isAdmin
            ? { permissions: { has: (f) => f === discord_js_1.PermissionsBitField.Flags.Administrator } }
            : { permissions: { has: () => false } },
        deferred: false,
        replied: overrides.replied ?? false,
        reply: vitest_1.vi.fn(async () => undefined),
        followUp: vitest_1.vi.fn(async () => undefined),
    };
}
// ── Tests ──────────────────────────────────────────────────────────────────
(0, vitest_1.describe)("rateLimit middleware", () => {
    (0, vitest_1.beforeEach)(() => {
        mocks.cache.clear();
        mocks.incrementCache.mockClear();
        mocks.setCacheExpire.mockClear();
        mocks.getCacheTTL.mockClear();
        mocks.info.mockClear();
        mocks.warn.mockClear();
    });
    (0, vitest_1.it)("laisse passer sous le seuil", async () => {
        const mw = (0, rateLimit_1.createRateLimitMiddleware)();
        const next = vitest_1.vi.fn(async () => undefined);
        await mw(makeInteraction({}), {}, next);
        (0, vitest_1.expect)(next).toHaveBeenCalledTimes(1);
    });
    (0, vitest_1.it)("bloque au-delà du seuil avec message éphémère", async () => {
        const mw = (0, rateLimit_1.createRateLimitMiddleware)();
        const next = vitest_1.vi.fn(async () => undefined);
        const interaction = makeInteraction({});
        await mw(interaction, {}, next);
        await mw(interaction, {}, next);
        await mw(interaction, {}, next);
        await mw(interaction, {}, next);
        // 3 passes, 1 bloquée
        (0, vitest_1.expect)(next).toHaveBeenCalledTimes(3);
        (0, vitest_1.expect)(interaction.reply).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(interaction.reply.mock.calls[0][0]).toMatchObject({
            flags: [discord_js_1.MessageFlags.Ephemeral],
        });
    });
    (0, vitest_1.it)("bypass admins", async () => {
        const mw = (0, rateLimit_1.createRateLimitMiddleware)();
        const next = vitest_1.vi.fn(async () => undefined);
        const interaction = makeInteraction({ isAdmin: true });
        for (let i = 0; i < 10; i++)
            await mw(interaction, {}, next);
        (0, vitest_1.expect)(next).toHaveBeenCalledTimes(10);
    });
    (0, vitest_1.it)("bypass owner", async () => {
        const mw = (0, rateLimit_1.createRateLimitMiddleware)();
        const next = vitest_1.vi.fn(async () => undefined);
        const interaction = makeInteraction({ isOwner: true });
        for (let i = 0; i < 10; i++)
            await mw(interaction, {}, next);
        (0, vitest_1.expect)(next).toHaveBeenCalledTimes(10);
    });
    (0, vitest_1.it)("utilise followUp si déjà répondu", async () => {
        const mw = (0, rateLimit_1.createRateLimitMiddleware)();
        const next = vitest_1.vi.fn(async () => undefined);
        const interaction = makeInteraction({ replied: true });
        for (let i = 0; i < 4; i++)
            await mw(interaction, {}, next);
        (0, vitest_1.expect)(interaction.reply).not.toHaveBeenCalled();
        (0, vitest_1.expect)(interaction.followUp).toHaveBeenCalledTimes(1);
    });
    (0, vitest_1.it)("laisse passer si pas une ChatInputCommand", async () => {
        const mw = (0, rateLimit_1.createRateLimitMiddleware)();
        const next = vitest_1.vi.fn(async () => undefined);
        const interaction = { isChatInputCommand: () => false };
        await mw(interaction, {}, next);
        (0, vitest_1.expect)(next).toHaveBeenCalledTimes(1);
    });
});
//# sourceMappingURL=rateLimit.test.js.map