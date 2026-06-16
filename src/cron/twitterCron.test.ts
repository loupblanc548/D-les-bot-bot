import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import cron from "node-cron";

// === Mocks hoisted ===

const mockAxiosGet = vi.hoisted(() => vi.fn());

const mockPrisma = vi.hoisted(() => ({
  processedTweets: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
}));

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const mockConfig = vi.hoisted(() => ({
  twitterChannel: "123456789",
  twitterAccounts: "fortnitegame,helldivers2",
  // All platform channels point to the same test channel ID so PLATFORM_CONFIGS entries resolve
  steamEpicChannel: "123456789",
  playstationChannel: "123456789",
  xboxChannel: "123456789",
  nintendoChannel: "123456789",
  fortniteChannel: "123456789",
  instantGamingChannel: "123456789",
}));

// === Module mocks ===

vi.mock("axios", () => ({
  default: { get: mockAxiosGet },
}));

vi.mock("../prisma", () => ({
  default: mockPrisma,
}));

vi.mock("../utils/logger", () => ({
  default: mockLogger,
}));

vi.mock("../config", () => ({
  config: mockConfig,
}));

vi.mock("../utils/deduplicationCache", () => ({
  dedupCache: {
    reloadFromDisk: vi.fn(),
    isAlreadyProcessed: vi.fn().mockReturnValue(false),
    markAsProcessed: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("../utils/translator", () => ({
  isLikelyEnglish: vi.fn().mockReturnValue(false),
  translateToFrench: vi.fn().mockImplementation((text: string) => Promise.resolve(text)),
}));

vi.mock("discord.js", async () => {
  const actual = await vi.importActual("discord.js");
  return {
    ...actual,
    EmbedBuilder: vi.fn().mockImplementation(function (this: any) {
      this.setTitle = vi.fn().mockReturnThis();
      this.setURL = vi.fn().mockReturnThis();
      this.setColor = vi.fn().mockReturnThis();
      this.setAuthor = vi.fn().mockReturnThis();
      this.setDescription = vi.fn().mockReturnThis();
      this.addFields = vi.fn().mockReturnThis();
      this.setFooter = vi.fn().mockReturnThis();
      this.setTimestamp = vi.fn().mockReturnThis();
      this.setImage = vi.fn().mockReturnThis();
      return this;
    }),
  };
});

import {
  checkTwitterAccounts,
  startTwitterMonitoring,
  stopTwitterMonitoring,
  fetchTweetsForAccount,
  extractTweetId,
} from "./twitterCron";

// === Helpers ===

function createMockTextChannel() {
  return {
    isTextBased: () => true,
    send: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockClient(channel: any) {
  return {
    channels: {
      fetch: vi.fn().mockResolvedValue(channel),
    },
  } as any;
}

function rssItem(overrides: any = {}) {
  return {
    title: overrides.title ?? "Tweet from @test",
    link: overrides.link ?? "https://x.com/test/status/12345",
    pubDate: overrides.pubDate ?? new Date().toISOString(),
    description: overrides.description ?? "Tweet content here",
  };
}

// === Setup / Teardown ===

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockConfig.twitterChannel = "123456789";
  mockConfig.twitterAccounts = "fortnitegame,helldivers2";
  stopTwitterMonitoring();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ==================== Tests ====================

describe("extractTweetId", () => {
  it("extrait l'ID du tweet depuis une URL x.com", () => {
    expect(extractTweetId("https://x.com/user/status/1234567890")).toBe("1234567890");
    expect(extractTweetId("https://twitter.com/user/status/9876543210")).toBe("9876543210");
  });

  it("retourne null si pas d'ID", () => {
    expect(extractTweetId("https://x.com/user")).toBeNull();
    expect(extractTweetId("")).toBeNull();
  });
});

describe("checkTwitterAccounts", () => {
  it("r\u00E9cup\u00E8re et posté les tweets de tous les comptes configur\u00E9s", async () => {
    const ch = createMockTextChannel();
    const cl = createMockClient(ch);

    // RSS feed for fortnitegame
    mockAxiosGet.mockResolvedValueOnce({
      data: `<rss><channel><item>
        <title>Tweet 1</title>
        <link>https://x.com/fortnitegame/status/111</link>
        <pubDate>2026-06-15</pubDate>
        <description>New season!</description>
      </item></channel></rss>`,
    });

    // RSS feed for helldivers2
    mockAxiosGet.mockResolvedValueOnce({
      data: `<rss><channel><item>
        <title>Tweet 2</title>
        <link>https://x.com/helldivers2/status/222</link>
        <pubDate>2026-06-15</pubDate>
        <description>For democracy!</description>
      </item></channel></rss>`,
    });

    mockPrisma.processedTweets.findUnique.mockResolvedValue(null);
    mockPrisma.processedTweets.create.mockResolvedValue({});

    const p = checkTwitterAccounts(cl);
    await vi.runAllTimersAsync();
    await p;

    // 2 tweets post\u00E9s
    expect(ch.send).toHaveBeenCalledTimes(2);

    // 2 entr\u00E9es en BDD
    expect(mockPrisma.processedTweets.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.processedTweets.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tweetId: "111", account: "fortnitegame" }),
      })
    );
    expect(mockPrisma.processedTweets.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tweetId: "222", account: "helldivers2" }),
      })
    );
  });

  it("ne reposté pas un tweet d\u00E9j\u00E0 connu", async () => {
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

    const p = checkTwitterAccounts(cl);
    await vi.runAllTimersAsync();
    await p;

    expect(ch.send).not.toHaveBeenCalled();
    expect(mockPrisma.processedTweets.create).not.toHaveBeenCalled();
  });

  it("ne fait rien quand aucun salon configur\u00E9", async () => {
    mockConfig.twitterChannel = "";
    mockConfig.steamEpicChannel = "";
    mockConfig.playstationChannel = "";
    mockConfig.xboxChannel = "";
    mockConfig.nintendoChannel = "";
    mockConfig.fortniteChannel = "";
    mockConfig.instantGamingChannel = "";
    const cl = createMockClient(createMockTextChannel());

    const p = checkTwitterAccounts(cl);
    await vi.runAllTimersAsync();
    await p;

    expect(mockAxiosGet).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Aucun CHANNEL_ID"),
    );
  });

  it("ne fait rien quand aucun compte configur\u00E9", async () => {
    mockConfig.twitterAccounts = "";
    const ch = createMockTextChannel();
    const cl = createMockClient(ch);

    const p = checkTwitterAccounts(cl);
    await vi.runAllTimersAsync();
    await p;

    expect(mockAxiosGet).not.toHaveBeenCalled();
  });

  it("continue malgr\u00E9 l'\u00E9chec d'un flux RSS (Promise.allSettled)", async () => {
    const ch = createMockTextChannel();
    const cl = createMockClient(ch);
    mockConfig.twitterAccounts = "compte1,compte2,compte3";

    // compte1: succ\u00E8s
    mockAxiosGet.mockResolvedValueOnce({
      data: `<rss><channel><item>
        <title>OK</title>
        <link>https://x.com/compte1/status/1</link>
        <pubDate>2026-06-15</pubDate>
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
        <pubDate>2026-06-15</pubDate>
        <description>Also works</description>
      </item></channel></rss>`,
    });

    mockPrisma.processedTweets.findUnique.mockResolvedValue(null);
    mockPrisma.processedTweets.create.mockResolvedValue({});

    const p = checkTwitterAccounts(cl);
    await vi.runAllTimersAsync();
    await p;

    // Les 3 appels ont \u00E9t\u00E9 tent\u00E9s
    expect(mockAxiosGet).toHaveBeenCalledTimes(3);

    // L'erreur est logg\u00E9e
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Flux RSS inaccessible pour @compte2: Network error")
    );

    // 2 tweets post\u00E9s (compte1 + compte3)
    expect(ch.send).toHaveBeenCalledTimes(2);
  });

  it("inclut l'image dans l'embed quand le tweet en contient une", async () => {
    const ch = createMockTextChannel();
    const cl = createMockClient(ch);
    mockConfig.twitterAccounts = "test";

    mockAxiosGet.mockResolvedValue({
      data: `<rss><channel><item>
        <title>Tweet with image</title>
        <link>https://x.com/test/status/555</link>
        <pubDate>2026-06-15</pubDate>
        <description>&lt;img src="https://pbs.twimg.com/media/abc.jpg" /&gt; Tweet text</description>
      </item></channel></rss>`,
    });

    mockPrisma.processedTweets.findUnique.mockResolvedValue(null);
    mockPrisma.processedTweets.create.mockResolvedValue({});

    const p = checkTwitterAccounts(cl);
    await vi.runAllTimersAsync();
    await p;

    expect(ch.send).toHaveBeenCalledTimes(1);
    const sendCall = (ch.send as any).mock.calls[0][0];
    expect(sendCall.embeds).toBeDefined();
    expect(sendCall.embeds.length).toBe(1);

    // V\u00E9rifie que setImage a \u00E9t\u00E9 appel\u00E9 sur l'embed
    const embed = sendCall.embeds[0];
    expect(embed.setImage).toHaveBeenCalledWith("https://pbs.twimg.com/media/abc.jpg");
  });
});

