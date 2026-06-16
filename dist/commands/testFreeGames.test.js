"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const mocks = vitest_1.vi.hoisted(() => ({
    mockLogger: { info: vitest_1.vi.fn(), warn: vitest_1.vi.fn(), error: vitest_1.vi.fn() },
    mockClient: { channels: { fetch: vitest_1.vi.fn() } },
}));
vitest_1.vi.mock("../utils/logger", () => ({ default: mocks.mockLogger }));
vitest_1.vi.mock("../config", () => ({ config: { freeGamesChannel: "111111111" } }));
const admin_1 = require("./admin");
function makeInteraction(opts = {}) {
    const original = process.env.FREE_GAMES_CHANNEL_ID;
    if (opts.envValue === undefined)
        delete process.env.FREE_GAMES_CHANNEL_ID;
    else
        process.env.FREE_GAMES_CHANNEL_ID = opts.envValue;
    const channelMock = 'channelMock' in opts ? opts.channelMock : { isTextBased: () => true, send: vitest_1.vi.fn(async () => undefined) };
    mocks.mockClient.channels.fetch.mockResolvedValue(channelMock);
    return {
        commandName: "test-freegames",
        user: { id: "u1", tag: "user#0001" },
        client: mocks.mockClient,
        deferred: false,
        replied: false,
        deferReply: vitest_1.vi.fn(async () => undefined),
        editReply: vitest_1.vi.fn(async () => undefined),
        followUp: vitest_1.vi.fn(async () => undefined),
        reply: vitest_1.vi.fn(async () => undefined),
        _restoreEnv: () => {
            if (original === undefined)
                delete process.env.FREE_GAMES_CHANNEL_ID;
            else
                process.env.FREE_GAMES_CHANNEL_ID = original;
        },
    };
}
(0, vitest_1.describe)("handleTestFreeGames (via handleCommand)", () => {
    (0, vitest_1.beforeEach)(() => { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)("répond avec erreur si FREE_GAMES_CHANNEL_ID est manquant", async () => {
        const i = makeInteraction({ envValue: undefined });
        await admin_1.handleCommand(i, mocks.mockClient);
        (0, vitest_1.expect)(i.deferReply).toHaveBeenCalled();
        (0, vitest_1.expect)(i.editReply).toHaveBeenCalledTimes(1);
        const call = i.editReply.mock.calls[0][0];
        (0, vitest_1.expect)(call.embeds[0].data.title).toContain("Configuration manquante");
        i._restoreEnv();
    });
    (0, vitest_1.it)("envoie un embed de test si tout est configuré", async () => {
        const channelMock = { isTextBased: () => true, send: vitest_1.vi.fn(async () => undefined) };
        const i = makeInteraction({ envValue: "111111111", channelMock });
        await admin_1.handleCommand(i, mocks.mockClient);
        (0, vitest_1.expect)(i.deferReply).toHaveBeenCalled();
        (0, vitest_1.expect)(mocks.mockClient.channels.fetch).toHaveBeenCalledWith("111111111");
        (0, vitest_1.expect)(channelMock.send).toHaveBeenCalledTimes(1);
        const sent = channelMock.send.mock.calls[0][0];
        (0, vitest_1.expect)(sent.embeds[0].data.title).toContain("Message de test");
        (0, vitest_1.expect)(sent.embeds[0].data.color).toBe(0x2a9d8f);
        (0, vitest_1.expect)(i.editReply).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(i.editReply.mock.calls[0][0].embeds[0].data.title).toContain("Message de test envoyé");
        i._restoreEnv();
    });
    (0, vitest_1.it)("répond avec erreur si le salon est introuvable", async () => {
        const i = makeInteraction({ envValue: "111111111", channelMock: null });
        await admin_1.handleCommand(i, mocks.mockClient);
        (0, vitest_1.expect)(i.editReply).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(i.editReply.mock.calls[0][0].embeds[0].data.title).toContain("Salon introuvable");
        i._restoreEnv();
    });
});
//# sourceMappingURL=testFreeGames.test.js.map