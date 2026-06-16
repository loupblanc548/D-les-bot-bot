import os

# FreeGameFetcher.test.ts content
fgf = r'''/**
 * FreeGameFetcher.test.ts - Tests unitaires du Strategy Pattern
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAxiosGet = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { get: mockAxiosGet } }));

const mockScrapeRssFeed = vi.hoisted(() => vi.fn());
vi.mock("../managers/ScraperManager", () => ({ scrapeRssFeed: mockScrapeRssFeed }));

const mockParseRssXmlItems = vi.hoisted(() => vi.fn());
vi.mock("../utils/rss", () => ({ parseRssXmlItems: mockParseRssXmlItems }));

const mockLogger = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("../utils/logger", () => ({ default: mockLogger }));

import {
  FreeGameFetcher, FreeGameItem, FetchStrategy,
  RedditScraperStrategy, Rss2JsonStrategy,
  DirectRssStrategy, EpicApiStrategy,
} from "./FreeGameFetcher";

function createMockItem(overrides: Partial<FreeGameItem> = {}): FreeGameItem {
  return {
    title: "Test Free Game", link: "https://example.com/game",
    pubDate: "2026-06-15T12:00:00Z", content: "A great free game",
    contentSnippet: "A great free game", author: "TestAuthor",
    guid: "test-guid-123", thumbnail: "https://example.com/thumb.jpg",
    ...overrides,
  };
}

function createMockStrategy(name: string, items: FreeGameItem[] | null): FetchStrategy {
  return { name, fetch: vi.fn().mockResolvedValue(items) };
}
'''

# ChannelRouter.test.ts content
cr = r'''/**
 * ChannelRouter.test.ts - Tests unitaires du routeur multi-plateforme
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockLogger = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("../utils/logger", () => ({ default: mockLogger }));

import {
  detectPlatforms, resolveChannelIds, buildPlatformEmbed,
  dispatchToChannels, routeArticle, PLATFORM_CONFIGS, RoutedArticle,
} from "./ChannelRouter";
'''

base = "D:/les bot/bot/src"
os.makedirs(f"{base}/services", exist_ok=True)
os.makedirs(f"{base}/managers", exist_ok=True)

with open(f"{base}/services/FreeGameFetcher.test.ts", "w", encoding="utf-8") as f:
    f.write(fgf)

with open(f"{base}/managers/ChannelRouter.test.ts", "w", encoding="utf-8") as f:
    f.write(cr)

print("SCRIPTS_WRITTEN")
print(f"FGF: {len(fgf)} chars")
print(f"CR: {len(cr)} chars")