describe("startTwitterMonitoring / stopTwitterMonitoring", () => {
  it("démarre un check immédiat et crée un intervalle", () => {
    const ch = createMockTextChannel();
    const cl = createMockClient(ch);

    const spy = vi.spyOn(cron, "schedule").mockReturnValue({ stop: vi.fn() } as any);
    startTwitterMonitoring(cl);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("*/15 * * * *", expect.any(Function));
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining("Exécution Cron planifiée"),
    );
  });

  it("ne démarre pas deux fois", () => {
    const ch = createMockTextChannel();
    const cl = createMockClient(ch);
    vi.spyOn(cron, "schedule").mockReturnValue({ stop: vi.fn() } as any);

    startTwitterMonitoring(cl);
    startTwitterMonitoring(cl);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      "[TwitterCron] Déjà actif — ignoré",
    );
  });

  it("stop supprime l'intervalle proprement", () => {
    const mockStop = vi.fn();
    vi.spyOn(cron, "schedule").mockReturnValue({ stop: mockStop } as any);
    const spy = vi.spyOn(cron, "schedule");
    const ch = createMockTextChannel();
    const cl = createMockClient(ch);

    startTwitterMonitoring(cl);
    stopTwitterMonitoring();

    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("[TwitterCron] Arrêté"));
  });
});
