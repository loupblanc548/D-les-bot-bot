import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { textOf, extractLink } from "../utils/rss-parser.js";

describe("textOf (internal helper)", () => {
  it("should return string values directly", () => {
    expect(textOf("hello")).toBe("hello");
  });

  it("should extract #text from objects", () => {
    expect(textOf({ "#text": "nested value" })).toBe("nested value");
  });

  it("should return empty string for undefined/null", () => {
    expect(textOf(undefined)).toBe("");
    expect(textOf(null)).toBe("");
  });

  it("should return empty string for objects without #text", () => {
    expect(textOf({ other: "field" })).toBe("");
  });

  it("should return empty string for numbers", () => {
    expect(textOf(42)).toBe("");
  });

  it("should return empty string for arrays", () => {
    expect(textOf(["a", "b"])).toBe("");
  });
});

describe("extractLink (internal helper)", () => {
  it("should return empty string for falsy values", () => {
    expect(extractLink(null)).toBe("");
    expect(extractLink(undefined)).toBe("");
    expect(extractLink("")).toBe("");
  });

  it("should return string links directly", () => {
    expect(extractLink("https://example.com")).toBe("https://example.com");
  });

  it("should extract href from Atom-style array preferring alternate", () => {
    const links = [
      { "@_rel": "self", "@_href": "https://self.example.com" },
      { "@_rel": "alternate", "@_href": "https://alternate.example.com" },
    ];
    expect(extractLink(links)).toBe("https://alternate.example.com");
  });

  it("should fall back to first link if no alternate", () => {
    const links = [
      { "@_rel": "self", "@_href": "https://first.example.com" },
    ];
    expect(extractLink(links)).toBe("https://first.example.com");
  });

  it("should return empty string for empty array", () => {
    expect(extractLink([])).toBe("");
  });

  it("should extract @_href from single object", () => {
    expect(extractLink({ "@_href": "https://single.example.com" })).toBe("https://single.example.com");
  });

  it("should extract #text if no @_href", () => {
    expect(extractLink({ "#text": "https://text.example.com" })).toBe("https://text.example.com");
  });

  it("should return empty string for unrecognized object", () => {
    expect(extractLink({ other: "field" })).toBe("");
  });
});

// --- Monitor lifecycle tests ---

