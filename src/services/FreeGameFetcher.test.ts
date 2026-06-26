/**
 * FreeGameFetcher.test.ts - Tests unitaires du Strategy Pattern
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---
const mockAxiosGet = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { get: mockAxiosGet } }));

const mockScrapeRssFeed = vi.hoisted(() => vi.fn());
vi.mock("../managers/ScraperManager", () => ({ scrapeRssFeed: mockScrapeRssFeed }));

const mockParseRssXmlItems = vi.hoisted(() => vi.fn());
vi.mock("../utils/rss", () => ({ parseRssXmlItems: mockParseRssXmlItems }));

const mockLogger = vi.hoisted(() => globalThis.__createMockLogger());
vi.mock("../utils/logger", () => ({ default: mockLogger }));

import {
  FreeGameFetcher,
  FreeGameItem,
  FetchStrategy,
  RedditScraperStrategy,
  Rss2JsonStrategy,
  DirectRssStrategy,
  EpicApiStrategy,
} from "./FreeGameFetcher.js";

// --- Helpers ---

function createMockItem(overrides: Partial<FreeGameItem> = {}): FreeGameItem {
  return {
    title: "Test Free Game",
    link: "https://example.com/game",
    pubDate: "2026-06-15T12:00:00Z",
    content: "A great free game",
    contentSnippet: "A great free game",
    author: "TestAuthor",
    guid: "test-guid-123",
    thumbnail: "https://example.com/thumb.jpg",
    ...overrides,
  };
}

function createMockStrategy(name: string, items: FreeGameItem[] | null): FetchStrategy {
  return { name, fetch: vi.fn().mockResolvedValue(items) };
}

describe("FreeGameFetcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("uses default strategies when none provided", () => {
      const fetcher = new FreeGameFetcher();
      expect(fetcher.getStrategyNames()).toEqual([
        "RedditScraper",
        "Rss2Json",
        "DirectRss",
        "EpicApi",
      ]);
    });

    it("accepts custom strategies", () => {
      const mock = createMockStrategy("Mock", [createMockItem()]);
      const fetcher = new FreeGameFetcher([mock]);
      expect(fetcher.getStrategyNames()).toEqual(["Mock"]);
    });
  });

  describe("fetchGames", () => {
    it("returns items from the first successful strategy", async () => {
      const item = createMockItem({ title: "Free Game A" });
      const strategy = createMockStrategy("Mock", [item]);
      const fetcher = new FreeGameFetcher([strategy]);

      const result = await fetcher.fetchGames();

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Free Game A");
      expect(strategy.fetch).toHaveBeenCalledTimes(1);
    });

    it("falls back to next strategy when first returns null", async () => {
      const s1 = createMockStrategy("First", null);
      const s2 = createMockStrategy("Second", [createMockItem({ title: "Fallback" })]);
      const fetcher = new FreeGameFetcher([s1, s2]);

      const result = await fetcher.fetchGames();

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Fallback");
      expect(s1.fetch).toHaveBeenCalled();
      expect(s2.fetch).toHaveBeenCalled();
    });

    it("falls back when first strategy returns empty array", async () => {
      const s1 = createMockStrategy("Empty", []);
      const s2 = createMockStrategy("Full", [createMockItem()]);
      const fetcher = new FreeGameFetcher([s1, s2]);

      const result = await fetcher.fetchGames();

      expect(result).toHaveLength(1);
    });

    it("returns empty array when all strategies fail", async () => {
      const s1 = createMockStrategy("Fail1", null);
      const s2 = createMockStrategy("Fail2", null);
      const fetcher = new FreeGameFetcher([s1, s2]);

      const result = await fetcher.fetchGames();

      expect(result).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("All strategies failed"),
      );
    });

    it("logs which strategy succeeded", async () => {
      const strategy = createMockStrategy("Success", [createMockItem()]);
      const fetcher = new FreeGameFetcher([strategy]);

      await fetcher.fetchGames();

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("Success"));
    });
  });

  describe("getStrategyNames", () => {
    it("returns strategy names in order", () => {
      const s1 = createMockStrategy("Alpha", null);
      const s2 = createMockStrategy("Beta", null);
      const fetcher = new FreeGameFetcher([s1, s2]);

      expect(fetcher.getStrategyNames()).toEqual(["Alpha", "Beta"]);
    });
  });
});

describe("RedditScraperStrategy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns items when parseRssXmlItems succeeds", async () => {
    mockScrapeRssFeed.mockResolvedValue({
      raw: "<rss><channel><item><title>Game</title></item></channel></rss>",
    });
    mockParseRssXmlItems.mockReturnValue([
      { title: "Game", link: "https://reddit.com/r/test/1", pubDate: "2026-01-01" },
    ]);

    const strategy = new RedditScraperStrategy();
    const result = await strategy.fetch();

    expect(result).toHaveLength(1);
    expect(result![0].title).toBe("Game");
  });

  it("returns null on scrape failure", async () => {
    mockScrapeRssFeed.mockRejectedValue(new Error("Network error"));

    const strategy = new RedditScraperStrategy();
    const result = await strategy.fetch();

    expect(result).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("RedditScraperStrategy failed"),
    );
  });

  it("tries JSON fallback when XML parsing returns empty", async () => {
    mockScrapeRssFeed.mockResolvedValue({ raw: '{"items":[{"title":"JSON Game"}]}' });
    mockParseRssXmlItems.mockReturnValue([]);

    const strategy = new RedditScraperStrategy();
    const result = await strategy.fetch();

    expect(result).toHaveLength(1);
    expect(result![0].title).toBe("JSON Game");
  });

  it("returns scraped items directly when available", async () => {
    mockScrapeRssFeed.mockResolvedValue({
      raw: "",
      items: [{ title: "Direct Item", link: "https://example.com", pubDate: "2026-01-01" }],
    });

    const strategy = new RedditScraperStrategy();
    const result = await strategy.fetch();

    expect(result).toHaveLength(1);
    expect(result![0].title).toBe("Direct Item");
  });
});

describe("Rss2JsonStrategy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns items from RSS2JSON API", async () => {
    mockAxiosGet.mockResolvedValue({
      data: {
        items: [{ title: "RSS2JSON Game", link: "https://example.com", pubDate: "2026-01-01" }],
      },
    });

    const strategy = new Rss2JsonStrategy();
    const result = await strategy.fetch();

    expect(result).toHaveLength(1);
    expect(result![0].title).toBe("RSS2JSON Game");
    expect(mockAxiosGet).toHaveBeenCalledWith(
      expect.stringContaining("rss2json.com"),
      expect.objectContaining({ timeout: 10000 }),
    );
  });

  it("returns null when API returns empty items", async () => {
    mockAxiosGet.mockResolvedValue({ data: { items: [] } });

    const strategy = new Rss2JsonStrategy();
    const result = await strategy.fetch();

    expect(result).toBeNull();
  });

  it("returns null on network error", async () => {
    mockAxiosGet.mockRejectedValue(new Error("API timeout"));

    const strategy = new Rss2JsonStrategy();
    const result = await strategy.fetch();

    expect(result).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Rss2JsonStrategy failed"),
    );
  });
});

describe("DirectRssStrategy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns parsed RSS items", async () => {
    mockAxiosGet.mockResolvedValue({
      data: "<rss><channel><item><title>Direct RSS</title></item></channel></rss>",
    });
    mockParseRssXmlItems.mockReturnValue([
      { title: "Direct RSS", link: "https://example.com", pubDate: "2026-01-01" },
    ]);

    const strategy = new DirectRssStrategy();
    const result = await strategy.fetch();

    expect(result).toHaveLength(1);
    expect(result![0].title).toBe("Direct RSS");
  });

  it("returns null on HTTP error", async () => {
    mockAxiosGet.mockRejectedValue(new Error("HTTP 403"));

    const strategy = new DirectRssStrategy();
    const result = await strategy.fetch();

    expect(result).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("DirectRssStrategy failed"),
    );
  });

  it("returns null when XML parsing returns empty", async () => {
    mockAxiosGet.mockResolvedValue({ data: "<rss><channel><item></item></channel></rss>" });
    mockParseRssXmlItems.mockReturnValue([]);

    const strategy = new DirectRssStrategy();
    const result = await strategy.fetch();

    expect(result).toBeNull();
  });
});

describe("EpicApiStrategy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns filtered free game promotions", async () => {
    mockAxiosGet.mockResolvedValue({
      data: {
        data: {
          Catalog: {
            searchStore: {
              elements: [
                {
                  title: "Game A",
                  id: "game-a",
                  productSlug: "game-a",
                  description: "Free game this week",
                  keyImages: [{ url: "https://example.com/thumb.jpg" }],
                  promotions: {
                    promotionalOffers: [{ promotionalOffers: [{ startDate: "2026-01-01" }] }],
                  },
                },
                {
                  title: "Game B (no promo)",
                  id: "game-b",
                  productSlug: "game-b",
                  promotions: null,
                },
              ],
            },
          },
        },
      },
    });

    const strategy = new EpicApiStrategy();
    const result = await strategy.fetch();

    expect(result).toHaveLength(1);
    expect(result![0].title).toBe("Game A");
    expect(result![0].link).toContain("store.epicgames.com");
  });

  it("returns null when API has no elements", async () => {
    mockAxiosGet.mockResolvedValue({
      data: { data: { Catalog: { searchStore: { elements: [] } } } },
    });

    const strategy = new EpicApiStrategy();
    const result = await strategy.fetch();

    expect(result).toBeNull();
  });

  it("returns null when API response is malformed", async () => {
    mockAxiosGet.mockRejectedValue(new Error("Invalid JSON"));

    const strategy = new EpicApiStrategy();
    const result = await strategy.fetch();

    expect(result).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining("EpicApiStrategy failed"));
  });

  it("falls back to catalogNs mappings when productSlug is missing", async () => {
    mockAxiosGet.mockResolvedValue({
      data: {
        data: {
          Catalog: {
            searchStore: {
              elements: [
                {
                  title: "Game C",
                  id: "game-c",
                  catalogNs: { mappings: [{ pageSlug: "game-c-page" }] },
                  description: "Another free game",
                  keyImages: [{ url: "https://example.com/thumb.jpg" }],
                  promotions: {
                    promotionalOffers: [{ promotionalOffers: [{ startDate: "2026-01-01" }] }],
                  },
                },
              ],
            },
          },
        },
      },
    });

    const strategy = new EpicApiStrategy();
    const result = await strategy.fetch();

    expect(result).toHaveLength(1);
    expect(result![0].link).toContain("game-c-page");
  });
});
