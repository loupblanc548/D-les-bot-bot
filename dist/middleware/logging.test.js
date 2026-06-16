"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const mocks = vitest_1.vi.hoisted(() => ({
    info: vitest_1.vi.fn(),
    warn: vitest_1.vi.fn(),
    error: vitest_1.vi.fn(),
}));
vitest_1.vi.mock("../utils/logger", () => ({
    default: { info: mocks.info, warn: mocks.warn, error: mocks.error },
}));
const logging_1 = require("./logging");
function makeInteraction(overrides = {}) {
    return {
        isChatInputCommand: () => true,
        commandName: overrides.commandName ?? "ping",
        guild: overrides.guild ?? { name: "TestGuild" },
        guildId: overrides.guildId ?? "g1",
        user: { id: "u1", tag: "user#0001" },
    };
}
(0, vitest_1.describe)("logging middleware", () => {
    (0, vitest_1.beforeEach)(() => {
        mocks.info.mockClear();
        mocks.warn.mockClear();
        mocks.error.mockClear();
    });
    (0, vitest_1.it)("log l'invocation et le succès avec latence", async () => {
        const mw = (0, logging_1.createLoggingMiddleware)();
        const next = vitest_1.vi.fn(async () => undefined);
        const interaction = makeInteraction();
        await mw(interaction, {}, next);
        (0, vitest_1.expect)(mocks.info).toHaveBeenCalledTimes(2);
        (0, vitest_1.expect)(mocks.info.mock.calls[0][0]).toMatch(/ping par user#0001/);
        (0, vitest_1.expect)(mocks.info.mock.calls[1][0]).toMatch(/ping OK en \d+ms/);
        (0, vitest_1.expect)(next).toHaveBeenCalledTimes(1);
    });
    (0, vitest_1.it)("log l'échec via logger.error et remonte l'erreur", async () => {
        const mw = (0, logging_1.createLoggingMiddleware)();
        const boom = new Error("kaboom");
        const next = vitest_1.vi.fn(async () => {
            throw boom;
        });
        const interaction = makeInteraction({ commandName: "boom" });
        await (0, vitest_1.expect)(mw(interaction, {}, next)).rejects.toBe(boom);
        (0, vitest_1.expect)(mocks.error).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(mocks.error.mock.calls[0][0]).toMatch(/boom FAILED/);
        (0, vitest_1.expect)(mocks.error.mock.calls[0][0]).toMatch(/kaboom/);
    });
    (0, vitest_1.it)("laisse passer si pas une ChatInputCommand", async () => {
        const mw = (0, logging_1.createLoggingMiddleware)();
        const next = vitest_1.vi.fn(async () => undefined);
        await mw({ isChatInputCommand: () => false }, {}, next);
        (0, vitest_1.expect)(next).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(mocks.info).not.toHaveBeenCalled();
    });
});
//# sourceMappingURL=logging.test.js.map