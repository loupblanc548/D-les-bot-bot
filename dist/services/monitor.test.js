"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const rss_parser_1 = require("../utils/rss-parser");
(0, vitest_1.describe)("textOf (internal helper)", () => {
    (0, vitest_1.it)("should return string values directly", () => {
        (0, vitest_1.expect)((0, rss_parser_1.textOf)("hello")).toBe("hello");
    });
    (0, vitest_1.it)("should extract #text from objects", () => {
        (0, vitest_1.expect)((0, rss_parser_1.textOf)({ "#text": "nested value" })).toBe("nested value");
    });
    (0, vitest_1.it)("should return empty string for undefined/null", () => {
        (0, vitest_1.expect)((0, rss_parser_1.textOf)(undefined)).toBe("");
        (0, vitest_1.expect)((0, rss_parser_1.textOf)(null)).toBe("");
    });
    (0, vitest_1.it)("should return empty string for objects without #text", () => {
        (0, vitest_1.expect)((0, rss_parser_1.textOf)({ other: "field" })).toBe("");
    });
    (0, vitest_1.it)("should return empty string for numbers", () => {
        (0, vitest_1.expect)((0, rss_parser_1.textOf)(42)).toBe("");
    });
    (0, vitest_1.it)("should return empty string for arrays", () => {
        (0, vitest_1.expect)((0, rss_parser_1.textOf)(["a", "b"])).toBe("");
    });
});
(0, vitest_1.describe)("extractLink (internal helper)", () => {
    (0, vitest_1.it)("should return empty string for falsy values", () => {
        (0, vitest_1.expect)((0, rss_parser_1.extractLink)(null)).toBe("");
        (0, vitest_1.expect)((0, rss_parser_1.extractLink)(undefined)).toBe("");
        (0, vitest_1.expect)((0, rss_parser_1.extractLink)("")).toBe("");
    });
    (0, vitest_1.it)("should return string links directly", () => {
        (0, vitest_1.expect)((0, rss_parser_1.extractLink)("https://example.com")).toBe("https://example.com");
    });
    (0, vitest_1.it)("should extract href from Atom-style array preferring alternate", () => {
        const links = [
            { "@_rel": "self", "@_href": "https://self.example.com" },
            { "@_rel": "alternate", "@_href": "https://alternate.example.com" },
        ];
        (0, vitest_1.expect)((0, rss_parser_1.extractLink)(links)).toBe("https://alternate.example.com");
    });
    (0, vitest_1.it)("should fall back to first link if no alternate", () => {
        const links = [
            { "@_rel": "self", "@_href": "https://first.example.com" },
        ];
        (0, vitest_1.expect)((0, rss_parser_1.extractLink)(links)).toBe("https://first.example.com");
    });
    (0, vitest_1.it)("should return empty string for empty array", () => {
        (0, vitest_1.expect)((0, rss_parser_1.extractLink)([])).toBe("");
    });
    (0, vitest_1.it)("should extract @_href from single object", () => {
        (0, vitest_1.expect)((0, rss_parser_1.extractLink)({ "@_href": "https://single.example.com" })).toBe("https://single.example.com");
    });
    (0, vitest_1.it)("should extract #text if no @_href", () => {
        (0, vitest_1.expect)((0, rss_parser_1.extractLink)({ "#text": "https://text.example.com" })).toBe("https://text.example.com");
    });
    (0, vitest_1.it)("should return empty string for unrecognized object", () => {
        (0, vitest_1.expect)((0, rss_parser_1.extractLink)({ other: "field" })).toBe("");
    });
});
// --- Monitor lifecycle tests ---
vitest_1.vi.mock("../prisma", () => ({
    default: {
        source: { findMany: vitest_1.vi.fn().mockResolvedValue([]) },
        notification: {
            findFirst: vitest_1.vi.fn(),
            create: vitest_1.vi.fn(),
        },
    },
}));
const prisma_1 = __importDefault(require("../prisma"));
vitest_1.vi.mock("../config", () => ({
    config: {
        maxRetroPosts: 25,
        steamEpicChannel: null,
        monitoringIntervalMs: 900000, // 15 minutes
        steamTimeoutMs: 5000,
        youtubeTimeoutMs: 5000,
    },
}));
vitest_1.vi.mock("./feeds", () => ({
    runGamingFeeds: vitest_1.vi.fn().mockResolvedValue(undefined),
    sendToChannel: vitest_1.vi.fn(),
    logError: vitest_1.vi.fn(),
    PLATFORM_COLORS: {},
    PLATFORM_ICONS: {},
    PLATFORM_LABELS: {},
}));
vitest_1.vi.mock("./epicgames", () => ({
    fetchFreeGames: vitest_1.vi.fn().mockResolvedValue([]),
}));
vitest_1.vi.mock("../utils/image-helpers", () => ({
    getYouTubeThumbnail: vitest_1.vi.fn().mockResolvedValue(null),
    getOgImage: vitest_1.vi.fn().mockResolvedValue(null),
    getTweetImage: vitest_1.vi.fn().mockResolvedValue(null),
    extractMediaThumbnail: vitest_1.vi.fn(),
}));
vitest_1.vi.mock("../utils/gaming-embeds", () => ({
    embedEpicGames: vitest_1.vi.fn().mockReturnValue({
        setURL: vitest_1.vi.fn().mockReturnThis(),
        data: {},
    }),
}));
vitest_1.vi.mock("../utils/logger", () => ({
    default: {
        info: vitest_1.vi.fn().mockReturnThis(),
        error: vitest_1.vi.fn().mockReturnThis(),
        warn: vitest_1.vi.fn().mockReturnThis(),
    },
}));
vitest_1.vi.mock("../utils/logger", () => ({
    default: {
        info: vitest_1.vi.fn().mockReturnThis(),
        error: vitest_1.vi.fn().mockReturnThis(),
        warn: vitest_1.vi.fn().mockReturnThis(),
    },
}));
const mockFetch = vitest_1.vi.fn();
vitest_1.vi.stubGlobal("fetch", mockFetch);
const monitor_1 = require("./monitor");
function mockClient() {
    return {
        channels: {
            cache: new Map(),
        },
        guilds: {
            cache: new Map(),
        },
    };
}
(0, vitest_1.describe)("startMonitoring", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        vitest_1.vi.useFakeTimers();
        (0, monitor_1.stopMonitoring)();
    });
    (0, vitest_1.afterEach)(() => {
        (0, monitor_1.stopMonitoring)();
        vitest_1.vi.useRealTimers();
    });
    (0, vitest_1.it)("should call setInterval with the correct interval (15 minutes)", () => {
        const setIntervalSpy = vitest_1.vi.spyOn(global, "setInterval");
        const client = mockClient();
        (0, monitor_1.startMonitoring)(client);
        (0, vitest_1.expect)(setIntervalSpy).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(setIntervalSpy).toHaveBeenCalledWith(vitest_1.expect.any(Function), 15 * 60 * 1000);
        setIntervalSpy.mockRestore();
    });
    (0, vitest_1.it)("should trigger checkAndNotify immediately on first call", async () => {
        // Using static prisma import (vi.hoisted)
        prisma_1.default.source.findMany.mockResolvedValue([]);
        const client = mockClient();
        (0, monitor_1.startMonitoring)(client);
        // checkAndNotify is called synchronously but is async - flush microtasks
        await Promise.resolve();
        await Promise.resolve();
        (0, vitest_1.expect)(prisma_1.default.source.findMany).toHaveBeenCalled();
    });
    (0, vitest_1.it)("should log activation message on start", async () => {
        const { default: logger } = await Promise.resolve().then(() => __importStar(require("../utils/logger")));
        const client = mockClient();
        (0, monitor_1.startMonitoring)(client);
        (0, vitest_1.expect)(logger.info).toHaveBeenCalled();
        const infoCalls = logger.info.mock.calls.map((c) => String(c[0]));
        (0, vitest_1.expect)(infoCalls.some((l) => l.includes("Surveillance activée"))).toBe(true);
        (0, vitest_1.expect)(infoCalls.some((l) => l.includes("15 min"))).toBe(true);
    });
    (0, vitest_1.it)("should NOT create a second interval if already running", () => {
        const setIntervalSpy = vitest_1.vi.spyOn(global, "setInterval");
        const client = mockClient();
        (0, monitor_1.startMonitoring)(client);
        (0, vitest_1.expect)(setIntervalSpy).toHaveBeenCalledTimes(1);
        // Second call should be a no-op
        (0, monitor_1.startMonitoring)(client);
        (0, vitest_1.expect)(setIntervalSpy).toHaveBeenCalledTimes(1);
        // Third call also no-op
        (0, monitor_1.startMonitoring)(client);
        (0, vitest_1.expect)(setIntervalSpy).toHaveBeenCalledTimes(1);
        setIntervalSpy.mockRestore();
    });
    (0, vitest_1.it)("should not crash when checkAndNotify encounters internal errors", async () => {
        // checkAndNotify has its own try/catch, so startMonitoring never sees errors.
        // Verify: even when findMany throws, startMonitoring completes and creates the interval.
        const setIntervalSpy = vitest_1.vi.spyOn(global, "setInterval");
        const { default: logger } = await Promise.resolve().then(() => __importStar(require("../utils/logger")));
        // Using static prisma import (vi.hoisted)
        // Synchronous throw that checkAndNotify's internal try/catch will handle
        prisma_1.default.source.findMany.mockImplementation(() => {
            throw new Error("Database connection lost");
        });
        const client = mockClient();
        (0, vitest_1.expect)(() => (0, monitor_1.startMonitoring)(client)).not.toThrow();
        // The interval should still be created (it's after the try/catch)
        (0, vitest_1.expect)(setIntervalSpy).toHaveBeenCalledTimes(1);
        // checkAndNotify's internal catch logs "[Monitor] Erreur globale"
        const errorCalls = logger.error.mock.calls.map((c) => String(c[0]));
        (0, vitest_1.expect)(errorCalls.some((e) => e.includes("Erreur globale"))).toBe(true);
        setIntervalSpy.mockRestore();
    });
    (0, vitest_1.it)("should create the interval regardless of checkAndNotify errors", async () => {
        // checkAndNotify handles its own errors internally. Even if it throws,
        // startMonitoring always creates the interval after its try/catch block.
        const setIntervalSpy = vitest_1.vi.spyOn(global, "setInterval");
        // Using static prisma import (vi.hoisted)
        prisma_1.default.source.findMany.mockImplementation(() => {
            throw new Error("Simulated crash");
        });
        const { default: logger } = await Promise.resolve().then(() => __importStar(require("../utils/logger")));
        const client = mockClient();
        (0, monitor_1.startMonitoring)(client);
        // Interval is created after the try/catch, regardless of errors
        (0, vitest_1.expect)(setIntervalSpy).toHaveBeenCalledTimes(1);
        setIntervalSpy.mockRestore();
    });
    (0, vitest_1.it)("should call checkAndNotify again when the interval fires", async () => {
        // Using static prisma import (vi.hoisted)
        prisma_1.default.source.findMany.mockResolvedValue([]);
        const client = mockClient();
        (0, monitor_1.startMonitoring)(client);
        // Fully flush the first checkAndNotify invocation so isChecking becomes false
        await vitest_1.vi.advanceTimersByTimeAsync(0);
        // Clear the mock to track subsequent calls
        prisma_1.default.source.findMany.mockClear();
        // Advance past the 15-minute interval and fully execute the async callback
        await vitest_1.vi.advanceTimersByTimeAsync(15 * 60 * 1000 + 100);
        // checkAndNotify should have been called again via the setInterval callback
        (0, vitest_1.expect)(prisma_1.default.source.findMany).toHaveBeenCalled();
    });
});
(0, vitest_1.describe)("stopMonitoring", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.useFakeTimers();
    });
    (0, vitest_1.afterEach)(() => {
        (0, monitor_1.stopMonitoring)();
        vitest_1.vi.useRealTimers();
    });
    (0, vitest_1.it)("should call clearInterval when monitoring is active", () => {
        const clearIntervalSpy = vitest_1.vi.spyOn(global, "clearInterval");
        const client = mockClient();
        (0, monitor_1.startMonitoring)(client);
        (0, monitor_1.stopMonitoring)();
        (0, vitest_1.expect)(clearIntervalSpy).toHaveBeenCalledTimes(1);
        clearIntervalSpy.mockRestore();
    });
    (0, vitest_1.it)("should log deactivation message", async () => {
        const { default: logger } = await Promise.resolve().then(() => __importStar(require("../utils/logger")));
        const client = mockClient();
        (0, monitor_1.startMonitoring)(client);
        logger.info.mockClear(); // Clear the start log
        (0, monitor_1.stopMonitoring)();
        (0, vitest_1.expect)(logger.info).toHaveBeenCalled();
        const infoCalls = logger.info.mock.calls.map((c) => String(c[0]));
        (0, vitest_1.expect)(infoCalls.some((l) => l.includes("Surveillance arrêtée"))).toBe(true);
    });
    (0, vitest_1.it)("should NOT call clearInterval if not monitoring", () => {
        const clearIntervalSpy = vitest_1.vi.spyOn(global, "clearInterval");
        (0, monitor_1.stopMonitoring)();
        (0, vitest_1.expect)(clearIntervalSpy).not.toHaveBeenCalled();
        clearIntervalSpy.mockRestore();
    });
    (0, vitest_1.it)("should be safe to call multiple times", () => {
        const clearIntervalSpy = vitest_1.vi.spyOn(global, "clearInterval");
        const client = mockClient();
        (0, monitor_1.startMonitoring)(client);
        // First stop: clears interval
        (0, monitor_1.stopMonitoring)();
        (0, vitest_1.expect)(clearIntervalSpy).toHaveBeenCalledTimes(1);
        // Second stop: no-op (no interval active)
        (0, monitor_1.stopMonitoring)();
        (0, vitest_1.expect)(clearIntervalSpy).toHaveBeenCalledTimes(1);
        // Third stop: still no-op
        (0, monitor_1.stopMonitoring)();
        (0, vitest_1.expect)(clearIntervalSpy).toHaveBeenCalledTimes(1);
        clearIntervalSpy.mockRestore();
    });
    (0, vitest_1.it)("should be safe to call before any start", () => {
        (0, vitest_1.expect)(() => (0, monitor_1.stopMonitoring)()).not.toThrow();
    });
});
(0, vitest_1.describe)("runDbSourcesRetrospective", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)("should handle empty sources gracefully", async () => {
        // Using static prisma import (vi.hoisted)
        prisma_1.default.source.findMany.mockResolvedValue([]);
        const client = mockClient();
        await (0, vitest_1.expect)((0, monitor_1.runDbSourcesRetrospective)(client)).resolves.toBeUndefined();
    });
    (0, vitest_1.it)("should log start and end markers", async () => {
        const { default: logger } = await Promise.resolve().then(() => __importStar(require("../utils/logger")));
        // Using static prisma import (vi.hoisted)
        prisma_1.default.source.findMany.mockResolvedValue([]);
        const client = mockClient();
        await (0, monitor_1.runDbSourcesRetrospective)(client);
        (0, vitest_1.expect)(logger.info).toHaveBeenCalled();
        const infoCalls = logger.info.mock.calls.map((c) => String(c[0]));
        (0, vitest_1.expect)(infoCalls.some((l) => l.includes("RETROSPECTIVE DB"))).toBe(true);
        (0, vitest_1.expect)(infoCalls.some((l) => l.includes("Rattrapage DB terminé"))).toBe(true);
    });
    (0, vitest_1.it)("should process multiple items from a single source", async () => {
        // Using static prisma import (vi.hoisted)
        const { config } = await Promise.resolve().then(() => __importStar(require("../config")));
        config.maxRetroPosts = 25;
        // Mock a YouTube source
        prisma_1.default.source.findMany.mockResolvedValue([
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
        </feed>`));
        // No existing notifications → all 3 should be created
        prisma_1.default.notification.findFirst.mockResolvedValue(null);
        prisma_1.default.notification.create.mockResolvedValue({});
        // Mock a valid text channel
        const mockSend = vitest_1.vi.fn().mockResolvedValue(undefined);
        const client = {
            channels: {
                cache: new Map([
                    ["channel-1", { isTextBased: () => true, send: mockSend }],
                ]),
            },
            guilds: { cache: new Map() },
        };
        await (0, monitor_1.runDbSourcesRetrospective)(client);
        // All 3 notifications should be created
        (0, vitest_1.expect)(prisma_1.default.notification.create).toHaveBeenCalledTimes(3);
        // All 3 messages should be sent
        (0, vitest_1.expect)(mockSend).toHaveBeenCalledTimes(3);
        // Verify notification content
        const createCalls = prisma_1.default.notification.create.mock.calls;
        (0, vitest_1.expect)(createCalls[0][0].data.content).toBe("Video 1");
        (0, vitest_1.expect)(createCalls[1][0].data.content).toBe("Video 2");
        (0, vitest_1.expect)(createCalls[2][0].data.content).toBe("Video 3");
    });
    (0, vitest_1.it)("should stop processing when MAX_RETRO_POSTS cap is reached", async () => {
        // Using static prisma import (vi.hoisted)
        const { config } = await Promise.resolve().then(() => __importStar(require("../config")));
        // Set a low cap
        config.maxRetroPosts = 2;
        // Mock 3 sources, each with items
        prisma_1.default.source.findMany.mockResolvedValue([
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
        </feed>`));
        prisma_1.default.notification.findFirst.mockResolvedValue(null);
        prisma_1.default.notification.create.mockResolvedValue({});
        const mockSend = vitest_1.vi.fn().mockResolvedValue(undefined);
        const client = {
            channels: {
                cache: new Map([
                    ["ch-1", { isTextBased: () => true, send: mockSend }],
                    ["ch-2", { isTextBased: () => true, send: mockSend }],
                    ["ch-3", { isTextBased: () => true, send: mockSend }],
                ]),
            },
            guilds: { cache: new Map() },
        };
        const { default: logger } = await Promise.resolve().then(() => __importStar(require("../utils/logger")));
        await (0, monitor_1.runDbSourcesRetrospective)(client);
        // Should have created exactly 2 notifications (the cap)
        (0, vitest_1.expect)(prisma_1.default.notification.create).toHaveBeenCalledTimes(2);
        // Should have logged the cap message
        (0, vitest_1.expect)(logger.info).toHaveBeenCalled();
        const infoCalls = logger.info.mock.calls.map((c) => String(c[0]));
        (0, vitest_1.expect)(infoCalls.some((l) => l.includes("Cap global atteint"))).toBe(true);
        (0, vitest_1.expect)(infoCalls.some((l) => l.includes("(2 publications)"))).toBe(true);
        // The 3rd source should NOT have been processed (cap reached)
        // We can verify by checking that only 2 creates happened
        (0, vitest_1.expect)(mockSend).toHaveBeenCalledTimes(2);
    });
    (0, vitest_1.it)("should skip items that already have notifications", async () => {
        // Using static prisma import (vi.hoisted)
        const { config } = await Promise.resolve().then(() => __importStar(require("../config")));
        config.maxRetroPosts = 25;
        prisma_1.default.source.findMany.mockResolvedValue([
            { id: 1, type: "YOUTUBE", urlOrHandle: "TestChannel", channelId: "ch-1" },
        ]);
        mockFetch.mockImplementation(async () => new Response(`<?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <title>Already Notified</title>
            <link rel="alternate" href="https://youtube.com/watch?v=existing"/>
          </entry>
        </feed>`));
        // Item already has a notification (simulate P2002 unique constraint violation)
        let callCount = 0;
        prisma_1.default.notification.create.mockImplementation(() => {
            callCount++;
            const err = new Error("Unique constraint failed");
            err.code = "P2002";
            throw err;
        });
        const mockSend = vitest_1.vi.fn().mockResolvedValue(undefined);
        const client = {
            channels: {
                cache: new Map([
                    ["ch-1", { isTextBased: () => true, send: mockSend }],
                ]),
            },
            guilds: { cache: new Map() },
        };
        await (0, monitor_1.runDbSourcesRetrospective)(client);
        // Should have attempted to create a notification (but got P2002 error)
        (0, vitest_1.expect)(prisma_1.default.notification.create).toHaveBeenCalled();
        // Should NOT have sent any message (because notification already exists)
        (0, vitest_1.expect)(mockSend).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)("should continue processing other sources after one fails", async () => {
        // Using static prisma import (vi.hoisted)
        const { config } = await Promise.resolve().then(() => __importStar(require("../config")));
        config.maxRetroPosts = 25;
        const { default: logger } = await Promise.resolve().then(() => __importStar(require("../utils/logger")));
        prisma_1.default.source.findMany.mockResolvedValue([
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
        </feed>`));
        // No existing notifications
        prisma_1.default.notification.findFirst.mockResolvedValue(null);
        // First create fails, second succeeds
        let createCallCount = 0;
        prisma_1.default.notification.create.mockImplementation(() => {
            createCallCount++;
            if (createCallCount === 1) {
                throw new Error("DB error");
            }
            return {};
        });
        const mockSend = vitest_1.vi.fn().mockResolvedValue(undefined);
        const client = {
            channels: {
                cache: new Map([
                    ["ch-1", { isTextBased: () => true, send: mockSend }],
                    ["ch-2", { isTextBased: () => true, send: mockSend }],
                ]),
            },
            guilds: { cache: new Map() },
        };
        await (0, monitor_1.runDbSourcesRetrospective)(client);
        // Should have attempted 2 creates
        (0, vitest_1.expect)(prisma_1.default.notification.create).toHaveBeenCalledTimes(2);
        // Should have sent 1 notification (from GoodChannel)
        (0, vitest_1.expect)(mockSend).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(logger.error).toHaveBeenCalled();
    });
});
//# sourceMappingURL=monitor.test.js.map