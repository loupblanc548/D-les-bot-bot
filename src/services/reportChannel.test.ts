/**
 * reportChannel.test.ts — alert routing: immediate vs buffered
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAddAlertToBuffer = vi.hoisted(() => vi.fn());
const mockFindUnique = vi.hoisted(() => vi.fn());

vi.mock("../utils/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../utils/smart-alerts.js", () => ({
  addAlertToBuffer: mockAddAlertToBuffer,
}));

vi.mock("../config.js", () => ({
  config: {
    reportChannel: "cfg-report-channel",
    reportRoleId: "cfg-report-role",
  },
}));

vi.mock("../prisma.js", () => ({
  default: {
    guildConfig: {
      findUnique: mockFindUnique,
    },
  },
}));

import { sendSecurityAlert, clearReportChannelCache } from "./reportChannel.js";
import type { SecurityAlert } from "./reportChannel.js";

function mockClient(send: ReturnType<typeof vi.fn>) {
  const channel = {
    send,
    isTextBased: () => true,
  };
  return {
    channels: {
      cache: {
        get: vi.fn().mockReturnValue(channel),
      },
      fetch: vi.fn().mockResolvedValue(channel),
    },
  } as any;
}

const baseAlert: Omit<SecurityAlert, "type"> = {
  userId: "u1",
  userTag: "User#0001",
  guildId: "g1",
  reason: "test reason",
};

describe("sendSecurityAlert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearReportChannelCache();
    mockFindUnique.mockResolvedValue({ reportChannelId: "db-channel" });
  });

  it("sends raid/suspicious alerts immediately (not buffered)", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const client = mockClient(send);

    await sendSecurityAlert(client, {
      ...baseAlert,
      type: "SUSPICIOUS",
      reason: "Rush de joins détecté",
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(mockAddAlertToBuffer).not.toHaveBeenCalled();
    const payload = send.mock.calls[0][0];
    expect(payload.content).toBe("<@&cfg-report-role>");
    expect(payload.embeds).toHaveLength(1);
  });

  it("sends anti-spam alerts immediately", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const client = mockClient(send);

    await sendSecurityAlert(client, {
      ...baseAlert,
      type: "ANTI_SPAM",
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(mockAddAlertToBuffer).not.toHaveBeenCalled();
  });

  it("sends phishing alerts immediately", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const client = mockClient(send);

    await sendSecurityAlert(client, {
      ...baseAlert,
      type: "ANTI_PHISHING",
    });

    expect(send).toHaveBeenCalledTimes(1);
  });

  it("buffers noisy AI moderation alerts", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const client = mockClient(send);

    await sendSecurityAlert(client, {
      ...baseAlert,
      type: "AI_MODERATION",
      messageContent: "some toxic text",
    });

    expect(send).not.toHaveBeenCalled();
    expect(mockAddAlertToBuffer).toHaveBeenCalledTimes(1);
    expect(mockAddAlertToBuffer.mock.calls[0][0]).toBe("AI_MODERATION");
  });
});
