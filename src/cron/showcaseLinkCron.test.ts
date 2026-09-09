import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../utils/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  getShowcaseUrl,
  postShowcaseLink,
  resetShowcaseLinkStateForTests,
} from "./showcaseLinkCron.js";

describe("showcaseLinkCron", () => {
  const prevChannel = process.env.GAME_RELEASE_VOICE_CHANNEL_ID;
  const prevHost = process.env.VPS_PUBLIC_HOST;
  const prevPort = process.env.HEALTH_PORT;

  beforeEach(() => {
    resetShowcaseLinkStateForTests();
    process.env.GAME_RELEASE_VOICE_CHANNEL_ID = "1546655389620375653";
    process.env.VPS_PUBLIC_HOST = "31.220.79.90";
    process.env.HEALTH_PORT = "3000";
  });

  afterEach(() => {
    resetShowcaseLinkStateForTests();
    if (prevChannel === undefined) delete process.env.GAME_RELEASE_VOICE_CHANNEL_ID;
    else process.env.GAME_RELEASE_VOICE_CHANNEL_ID = prevChannel;
    if (prevHost === undefined) delete process.env.VPS_PUBLIC_HOST;
    else process.env.VPS_PUBLIC_HOST = prevHost;
    if (prevPort === undefined) delete process.env.HEALTH_PORT;
    else process.env.HEALTH_PORT = prevPort;
  });

  it("builds the public showcase URL", () => {
    expect(getShowcaseUrl()).toBe("http://31.220.79.90:3000/releases/showcase");
  });

  it("posts the link in the voice channel chat and replaces the previous message", async () => {
    const send = vi.fn().mockResolvedValue({ id: "msg-2" });
    const del = vi.fn().mockResolvedValue(undefined);
    const fetchMsg = vi.fn().mockResolvedValue({ delete: del });
    const client = {
      channels: {
        fetch: vi.fn().mockResolvedValue({
          isTextBased: () => true,
          messages: { fetch: fetchMsg },
          send,
        }),
      },
    };

    await postShowcaseLink(client as never);
    expect(send).toHaveBeenCalledTimes(1);
    const payload = send.mock.calls[0][0];
    expect(payload.embeds[0].data.description).toContain(
      "http://31.220.79.90:3000/releases/showcase",
    );

    await postShowcaseLink(client as never);
    expect(fetchMsg).toHaveBeenCalledWith("msg-2");
    expect(del).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("does nothing without GAME_RELEASE_VOICE_CHANNEL_ID", async () => {
    delete process.env.GAME_RELEASE_VOICE_CHANNEL_ID;
    const fetch = vi.fn();
    await postShowcaseLink({ channels: { fetch } } as never);
    expect(fetch).not.toHaveBeenCalled();
  });
});
