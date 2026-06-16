import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import cron from "node-cron";

const mockIsWithinTemporalBarrier = vi.hoisted(() => vi.fn().mockReturnValue(true));
const mockIsNewItem = vi.hoisted(() => vi.fn().mockResolvedValue(true));
const mockMarkAsProcessed = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockTranslateAutoToFrench = vi.hoisted(() => vi.fn().mockResolvedValue({
  translatedText: "Jeu gratuit traduit",
  detectedLanguage: "en",
}));
const mockRouteArticle = vi.hoisted(() => vi.fn().mockResolvedValue({
  routed: true,
  sentTo: ["channel-1"],
  errors: [],
}));

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
}));

vi.mock("discord.js", async () => {
  const a = await vi.importActual("discord.js");
  return { ...a, EmbedBuilder: vi.fn().mockImplementation(function(this:any) {
    this.setTitle=vi.fn().mockReturnThis(); this.setURL=vi.fn().mockReturnThis();
    this.setColor=vi.fn().mockReturnThis(); this.setAuthor=vi.fn().mockReturnThis();
    this.setDescription=vi.fn().mockReturnThis(); this.addFields=vi.fn().mockReturnThis();
    this.setFooter=vi.fn().mockReturnThis(); this.setTimestamp=vi.fn().mockReturnThis();
    return this;
  }) };
});

vi.mock("../utils/logger", () => ({ default: mockLogger }));
vi.mock("../config", () => ({ config: { freeGamesMention: null as string|null } }));
vi.mock("../managers/ScraperManager", () => ({
  ContentType: { FREE_GAME: "free_game" },
  isWithinTemporalBarrier: mockIsWithinTemporalBarrier,
  isNewItem: mockIsNewItem,
  markAsProcessed: mockMarkAsProcessed,
}));
vi.mock("../utils/translator", () => ({ translateAutoToFrench: mockTranslateAutoToFrench }));
vi.mock("../utils/deduplicationCache", () => ({
  dedupCache: {
    reloadFromDisk: vi.fn(),
    isAlreadyProcessed: vi.fn().mockReturnValue(false),
    markAsProcessed: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("../managers/ChannelRouter", () => ({ routeArticle: mockRouteArticle }));

const mockFetchGames = vi.hoisted(() => vi.fn());
vi.mock("../services/FreeGameFetcher", () => ({
  FreeGameFetcher: vi.fn().mockImplementation(function() { return { fetchGames: mockFetchGames }; }),
}));

import { checkFreeGames, startFreeGamesMonitoring, stopFreeGamesMonitoring } from "./freeGamesCron";

function createMockClient(): any {
  return { channels: { fetch: vi.fn().mockResolvedValue({ isTextBased: () => true, send: vi.fn().mockResolvedValue(undefined) }) } };
}
function makeItem(o: any = {}) {
  return { title: o.title ?? "Epic Game", link: o.link ?? "https://reddit.com/r/test/abc", pubDate: o.pubDate ?? new Date().toISOString(), content: "content", contentSnippet: "snippet", guid: o.guid ?? "g1", thumbnail: undefined };
}

beforeEach(() => { vi.clearAllMocks(); stopFreeGamesMonitoring(); mockIsWithinTemporalBarrier.mockReturnValue(true); mockIsNewItem.mockResolvedValue(true); mockFetchGames.mockResolvedValue([]); });

describe("checkFreeGames", () => {
  it("fetches and processes items", async () => {
    const client = createMockClient();
    mockFetchGames.mockResolvedValue([makeItem(), makeItem({ guid: "g2" })]);
    await checkFreeGames(client);
    expect(mockFetchGames).toHaveBeenCalledTimes(1);
  });

  it("warns when no items", async () => {
    mockFetchGames.mockResolvedValue([]);
    await checkFreeGames(createMockClient());
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining("Aucun jeu"));
  });

  it("handles fetcher error", async () => {
    mockFetchGames.mockRejectedValue(new Error("timeout"));
    await checkFreeGames(createMockClient());
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining("Erreur critique"));
  });

  it("respects temporal barrier (24h)", async () => {
    mockIsWithinTemporalBarrier.mockReturnValue(false);
    mockFetchGames.mockResolvedValue([makeItem()]);
    await checkFreeGames(createMockClient());
    expect(mockIsNewItem).not.toHaveBeenCalled();
    expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining("barriere 24h"));
  });

  it("deduplicates via isNewItem", async () => {
    mockIsNewItem.mockResolvedValue(false);
    mockFetchGames.mockResolvedValue([makeItem()]);
    await checkFreeGames(createMockClient());
    expect(mockTranslateAutoToFrench).not.toHaveBeenCalled();
  });

  it("translates and routes new games", async () => {
    mockFetchGames.mockResolvedValue([makeItem()]);
    await checkFreeGames(createMockClient());
    expect(mockTranslateAutoToFrench).toHaveBeenCalled();
    expect(mockRouteArticle).toHaveBeenCalled();
    expect(mockMarkAsProcessed).toHaveBeenCalled();
  });

  it("does not mark as processed if routing fails", async () => {
    mockRouteArticle.mockRejectedValue(new Error("no channel"));
    mockFetchGames.mockResolvedValue([makeItem()]);
    await checkFreeGames(createMockClient());
    expect(mockMarkAsProcessed).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining("Echec routage"), expect.any(Object));
  });

  it("limits to 10 items per cycle", async () => {
    const items = Array.from({length:20}, (_,i) => makeItem({guid:`p${i}`}));
    mockFetchGames.mockResolvedValue(items);
    await checkFreeGames(createMockClient());
    expect(mockIsWithinTemporalBarrier).toHaveBeenCalledTimes(10);
  });

  it("continues if individual item fails (allSettled)", async () => {
    mockIsNewItem.mockResolvedValueOnce(true).mockRejectedValueOnce(new Error("DB")).mockResolvedValueOnce(true);
    mockFetchGames.mockResolvedValue([makeItem({guid:"o1"}),makeItem({guid:"fail"}),makeItem({guid:"o2"})]);
    await checkFreeGames(createMockClient());
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining("Erreur traitement jeu"));
  });
});

describe("start/stop", () => {
  it("starts cron with 10min interval", () => {
    const spy = vi.spyOn(cron,"schedule").mockReturnValue({stop:vi.fn()}as any);
    startFreeGamesMonitoring(createMockClient());
    expect(spy).toHaveBeenCalledWith("*/10 * * * *", expect.any(Function));
  });

  it("does not start twice", () => {
    vi.spyOn(cron,"schedule").mockReturnValue({stop:vi.fn()}as any);
    startFreeGamesMonitoring(createMockClient());
    startFreeGamesMonitoring(createMockClient());
    expect(mockLogger.warn).toHaveBeenCalledWith("[FreeGamesCron] Deja actif — ignore");
  });

  it("stops cron", () => {
    const ms = vi.fn();
    vi.spyOn(cron,"schedule").mockReturnValue({stop:ms}as any);
    startFreeGamesMonitoring(createMockClient());
    stopFreeGamesMonitoring();
    expect(ms).toHaveBeenCalledTimes(1);
  });
});
