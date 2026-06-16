import os

BASE = "D:/les bot/bot/src"

def write_fgf():
    path = f"{BASE}/services/FreeGameFetcher.test.ts"
    with open(path, "w", encoding="utf-8") as f:
        f.write('''/**
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

const mockLogger = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("../utils/logger", () => ({ default: mockLogger }));

import { FreeGameFetcher, FreeGameItem, FetchStrategy, RedditScraperStrategy, Rss2JsonStrategy, DirectRssStrategy, EpicApiStrategy } from "./FreeGameFetcher";

function makeItem(o: Partial<FreeGameItem> = {}): FreeGameItem {
  return { title: "Test", link: "https://ex.com", pubDate: "2026-01-01", content: "desc", contentSnippet: "desc", author: "A", guid: "g1", thumbnail: "https://ex.com/t.jpg", ...o };
}

function makeStrat(n: string, items: FreeGameItem[] | null): FetchStrategy {
  return { name: n, fetch: vi.fn().mockResolvedValue(items) };
}

describe("FreeGameFetcher", () => {
  let f: FreeGameFetcher;
  beforeEach(() => vi.clearAllMocks());

  it("default strategies", () => {
    f = new FreeGameFetcher();
    expect(f.getStrategyNames()).toEqual(["RedditScraper", "Rss2Json", "DirectRss", "EpicApi"]);
  });

  it("custom strategies", () => {
    f = new FreeGameFetcher([makeStrat("C", [makeItem()])]);
    expect(f.getStrategyNames()).toEqual(["C"]);
  });

  it("first success returns", async () => {
    const items = [makeItem()];
    const s1 = makeStrat("S1", items), s2 = makeStrat("S2", null);
    f = new FreeGameFetcher([s1, s2]);
    expect(await f.fetchGames()).toEqual(items);
    expect(s1.fetch).toHaveBeenCalledOnce();
    expect(s2.fetch).not.toHaveBeenCalled();
  });

  it("fallback on null", async () => {
    const items = [makeItem()];
    const s1 = makeStrat("S1", null), s2 = makeStrat("S2", items);
    f = new FreeGameFetcher([s1, s2]);
    expect(await f.fetchGames()).toEqual(items);
    expect(s1.fetch).toHaveBeenCalledOnce();
    expect(s2.fetch).toHaveBeenCalledOnce();
  });

  it("fallback on empty", async () => {
    const items = [makeItem()];
    f = new FreeGameFetcher([makeStrat("S1", []), makeStrat("S2", items)]);
    expect(await f.fetchGames()).toEqual(items);
  });

  it("all fail returns empty", async () => {
    f = new FreeGameFetcher([makeStrat("S1", null), makeStrat("S2", [])]);
    expect(await f.fetchGames()).toEqual([]);
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining("All strategies failed"));
  });

  it("logs winning strategy", async () => {
    f = new FreeGameFetcher([makeStrat("Win", [makeItem()])]);
    await f.fetchGames();
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("Win"));
  });
});

describe("RedditScraperStrategy", () => {
  let s: RedditScraperStrategy;
  beforeEach(() => { vi.clearAllMocks(); s = new RedditScraperStrategy(); });

  it("returns items from XML", async () => {
    mockScrapeRssFeed.mockResolvedValue({ raw: "<rss/>" });
    mockParseRssXmlItems.mockReturnValue([{ title: "G1", link: "https://ex.com", pubDate: "2026-01-01", guid: "g1" }]);
    const r = await s.fetch();
    expect(r).toHaveLength(1);
    expect(r![0].title).toBe("G1");
  });

  it("returns null on error", async () => {
    mockScrapeRssFeed.mockRejectedValue(new Error("err"));
    expect(await s.fetch()).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining("RedditScraperStrategy failed"));
  });

  it("returns null when no data", async () => {
    mockScrapeRssFeed.mockResolvedValue({ raw: undefined, items: [] });
    expect(await s.fetch()).toBeNull();
  });

  it("falls back to scraped.items", async () => {
    mockScrapeRssFeed.mockResolvedValue({ raw: undefined, items: [{ title: "From Items", link: "https://ex.com", pubDate: "2026-01-01" }] });
    const r = await s.fetch();
    expect(r).toHaveLength(1);
    expect(r![0].title).toBe("From Items");
  });
});

describe("Rss2JsonStrategy", () => {
  let s: Rss2JsonStrategy;
  beforeEach(() => { vi.clearAllMocks(); s = new Rss2JsonStrategy(); });

  it("returns items", async () => {
    mockAxiosGet.mockResolvedValue({ data: { items: [makeItem({ title: "R2J" })] } });
    const r = await s.fetch();
    expect(r).toHaveLength(1);
    expect(r![0].title).toBe("R2J");
  });

  it("returns null if no items", async () => {
    mockAxiosGet.mockResolvedValue({ data: { items: [] } });
    expect(await s.fetch()).toBeNull();
  });

  it("returns null on error", async () => {
    mockAxiosGet.mockRejectedValue(new Error("err"));
    expect(await s.fetch()).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining("Rss2JsonStrategy failed"));
  });
});

describe("DirectRssStrategy", () => {
  let s: DirectRssStrategy;
  beforeEach(() => { vi.clearAllMocks(); s = new DirectRssStrategy(); });

  it("returns items", async () => {
    mockAxiosGet.mockResolvedValue({ data: "<rss/>" });
    mockParseRssXmlItems.mockReturnValue([{ title: "DG", link: "https://ex.com", pubDate: "2026-01-01", guid: "g1" }]);
    const r = await s.fetch();
    expect(r).toHaveLength(1);
    expect(r![0].title).toBe("DG");
  });

  it("returns null if no items", async () => {
    mockAxiosGet.mockResolvedValue({ data: "<rss/>" });
    mockParseRssXmlItems.mockReturnValue([]);
    expect(await s.fetch()).toBeNull();
  });

  it("returns null on error", async () => {
    mockAxiosGet.mockRejectedValue(new Error("err"));
    expect(await s.fetch()).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining("DirectRssStrategy failed"));
  });
});

describe("EpicApiStrategy", () => {
  let s: EpicApiStrategy;
  beforeEach(() => { vi.clearAllMocks(); s = new EpicApiStrategy(); });

  it("returns items from promos", async () => {
    mockAxiosGet.mockResolvedValue({ data: { data: { Catalog: { searchStore: { elements: [{ title: "Free Epic", description: "cool", productSlug: "free-game", id: "e1", keyImages: [{ url: "https://ex.com/i.jpg" }], promotions: { promotionalOffers: [{}] } }] } } } } });
    const r = await s.fetch();
    expect(r).toHaveLength(1);
    expect(r![0].title).toBe("Free Epic");
    expect(r![0].link).toContain("store.epicgames.com");
  });

  it("returns null if no promos", async () => {
    mockAxiosGet.mockResolvedValue({ data: { data: { Catalog: { searchStore: { elements: [{ title: "Paid", id: "p1", promotions: { promotionalOffers: [] } }] } } } } });
    expect(await s.fetch()).toBeNull();
  });

  it("returns null on invalid structure", async () => {
    mockAxiosGet.mockResolvedValue({ data: {} });
    expect(await s.fetch()).toBeNull();
  });

  it("returns null on error", async () => {
    mockAxiosGet.mockRejectedValue(new Error("err"));
    expect(await s.fetch()).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining("EpicApiStrategy failed"));
  });
});
''')
    print(f"Written {path}")

def write_cr():
    path = f"{BASE}/managers/ChannelRouter.test.ts"
    with open(path, "w", encoding="utf-8") as f:
        f.write('''/**
 * ChannelRouter.test.ts - Tests unitaires du routeur multi-plateforme
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockLogger = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("../utils/logger", () => ({ default: mockLogger }));

import { detectPlatforms, resolveChannelIds, buildPlatformEmbed, dispatchToChannels, routeArticle, PLATFORM_CONFIGS, RoutedArticle } from "./ChannelRouter";

describe("detectPlatforms", () => {
  it("detects Steam/PC", () => {
    const p = detectPlat
