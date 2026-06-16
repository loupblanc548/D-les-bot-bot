"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const node_cron_1 = __importDefault(require("node-cron"));
// === Mocks hoisted ===
const mockAxiosGet = vitest_1.vi.hoisted(() => vitest_1.vi.fn());
const mockPrisma = vitest_1.vi.hoisted(() => ({
    processedTweets: {
        findUnique: vitest_1.vi.fn(),
        create: vitest_1.vi.fn(),
    },
}));
const mockLogger = vitest_1.vi.hoisted(() => ({
    info: vitest_1.vi.fn(),
    warn: vitest_1.vi.fn(),
    error: vitest_1.vi.fn(),
}));
const mockConfig = vitest_1.vi.hoisted(() => ({
    twitterChannel: "123456789",
    twitterAccounts: "fortnitegame,helldivers2",
}));
// === Module mocks ===
vitest_1.vi.mock("axios", () => ({
    default: { get: mockAxiosGet },
}));
vitest_1.vi.mock("../prisma", () => ({
    default: mockPrisma,
}));
vitest_1.vi.mock("../utils/logger", () => ({
    default: mockLogger,
}));
vitest_1.vi.mock("../config", () => ({
    config: mockConfig,
}));
vitest_1.vi.mock("discord.js", async () => {
    const actual = await vitest_1.vi.importActual("discord.js");
    return {
        ...actual,
        EmbedBuilder: vitest_1.vi.fn().mockImplementation(function () {
            this.setTitle = vitest_1.vi.fn().mockReturnThis();
            this.setURL = vitest_1.vi.fn().mockReturnThis();
            this.setColor = vitest_1.vi.fn().mockReturnThis();
            this.setAuthor = vitest_1.vi.fn().mockReturnThis();
            this.setDescription = vitest_1.vi.fn().mockReturnThis();
            this.addFields = vitest_1.vi.fn().mockReturnThis();
            this.setFooter = vitest_1.vi.fn().mockReturnThis();
            this.setTimestamp = vitest_1.vi.fn().mockReturnThis();
            this.setImage = vitest_1.vi.fn().mockReturnThis();
            return this;
        }),
    };
});
const twitterCron_1 = require("./twitterCron");
// === Helpers ===
function createMockTextChannel() {
    return {
        isTextBased: () => true,
        send: vitest_1.vi.fn().mockResolvedValue(undefined),
    };
}
function createMockClient(channel) {
    return {
        channels: {
            fetch: vitest_1.vi.fn().mockResolvedValue(channel),
        },
    };
}
function rssItem(overrides = {}) {
    return {
        title: overrides.title ?? "Tweet from @test",
        link: overrides.link ?? "https://x.com/test/status/12345",
        pubDate: overrides.pubDate ?? "2026-06-12T12:00:00.000Z",
        description: overrides.description ?? "Tweet content here",
    };
}
// === Setup / Teardown ===
(0, vitest_1.beforeEach)(() => {
    vitest_1.vi.clearAllMocks();
    vitest_1.vi.useFakeTimers();
    mockConfig.twitterChannel = "123456789";
    mockConfig.twitterAccounts = "fortnitegame,helldivers2";
    (0, twitterCron_1.stopTwitterMonitoring)();
});
(0, vitest_1.afterEach)(() => {
    vitest_1.vi.restoreAllMocks();
    vitest_1.vi.useRealTimers();
});
// ==================== Tests ====================
(0, vitest_1.describe)("extractTweetId", () => {
    (0, vitest_1.it)("extrait l'ID du tweet depuis une URL x.com", () => {
        (0, vitest_1.expect)((0, twitterCron_1.extractTweetId)("https://x.com/user/status/1234567890")).toBe("1234567890");
        (0, vitest_1.expect)((0, twitterCron_1.extractTweetId)("https://twitter.com/user/status/9876543210")).toBe("9876543210");
    });
    (0, vitest_1.it)("retourne null si pas d'ID", () => {
        (0, vitest_1.expect)((0, twitterCron_1.extractTweetId)("https://x.com/user")).toBeNull();
        (0, vitest_1.expect)((0, twitterCron_1.extractTweetId)("")).toBeNull();
    });
});
(0, vitest_1.describe)("checkTwitterAccounts", () => {
    (0, vitest_1.it)("r\u00E9cup\u00E8re et posté les tweets de tous les comptes configur\u00E9s", async () => {
        const ch = createMockTextChannel();
        const cl = createMockClient(ch);
        // RSS feed for fortnitegame
        mockAxiosGet.mockResolvedValueOnce({
            data: `<rss><channel><item>
        <title>Tweet 1</title>
        <link>https://x.com/fortnitegame/status/111</link>
        <pubDate>2026-06-12</pubDate>
        <description>New season!</description>
      </item></channel></rss>`,
        });
        // RSS feed for helldivers2
        mockAxiosGet.mockResolvedValueOnce({
            data: `<rss><channel><item>
        <title>Tweet 2</title>
        <link>https://x.com/helldivers2/status/222</link>
        <pubDate>2026-06-12</pubDate>
        <description>For democracy!</description>
      </item></channel></rss>`,
        });
        mockPrisma.processedTweets.findUnique.mockResolvedValue(null);
        mockPrisma.processedTweets.create.mockResolvedValue({});
        const p = (0, twitterCron_1.checkTwitterAccounts)(cl);
        await vitest_1.vi.runAllTimersAsync();
        await p;
        // 2 tweets post\u00E9s
        (0, vitest_1.expect)(ch.send).toHaveBeenCalledTimes(2);
        // 2 entr\u00E9es en BDD
        (0, vitest_1.expect)(mockPrisma.processedTweets.create).toHaveBeenCalledTimes(2);
        (0, vitest_1.expect)(mockPrisma.processedTweets.create).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            data: vitest_1.expect.objectContaining({ tweetId: "111", account: "fortnitegame" }),
        }));
        (0, vitest_1.expect)(mockPrisma.processedTweets.create).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            data: vitest_1.expect.objectContaining({ tweetId: "222", account: "helldivers2" }),
        }));
    });
    (0, vitest_1.it)("ne reposté pas un tweet d\u00E9j\u00E0 connu", async () => {
        const ch = createMockTextChannel();
        const cl = createMockClient(ch);
        mockAxiosGet.mockResolvedValue({
            data: `<rss><channel><item>
        <title>Old tweet</title>
        <link>https://x.com/fortnitegame/status/999</link>
        <description>Already seen</description>
      </item></channel></rss>`,
        });
        mockPrisma.processedTweets.findUnique.mockResolvedValue({
            id: 1,
            tweetId: "999",
            account: "fortnitegame",
            content: "Already seen",
            processedAt: new Date(),
        });
        const p = (0, twitterCron_1.checkTwitterAccounts)(cl);
        await vitest_1.vi.runAllTimersAsync();
        await p;
        (0, vitest_1.expect)(ch.send).not.toHaveBeenCalled();
        (0, vitest_1.expect)(mockPrisma.processedTweets.create).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)("ne fait rien quand aucun salon configur\u00E9", async () => {
        mockConfig.twitterChannel = "";
        const cl = createMockClient(createMockTextChannel());
        const p = (0, twitterCron_1.checkTwitterAccounts)(cl);
        await vitest_1.vi.runAllTimersAsync();
        await p;
        (0, vitest_1.expect)(mockAxiosGet).not.toHaveBeenCalled();
        (0, vitest_1.expect)(mockLogger.warn).toHaveBeenCalledWith(vitest_1.expect.stringContaining("non configur"));
    });
    (0, vitest_1.it)("ne fait rien quand aucun compte configur\u00E9", async () => {
        mockConfig.twitterAccounts = "";
        const ch = createMockTextChannel();
        const cl = createMockClient(ch);
        const p = (0, twitterCron_1.checkTwitterAccounts)(cl);
        await vitest_1.vi.runAllTimersAsync();
        await p;
        (0, vitest_1.expect)(mockAxiosGet).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)("continue malgr\u00E9 l'\u00E9chec d'un flux RSS (Promise.allSettled)", async () => {
        const ch = createMockTextChannel();
        const cl = createMockClient(ch);
        mockConfig.twitterAccounts = "compte1,compte2,compte3";
        // compte1: succ\u00E8s
        mockAxiosGet.mockResolvedValueOnce({
            data: `<rss><channel><item>
        <title>OK</title>
        <link>https://x.com/compte1/status/1</link>
        <description>Works</description>
      </item></channel></rss>`,
        });
        // compte2: erreur r\u00E9seau
        mockAxiosGet.mockRejectedValueOnce(new Error("Network error"));
        // compte3: succ\u00E8s
        mockAxiosGet.mockResolvedValueOnce({
            data: `<rss><channel><item>
        <title>OK3</title>
        <link>https://x.com/compte3/status/3</link>
        <description>Also works</description>
      </item></channel></rss>`,
        });
        mockPrisma.processedTweets.findUnique.mockResolvedValue(null);
        mockPrisma.processedTweets.create.mockResolvedValue({});
        const p = (0, twitterCron_1.checkTwitterAccounts)(cl);
        await vitest_1.vi.runAllTimersAsync();
        await p;
        // Les 3 appels ont \u00E9t\u00E9 tent\u00E9s
        (0, vitest_1.expect)(mockAxiosGet).toHaveBeenCalledTimes(3);
        // L'erreur est logg\u00E9e
        (0, vitest_1.expect)(mockLogger.warn).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Flux RSS inaccessible pour @compte2: Network error"));
        // 2 tweets post\u00E9s (compte1 + compte3)
        (0, vitest_1.expect)(ch.send).toHaveBeenCalledTimes(2);
    });
    (0, vitest_1.it)("inclut l'image dans l'embed quand le tweet en contient une", async () => {
        const ch = createMockTextChannel();
        const cl = createMockClient(ch);
        mockConfig.twitterAccounts = "test";
        mockAxiosGet.mockResolvedValue({
            data: `<rss><channel><item>
        <title>Tweet with image</title>
        <link>https://x.com/test/status/555</link>
        <description>&lt;img src="https://pbs.twimg.com/media/abc.jpg" /&gt; Tweet text</description>
      </item></channel></rss>`,
        });
        mockPrisma.processedTweets.findUnique.mockResolvedValue(null);
        mockPrisma.processedTweets.create.mockResolvedValue({});
        const p = (0, twitterCron_1.checkTwitterAccounts)(cl);
        await vitest_1.vi.runAllTimersAsync();
        await p;
        (0, vitest_1.expect)(ch.send).toHaveBeenCalledTimes(1);
        const sendCall = ch.send.mock.calls[0][0];
        (0, vitest_1.expect)(sendCall.embeds).toBeDefined();
        (0, vitest_1.expect)(sendCall.embeds.length).toBe(1);
        // V\u00E9rifie que setImage a \u00E9t\u00E9 appel\u00E9 sur l'embed
        const embed = sendCall.embeds[0];
        (0, vitest_1.expect)(embed.setImage).toHaveBeenCalledWith("https://pbs.twimg.com/media/abc.jpg");
    });
});
(0, vitest_1.describe)("startTwitterMonitoring / stopTwitterMonitoring", () => {
    (0, vitest_1.it)("démarre un check immédiat et crée un intervalle", () => {
        const ch = createMockTextChannel();
        const cl = createMockClient(ch);
        const spy = vitest_1.vi.spyOn(node_cron_1.default, "schedule").mockReturnValue({ stop: vitest_1.vi.fn() });
        (0, twitterCron_1.startTwitterMonitoring)(cl);
        (0, vitest_1.expect)(spy).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(spy).toHaveBeenCalledWith("*/15 * * * *", vitest_1.expect.any(Function));
        (0, vitest_1.expect)(mockLogger.info).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Exécution Cron planifiée"));
    });
    (0, vitest_1.it)("ne démarre pas deux fois", () => {
        const ch = createMockTextChannel();
        const cl = createMockClient(ch);
        vitest_1.vi.spyOn(node_cron_1.default, "schedule").mockReturnValue({ stop: vitest_1.vi.fn() });
        (0, twitterCron_1.startTwitterMonitoring)(cl);
        (0, twitterCron_1.startTwitterMonitoring)(cl);
        (0, vitest_1.expect)(mockLogger.warn).toHaveBeenCalledWith("[TwitterCron] Déjà actif — ignoré");
    });
    (0, vitest_1.it)("stop supprime l'intervalle proprement", () => {
        const mockStop = vitest_1.vi.fn();
        vitest_1.vi.spyOn(node_cron_1.default, "schedule").mockReturnValue({ stop: mockStop });
        const spy = vitest_1.vi.spyOn(node_cron_1.default, "schedule");
        const ch = createMockTextChannel();
        const cl = createMockClient(ch);
        (0, twitterCron_1.startTwitterMonitoring)(cl);
        (0, twitterCron_1.stopTwitterMonitoring)();
        (0, vitest_1.expect)(mockStop).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(mockLogger.info).toHaveBeenCalledWith(vitest_1.expect.stringContaining("[TwitterCron] Arrêté"));
    });
});
//# sourceMappingURL=twitterCron.test.js.map