vi.mock("../prisma", () => ({
  default: {
    source: { findMany: vi.fn().mockResolvedValue([]) },
    notification: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import prisma from "../prisma.js";

vi.mock("../config", () => ({
  config: {
    maxRetroPosts: 25,
    steamEpicChannel: null,
    monitoringIntervalMs: 900000,  // 15 minutes
    steamTimeoutMs: 5000,
    youtubeTimeoutMs: 5000,
  },
}));

vi.mock("./feeds", () => ({
  runGamingFeeds: vi.fn().mockResolvedValue(undefined),
  sendToChannel: vi.fn(),
  logError: vi.fn(),
  PLATFORM_COLORS: {},
  PLATFORM_ICONS: {},
  PLATFORM_LABELS: {},
}));

vi.mock("./epicgames", () => ({
  fetchFreeGames: vi.fn().mockResolvedValue([]),
}));

vi.mock("../utils/image-helpers", () => ({
  getYouTubeThumbnail: vi.fn().mockResolvedValue(null),
  getOgImage: vi.fn().mockResolvedValue(null),
  getTweetImage: vi.fn().mockResolvedValue(null),
  extractMediaThumbnail: vi.fn(),
}));

vi.mock("../utils/gaming-embeds", () => ({
  embedEpicGames: vi.fn().mockReturnValue({
    setURL: vi.fn().mockReturnThis(),
    data: {},
  }),
}));

vi.mock("../utils/logger", () => ({
  default: {
    info: vi.fn().mockReturnThis(),
    error: vi.fn().mockReturnThis(),
    warn: vi.fn().mockReturnThis(),
  },
}));

vi.mock("../utils/logger", () => ({
  default: {
    info: vi.fn().mockReturnThis(),
    error: vi.fn().mockReturnThis(),
    warn: vi.fn().mockReturnThis(),
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { startMonitoring, stopMonitoring, runDbSourcesRetrospective } from "./monitor.js";
import { Client } from "discord.js";

function mockClient(): Client {
  return {
    channels: {
      cache: new Map(),
    },
    guilds: {
      cache: new Map(),
    },
  } as unknown as Client;
}

describe("startMonitoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    stopMonitoring();
  });

  afterEach(() => {
    stopMonitoring();
    vi.useRealTimers();
  });

  it("should call setInterval with the correct interval (15 minutes)", () => {
    const setIntervalSpy = vi.spyOn(global, "setInterval");
    const client = mockClient();
    startMonitoring(client);
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).toHaveBeenCalledWith(
      expect.any(Function),
      15 * 60 * 1000
    );
    setIntervalSpy.mockRestore();
  });

  it("should trigger checkAndNotify immediately on first call", async () => {
    // Using static prisma import (vi.hoisted)
    (prisma.source.findMany as any).mockResolvedValue([]);

    const client = mockClient();
    startMonitoring(client);

    // checkAndNotify is called synchronously but is async - flush microtasks
    await Promise.resolve();
    await Promise.resolve();

    expect(prisma.source.findMany).toHaveBeenCalled();
  });

  it("should log activation message on start", async () => {
    const { default: logger } = await import("../utils/logger.js");
    const client = mockClient();
    startMonitoring(client);

    expect(logger.info).toHaveBeenCalled();
    const infoCalls = (logger.info as any).mock.calls.map((c: any[]) => String(c[0]));
    expect(infoCalls.some((l: string) => l.includes("Surveillance activée"))).toBe(true);
    expect(infoCalls.some((l: string) => l.includes("15 min"))).toBe(true);

  });

  it("should NOT create a second interval if already running", () => {
    const setIntervalSpy = vi.spyOn(global, "setInterval");
    const client = mockClient();

    startMonitoring(client);
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    // Second call should be a no-op
    startMonitoring(client);
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    // Third call also no-op
    startMonitoring(client);
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    setIntervalSpy.mockRestore();
  });

  it("should not crash when checkAndNotify encounters internal errors", async () => {
    // checkAndNotify has its own try/catch, so startMonitoring never sees errors.
    // Verify: even when findMany throws, startMonitoring completes and creates the interval.
    const setIntervalSpy = vi.spyOn(global, "setInterval");
    const { default: logger } = await import("../utils/logger.js");
    // Using static prisma import (vi.hoisted)

    // Synchronous throw that checkAndNotify's internal try/catch will handle
    (prisma.source.findMany as any).mockImplementation(() => {
      throw new Error("Database connection lost");
    });

    const client = mockClient();
    expect(() => startMonitoring(client)).not.toThrow();

    // The interval should still be created (it's after the try/catch)
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    // checkAndNotify's internal catch logs "[Monitor] Erreur globale"
    const errorCalls = (logger.error as any).mock.calls.map((c: any[]) => String(c[0]));
    expect(errorCalls.some((e: string) => e.includes("Erreur globale"))).toBe(true);

    setIntervalSpy.mockRestore();
  });

  it("should create the interval regardless of checkAndNotify errors", async () => {
    // checkAndNotify handles its own errors internally. Even if it throws,
    // startMonitoring always creates the interval after its try/catch block.
    const setIntervalSpy = vi.spyOn(global, "setInterval");
    // Using static prisma import (vi.hoisted)

    (prisma.source.findMany as any).mockImplementation(() => {
      throw new Error("Simulated crash");
    });

    const { default: logger } = await import("../utils/logger.js");
    const client = mockClient();
    startMonitoring(client);

    // Interval is created after the try/catch, regardless of errors
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    setIntervalSpy.mockRestore();
  });

  it("should call checkAndNotify again when the interval fires", async () => {
    // Using static prisma import (vi.hoisted)
    (prisma.source.findMany as any).mockResolvedValue([]);

    const client = mockClient();
    startMonitoring(client);

    // Fully flush the first checkAndNotify invocation so isChecking becomes false
    await vi.advanceTimersByTimeAsync(0);

    // Clear the mock to track subsequent calls
    (prisma.source.findMany as any).mockClear();

    // Advance past the 15-minute interval and fully execute the async callback
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000 + 100);

    // checkAndNotify should have been called again via the setInterval callback
    expect(prisma.source.findMany).toHaveBeenCalled();
  });
});

describe("stopMonitoring", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopMonitoring();
    vi.useRealTimers();
  });

  it("should call clearInterval when monitoring is active", () => {
    const clearIntervalSpy = vi.spyOn(global, "clearInterval");
    const client = mockClient();
    startMonitoring(client);

    stopMonitoring();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);

    clearIntervalSpy.mockRestore();
  });

  it("should log deactivation message", async () => {
    const { default: logger } = await import("../utils/logger.js");
    const client = mockClient();
    startMonitoring(client);
    (logger.info as any).mockClear(); // Clear the start log

    stopMonitoring();

    expect(logger.info).toHaveBeenCalled();
    const infoCalls = (logger.info as any).mock.calls.map((c: any[]) => String(c[0]));
    expect(infoCalls.some((l: string) => l.includes("Surveillance arrêtée"))).toBe(true);

  });

  it("should NOT call clearInterval if not monitoring", () => {
    const clearIntervalSpy = vi.spyOn(global, "clearInterval");
    stopMonitoring();
    expect(clearIntervalSpy).not.toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });

  it("should be safe to call multiple times", () => {
    const clearIntervalSpy = vi.spyOn(global, "clearInterval");
    const client = mockClient();
    startMonitoring(client);

    // First stop: clears interval
    stopMonitoring();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);

    // Second stop: no-op (no interval active)
    stopMonitoring();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);

    // Third stop: still no-op
    stopMonitoring();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);

    clearIntervalSpy.mockRestore();
  });

  it("should be safe to call before any start", () => {
    expect(() => stopMonitoring()).not.toThrow();
  });
});
describe("runDbSourcesRetrospective", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should handle empty sources gracefully", async () => {
    // Using static prisma import (vi.hoisted)
    (prisma.source.findMany as any).mockResolvedValue([]);

    const client = mockClient();
    await expect(runDbSourcesRetrospective(client)).resolves.toBeUndefined();
  });

  it("should log start and end markers", async () => {
    const { default: logger } = await import("../utils/logger.js");
    // Using static prisma import (vi.hoisted)
    (prisma.source.findMany as any).mockResolvedValue([]);

    const client = mockClient();
    await runDbSourcesRetrospective(client);

    expect(logger.info).toHaveBeenCalled();
    const infoCalls = (logger.info as any).mock.calls.map((c: any[]) => String(c[0]));
    expect(infoCalls.some((l: string) => l.includes("RETROSPECTIVE DB"))).toBe(true);
    expect(infoCalls.some((l: string) => l.includes("Rattrapage DB terminé"))).toBe(true);

  });
  it("should process multiple items from a single source", async () => {
    // Using static prisma import (vi.hoisted)
    const { config } = await import("../config.js");

    config.maxRetroPosts = 25;

    // Mock a YouTube source
    (prisma.source.findMany as any).mockResolvedValue([
      { id: 1, type: "YOUTUBE", urlOrHandle: "TestChannel", channelId: "channel-1" },
    ]);

    // Mock fetch to return RSS with 3 videos
    mockFetch.mockImplementation(async () => new Response(`<?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <title>Video 1</title>
            <link rel="alternate" href="https://youtube.com/watch?v=aaa"/>
          </entry>
          <entry>
            <title>Video 2</title>
            <link rel="alternate" href="https://youtube.com/watch?v=bbb"/>
          </entry>
          <entry>
            <title>Video 3</title>
            <link rel="alternate" href="https://youtube.com/watch?v=ccc"/>
          </entry>
        </feed>`) as any);

    // No existing notifications → all 3 should be created
    (prisma.notification.findFirst as any).mockResolvedValue(null);
    (prisma.notification.create as any).mockResolvedValue({});

    // Mock a valid text channel
    const mockSend = vi.fn().mockResolvedValue(undefined);
    const client = {
      channels: {
        cache: new Map([
          ["channel-1", { isTextBased: () => true, send: mockSend }],
        ]),
      },
      guilds: { cache: new Map() },
    } as any;

    await runDbSourcesRetrospective(client);


    // All 3 notifications should be created
    expect(prisma.notification.create).toHaveBeenCalledTimes(3);
    // All 3 messages should be sent
    expect(mockSend).toHaveBeenCalledTimes(3);

    // Verify notification content
    const createCalls = (prisma.notification.create as any).mock.calls;
    expect(createCalls[0][0].data.content).toBe("Video 1");
    expect(createCalls[1][0].data.content).toBe("Video 2");
    expect(createCalls[2][0].data.content).toBe("Video 3");
  });

  it("should stop processing when MAX_RETRO_POSTS cap is reached", async () => {
    // Using static prisma import (vi.hoisted)
    const { config } = await import("../config.js");

    // Set a low cap
    config.maxRetroPosts = 2;

    // Mock 3 sources, each with items
    (prisma.source.findMany as any).mockResolvedValue([
      { id: 1, type: "YOUTUBE", urlOrHandle: "Channel1", channelId: "ch-1" },
      { id: 2, type: "YOUTUBE", urlOrHandle: "Channel2", channelId: "ch-2" },
      { id: 3, type: "YOUTUBE", urlOrHandle: "Channel3", channelId: "ch-3" },
    ]);

    // Each source returns 2 items (enough to exceed cap)
    mockFetch.mockImplementation(async () => new Response(`<?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <title>Video A</title>
            <link rel="alternate" href="https://youtube.com/watch?v=aaa"/>
          </entry>
          <entry>
            <title>Video B</title>
            <link rel="alternate" href="https://youtube.com/watch?v=bbb"/>
          </entry>
        </feed>`) as any);

    (prisma.notification.findFirst as any).mockResolvedValue(null);
    (prisma.notification.create as any).mockResolvedValue({});

    const mockSend = vi.fn().mockResolvedValue(undefined);
    const client = {
      channels: {
        cache: new Map([
          ["ch-1", { isTextBased: () => true, send: mockSend }],
          ["ch-2", { isTextBased: () => true, send: mockSend }],
          ["ch-3", { isTextBased: () => true, send: mockSend }],
        ]),
      },
      guilds: { cache: new Map() },
    } as any;

    const { default: logger } = await import("../utils/logger.js");

    await runDbSourcesRetrospective(client);

    // Should have created exactly 2 notifications (the cap)
    expect(prisma.notification.create).toHaveBeenCalledTimes(2);

    // Should have logged the cap message
    expect(logger.info).toHaveBeenCalled();
    const infoCalls = (logger.info as any).mock.calls.map((c: any[]) => String(c[0]));
    expect(infoCalls.some((l: string) => l.includes("Cap global atteint"))).toBe(true);
    expect(infoCalls.some((l: string) => l.includes("(2 publications)"))).toBe(true);

    // The 3rd source should NOT have been processed (cap reached)
    // We can verify by checking that only 2 creates happened
    expect(mockSend).toHaveBeenCalledTimes(2);

  });

  it("should skip items that already have notifications", async () => {
    // Using static prisma import (vi.hoisted)
    const { config } = await import("../config.js");

    config.maxRetroPosts = 25;

    (prisma.source.findMany as any).mockResolvedValue([
      { id: 1, type: "YOUTUBE", urlOrHandle: "TestChannel", channelId: "ch-1" },
    ]);

    mockFetch.mockImplementation(async () => new Response(`<?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <title>Already Notified</title>
            <link rel="alternate" href="https://youtube.com/watch?v=existing"/>
          </entry>
        </feed>`) as any);

    // Item already has a notification (simulate P2002 unique constraint violation)
    let callCount = 0;
    (prisma.notification.create as any).mockImplementation(() => {
      callCount++;
      const err = new Error("Unique constraint failed");
      (err as any).code = "P2002";
      throw err;
    });

    const mockSend = vi.fn().mockResolvedValue(undefined);
    const client = {
      channels: {
        cache: new Map([
          ["ch-1", { isTextBased: () => true, send: mockSend }],
        ]),
      },
      guilds: { cache: new Map() },
    } as any;

    await runDbSourcesRetrospective(client);

    // Should have attempted to create a notification (but got P2002 error)
    expect(prisma.notification.create).toHaveBeenCalled();
    // Should NOT have sent any message (because notification already exists)
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("should continue processing other sources after one fails", async () => {
    // Using static prisma import (vi.hoisted)
    const { config } = await import("../config.js");

    config.maxRetroPosts = 25;

    const { default: logger } = await import("../utils/logger.js");

    (prisma.source.findMany as any).mockResolvedValue([
      { id: 1, type: "YOUTUBE", urlOrHandle: "BadChannel", channelId: "ch-1" },
      { id: 2, type: "YOUTUBE", urlOrHandle: "GoodChannel", channelId: "ch-2" },
    ]);

    // Both sources get valid RSS, but BadChannel's notification.create throws
    mockFetch.mockImplementation(async () => new Response(`<?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <title>A Video</title>
            <link rel="alternate" href="https://youtube.com/watch?v=vid"/>
          </entry>
        </feed>`) as any);

    // No existing notifications
    (prisma.notification.findFirst as any).mockResolvedValue(null);

    // First create fails, second succeeds
    let createCallCount = 0;
    (prisma.notification.create as any).mockImplementation(() => {
      createCallCount++;
      if (createCallCount === 1) {
        throw new Error("DB error");
      }
      return {};
    });

    const mockSend = vi.fn().mockResolvedValue(undefined);
    const client = {
      channels: {
        cache: new Map([
          ["ch-1", { isTextBased: () => true, send: mockSend }],
          ["ch-2", { isTextBased: () => true, send: mockSend }],
        ]),
      },
      guilds: { cache: new Map() },
    } as any;

    await runDbSourcesRetrospective(client);

    // Should have attempted 2 creates
    expect(prisma.notification.create).toHaveBeenCalledTimes(2);
    // Should have sent 1 notification (from GoodChannel)
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalled();
  });
});
