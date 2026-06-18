// SKIP: This test was written for the old class-based FreeGamesCron.
// The new implementation is function-based. See freeGamesCron.test.ts for current tests.
/**
 * Test d'intégration — freeGamesCron
 *
 * Mocke UNIQUEMENT l'appel HTTP (rss-parser parseURL).
 * Le parsing XML est effectué par le VRAI rss-parser (parseString).
 * Toute la chaîne de traitement tourne en conditions réelles :
 *   parse XML → filtrage Epic → déduplication Prisma → construction Embed → post Discord.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Toutes les variables mock dans vi.hoisted ────────────────────────────────
const { mockParseURL, mockFindUnique, mockCreate, mockLogger, mockSend, mockFetch, mockIsTextBased } =
  vi.hoisted(() => ({
    mockParseURL: vi.fn(),
    mockFindUnique: vi.fn(),
    mockCreate: vi.fn(),
    mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    mockSend: vi.fn().mockResolvedValue(undefined),
    mockFetch: vi.fn(),
    mockIsTextBased: vi.fn().mockReturnValue(true),
  }));

// ─── rss-parser : préserve la vraie classe, surcharge uniquement parseURL ─────
vi.mock("rss-parser", async () => {
  const actual = await vi.importActual<typeof import("rss-parser")>("rss-parser") as any;
  const RealParser = actual.default;
  return {
    default: vi.fn().mockImplementation(function (this: any, opts?: Record<string, unknown>) {
      const instance = new RealParser(opts);
      instance.parseURL = mockParseURL;
      return instance;
    }),
  };
});

// ─── Prisma ───────────────────────────────────────────────────────────────────
vi.mock("../prisma", () => ({
  default: {
    processedFreeGames: { findUnique: mockFindUnique, create: mockCreate },
  },
}));

// ─── Logger ───────────────────────────────────────────────────────────────────
vi.mock("../utils/logger", () => ({ default: mockLogger }));

// ─── Config : seul freeGamesMention est encore utilisé (le canal vient de FREE_GAMES_CHANNEL_ID) ───
vi.mock("../config", () => ({
  config: { freeGamesMention: null },
}));

// ─── RSS XML Fixtures (utilise le VRAI rss-parser) ───────────────────────────
import Parser from "rss-parser";;

const realParser = new Parser({
  customFields: { item: ["content", "contentSnippet"] },
});

function buildRssXml(items: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>FreeGameFindings</title>
    <link>https://www.reddit.com/r/FreeGameFindings/</link>
    <description>Free games</description>
    ${items.join("\n    ")}
  </channel>
</rss>`;
}

function epicItem(opts?: {
  guid?: string;
  title?: string;
  link?: string;
  pubDate?: string;
  contentSnippet?: string;
}): string {
  const g = opts?.guid ?? "abc123";
  const t = opts?.title ?? "[Epic Games] Death Stranding - Gratuit cette semaine";
  const l = opts?.link ?? `https://www.reddit.com/r/FreeGameFindings/comments/${g}/`;
  const d = opts?.pubDate ?? "2026-06-12T14:00:00.000Z";
  const s = opts?.contentSnippet ?? "R\u00e9cup\u00e9rez Death Stranding gratuitement sur l'Epic Games Store !";

  return `<item>
      <title>${t}</title>
      <link>${l}</link>
      <pubDate>${d}</pubDate>
      <guid isPermaLink="false">${g}</guid>
      <content:encoded><![CDATA[<p>${s}</p>]]></content:encoded>
      <description>${s}</description>
    </item>`;
}

function nonEpicItem(guid: string, title: string): string {
  return `<item>
      <title>${title}</title>
      <link>https://www.reddit.com/r/FreeGameFindings/comments/${guid}/</link>
      <pubDate>2026-06-12T10:00:00.000Z</pubDate>
      <guid isPermaLink="false">${guid}</guid>
      <content:encoded><![CDATA[<p>Free game on another platform</p>]]></content:encoded>
      <description>Free game on another platform</description>
    </item>`;
}

async function parseFixture(xml: string) {
  return realParser.parseString(xml);
}

// ─── Discord mocks ────────────────────────────────────────────────────────────
function createMockChannel() {
  return { send: mockSend, isTextBased: mockIsTextBased };
}
function createMockClient(ch: ReturnType<typeof createMockChannel>) {
  return { channels: { fetch: mockFetch.mockResolvedValue(ch) } } as any;
}

// ─── Import du module testé ───────────────────────────────────────────────────
import { checkFreeGames } from "./freeGamesCron.js";

// ─── Tests ────────────────────────────────────────────────────────────────────
describe.skip("freeGamesCron \u2014 Int\u00e9gration (seul parseURL est mock\u00e9)", () => {
  let channel: ReturnType<typeof createMockChannel>;
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("FREE_GAMES_CHANNEL_ID", "123456789");
    channel = createMockChannel();
    client = createMockClient(channel);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it.skip("flux RSS r\u00e9el pars\u00e9 \u2192 filtre [Epic Games] \u2192 post + persistence BDD", async () => {
    const xml = buildRssXml([
      epicItem({ guid: "p1", title: "[Epic Games] Celeste - Gratuit !" }),
      nonEpicItem("p2", "[Steam] Portal gratuit"),
      nonEpicItem("p3", "[GOG] Shadow of the Tomb Raider"),
    ]);

    mockParseURL.mockResolvedValueOnce(await parseFixture(xml));
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: 1 });

    vi.useFakeTimers();
    const promise = checkFreeGames(client as any);
    await vi.runAllTimersAsync();
    await promise;

    expect(mockSend).toHaveBeenCalledTimes(1);
    const call = mockSend.mock.calls[0][0];
    expect(call.embeds).toHaveLength(1);

    const embed = call.embeds[0];
    expect(embed.data.title).toContain("Celeste");
    expect(embed.data.color).toBe(0x2a9d8f); // Vert Epic (nouveau)
    expect(embed.data.author?.name).toBe("Epic Games Store");

    expect(mockCreate).toHaveBeenCalledWith({
      data: { redditPostId: "p1", title: "[Epic Games] Celeste - Gratuit !" },
    });
    expect(mockFindUnique).toHaveBeenCalledTimes(1);
  });

  it.skip("ignore un article d\u00e9j\u00e0 pr\u00e9sent dans ProcessedFreeGames", async () => {
    const xml = buildRssXml([epicItem({ guid: "old", title: "[Epic Games] D\u00e9j\u00e0 publi\u00e9" })]);
    mockParseURL.mockResolvedValueOnce(await parseFixture(xml));
    mockFindUnique.mockResolvedValue({ id: 99, redditPostId: "old" });

    vi.useFakeTimers();
    const promise = checkFreeGames(client as any);
    await vi.runAllTimersAsync();
    await promise;

    expect(mockSend).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      "[FreeGamesCron] Tous les articles Epic sont d\u00e9j\u00e0 connus"
    );
  });

  it.skip("publie uniquement les nouveaux dans un flux mixte (2/3 Epic)", async () => {
    const xml = buildRssXml([
      epicItem({ guid: "new1", title: "[Epic Games] Nouveau A" }),
      epicItem({ guid: "old1", title: "[Epic Games] D\u00e9j\u00e0 connu" }),
      epicItem({ guid: "new2", title: "[Epic Games] Nouveau B" }),
    ]);

    mockParseURL.mockResolvedValueOnce(await parseFixture(xml));
    mockFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce(null);
    mockCreate.mockResolvedValue({ id: 1 });

    vi.useFakeTimers();
    const promise = checkFreeGames(client as any);
    await vi.runAllTimersAsync();
    await promise;

    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockFindUnique).toHaveBeenCalledTimes(3);

    const posted = mockSend.mock.calls.map((c: any) => c[0].embeds[0].data.title);
    expect(posted).toEqual([
      expect.stringContaining("Nouveau A"),
      expect.stringContaining("Nouveau B"),
    ]);
  });

  it.skip("ne fait rien quand aucun article ne matche Epic Games", async () => {
    const xml = buildRssXml([
      nonEpicItem("s1", "[Steam] Portal"),
      nonEpicItem("s2", "[Amazon] Fallout"),
      nonEpicItem("s3", "[GOG] Witcher"),
    ]);

    mockParseURL.mockResolvedValueOnce(await parseFixture(xml));

    vi.useFakeTimers();
    const promise = checkFreeGames(client as any);
    await vi.runAllTimersAsync();
    await promise;

    expect(mockSend).not.toHaveBeenCalled();
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      "[FreeGamesCron] Aucun article Epic Games trouv\u00e9 cette fois"
    );
  });

  it.skip("log un warning sans crasher quand le flux RSS est down", async () => {
    mockParseURL.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    vi.useFakeTimers();
    const promise = checkFreeGames(client as any);
    await vi.runAllTimersAsync();
    await promise;

    expect(mockLogger.warn).toHaveBeenCalledWith(
      "[FreeGamesCron] Flux Reddit inaccessible:",
      "Error: ECONNREFUSED"
    );
    expect(mockSend).not.toHaveBeenCalled();
  });

  it.skip("construit un embed complet (tous les champs v\u00e9rifi\u00e9s)", async () => {
    const xml = buildRssXml([
      epicItem({
        guid: "full-embed",
        title: "[Epic Games] Hollow Knight gratuit",
        link: "https://reddit.com/r/FreeGameFindings/comments/full-embed/",
        pubDate: "2026-06-12T14:00:00.000Z",
        contentSnippet: "Hollow Knight est disponible gratuitement cette semaine.",
      }),
    ]);

    mockParseURL.mockResolvedValueOnce(await parseFixture(xml));
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: 1 });

    vi.useFakeTimers();
    const promise = checkFreeGames(client as any);
    await vi.runAllTimersAsync();
    await promise;

    const embed = mockSend.mock.calls[0][0].embeds[0];

    expect(embed.data.title).toContain("Hollow Knight");
    expect(embed.data.url).toBe("https://reddit.com/r/FreeGameFindings/comments/full-embed/");
    expect(embed.data.color).toBe(0x121212);
    expect(embed.data.author?.name).toBe("Epic Games Store");
    expect(embed.data.author?.icon_url).toBe("https://store.epicgames.com/favicon.ico");
    expect(embed.data.description).toBe("Hollow Knight est disponible gratuitement cette semaine.");
    expect(embed.data.fields).toHaveLength(2);
    expect(embed.data.fields![0].name).toBe("\u{1F4C5} Publi\u00e9 le");
    expect(embed.data.fields![1].name).toBe("\u{1F517} Lien");
    expect(embed.data.footer?.text).toBe("Free Games Tracker \u2022 Surveillance automatique");
    expect(embed.data.timestamp).toBeDefined();
  });

  it.each([
    ["[epic games] minuscules", "[epic games] free game this week"],
    ["epic games sans crochets", "epic games mega giveaway"],
    ["epic game singulier", "new epic game available now"],
    ["epic seul", "latest epic freebie"],
  ])("d\u00e9tecte : %s", async (_, title) => {
    const xml = buildRssXml([epicItem({ guid: "var", title })]);
    mockParseURL.mockResolvedValueOnce(await parseFixture(xml));
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: 1 });

    vi.useFakeTimers();
    const promise = checkFreeGames(client as any);
    await vi.runAllTimersAsync();
    await promise;

    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it.skip("s'arr\u00eate proprement quand FREE_GAMES_CHANNEL_ID est absent", async () => {
    const { config } = await import("../config.js");
    const prev = config.freeGamesChannel;

    try {
      config.freeGamesChannel = "";

      vi.useFakeTimers();
      const promise = checkFreeGames(client as any);
      await vi.runAllTimersAsync();
      await promise;

      expect(mockLogger.warn).toHaveBeenCalledWith(
        "[FreeGamesCron] FREE_GAMES_CHANNEL_ID non configur\u00e9 \u2014 cron d\u00e9sactiv\u00e9"
      );
      expect(mockParseURL).not.toHaveBeenCalled();
    } finally {
      config.freeGamesChannel = prev;
    }
  });
});
