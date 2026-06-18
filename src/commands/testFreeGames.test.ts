import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockClient: { channels: { fetch: vi.fn() } },
}));

vi.mock("../utils/logger", () => ({ default: mocks.mockLogger }));
vi.mock("../config", () => ({ config: { freeGamesChannel: "111111111" } }));

import { handleCommand } from "./admin.js";

function makeInteraction(opts: { channelMock?: any; envValue?: string | undefined } = {}) {
  const original = process.env.FREE_GAMES_CHANNEL_ID;
  if (opts.envValue === undefined) delete process.env.FREE_GAMES_CHANNEL_ID;
  else process.env.FREE_GAMES_CHANNEL_ID = opts.envValue;

  const channelMock = 'channelMock' in opts ? opts.channelMock : { isTextBased: () => true, send: vi.fn(async () => undefined) };
  mocks.mockClient.channels.fetch.mockResolvedValue(channelMock);

  return {
    commandName: "test-freegames",
    user: { id: "u1", tag: "user#0001" },
    client: mocks.mockClient,
    deferred: false,
    replied: false,
    deferReply: vi.fn(async () => undefined),
    editReply: vi.fn(async () => undefined),
    followUp: vi.fn(async () => undefined),
    reply: vi.fn(async () => undefined),
    _restoreEnv: () => {
      if (original === undefined) delete process.env.FREE_GAMES_CHANNEL_ID;
      else process.env.FREE_GAMES_CHANNEL_ID = original;
    },
  } as any;
}

describe("handleTestFreeGames (via handleCommand)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("répond avec erreur si FREE_GAMES_CHANNEL_ID est manquant", async () => {
    const i = makeInteraction({ envValue: undefined });
    await (handleCommand as any)(i, mocks.mockClient);
    expect(i.deferReply).toHaveBeenCalled();
    expect(i.editReply).toHaveBeenCalledTimes(1);
    const call = i.editReply.mock.calls[0][0];
    expect(call.embeds[0].data.title).toContain("Configuration manquante");
    i._restoreEnv();
  });

  it("envoie un embed de test si tout est configuré", async () => {
    const channelMock = { isTextBased: () => true, send: vi.fn(async () => undefined) };
    const i = makeInteraction({ envValue: "111111111", channelMock });
    await (handleCommand as any)(i, mocks.mockClient);
    expect(i.deferReply).toHaveBeenCalled();
    expect(mocks.mockClient.channels.fetch).toHaveBeenCalledWith("111111111");
    expect(channelMock.send).toHaveBeenCalledTimes(1);
    const sent = (channelMock.send as any).mock.calls[0][0];
    expect(sent!.embeds[0].data.title).toContain("Message de test");
    expect(sent!.embeds[0].data.color).toBe(0x2a9d8f);
    expect(i.editReply).toHaveBeenCalledTimes(1);
    expect((i.editReply as any).mock.calls[0][0].embeds[0].data.title).toContain("Message de test envoyé");
    i._restoreEnv();
  });

  it("répond avec erreur si le salon est introuvable", async () => {
    const i = makeInteraction({ envValue: "111111111", channelMock: null });
    await (handleCommand as any)(i, mocks.mockClient);
    expect(i.editReply).toHaveBeenCalledTimes(1);
    expect((i.editReply as any).mock.calls[0][0].embeds[0].data.title).toContain("Salon introuvable");
    i._restoreEnv();
  });
});
