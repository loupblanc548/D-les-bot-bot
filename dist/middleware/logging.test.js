import { describe, it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
}));
vi.mock("../utils/logger", () => ({
    default: { info: mocks.info, warn: mocks.warn, error: mocks.error },
}));
import { createLoggingMiddleware } from "./logging.js";
function makeInteraction(overrides = {}) {
    return {
        isChatInputCommand: () => true,
        commandName: overrides.commandName ?? "ping",
        guild: overrides.guild ?? { name: "TestGuild" },
        guildId: overrides.guildId ?? "g1",
        user: { id: "u1", tag: "user#0001" },
    };
}
describe("logging middleware", () => {
    beforeEach(() => {
        mocks.info.mockClear();
        mocks.warn.mockClear();
        mocks.error.mockClear();
    });
    it("log l'invocation et le succès avec latence", async () => {
        const mw = createLoggingMiddleware();
        const next = vi.fn(async () => undefined);
        const interaction = makeInteraction();
        await mw(interaction, {}, next);
        expect(mocks.info).toHaveBeenCalledTimes(2);
        expect(mocks.info.mock.calls[0][0]).toMatch(/ping par user#0001/);
        expect(mocks.info.mock.calls[1][0]).toMatch(/ping OK en \d+ms/);
        expect(next).toHaveBeenCalledTimes(1);
    });
    it("log l'échec via logger.error et remonte l'erreur", async () => {
        const mw = createLoggingMiddleware();
        const boom = new Error("kaboom");
        const next = vi.fn(async () => {
            throw boom;
        });
        const interaction = makeInteraction({ commandName: "boom" });
        await expect(mw(interaction, {}, next)).rejects.toBe(boom);
        expect(mocks.error).toHaveBeenCalledTimes(1);
        expect(mocks.error.mock.calls[0][0]).toMatch(/boom FAILED/);
        expect(mocks.error.mock.calls[0][0]).toMatch(/kaboom/);
    });
    it("laisse passer si pas une ChatInputCommand", async () => {
        const mw = createLoggingMiddleware();
        const next = vi.fn(async () => undefined);
        await mw({ isChatInputCommand: () => false }, {}, next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(mocks.info).not.toHaveBeenCalled();
    });
});
//# sourceMappingURL=logging.test.js.map