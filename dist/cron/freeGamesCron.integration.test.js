"use strict";
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
// ─── Toutes les variables mock dans vi.hoisted ────────────────────────────────
const { mockParseURL, mockFindUnique, mockCreate, mockLogger, mockSend, mockFetch, mockIsTextBased } = vitest_1.vi.hoisted(() => ({
    mockParseURL: vitest_1.vi.fn(),
    mockFindUnique: vitest_1.vi.fn(),
    mockCreate: vitest_1.vi.fn(),
    mockLogger: { info: vitest_1.vi.fn(), warn: vitest_1.vi.fn(), error: vitest_1.vi.fn() },
    mockSend: vitest_1.vi.fn().mockResolvedValue(undefined),
    mockFetch: vitest_1.vi.fn(),
    mockIsTextBased: vitest_1.vi.fn().mockReturnValue(true),
}));
// ─── rss-parser : préserve la vraie classe, surcharge uniquement parseURL ─────
vitest_1.vi.mock("rss-parser", async () => {
    const actual = await vitest_1.vi.importActual("rss-parser");
    const RealParser = actual.default;
    return {
        default: vitest_1.vi.fn().mockImplementation(function (opts) {
            const instance = new RealParser(opts);
            instance.parseURL = mockParseURL;
            return instance;
        }),
    };
});
// ─── Prisma ───────────────────────────────────────────────────────────────────
vitest_1.vi.mock("../prisma", () => ({
    default: {
        processedFreeGames: { findUnique: mockFindUnique, create: mockCreate },
    },
}));
// ─── Logger ───────────────────────────────────────────────────────────────────
vitest_1.vi.mock("../utils/logger", () => ({ default: mockLogger }));
// ─── Config : seul freeGamesMention est encore utilisé (le canal vient de FREE_GAMES_CHANNEL_ID) ───
vitest_1.vi.mock("../config", () => ({
    config: { freeGamesMention: null },
}));
// ─── RSS XML Fixtures (utilise le VRAI rss-parser) ───────────────────────────
const rss_parser_1 = __importDefault(require("rss-parser"));
;
const realParser = new rss_parser_1.default({
    customFields: { item: ["content", "contentSnippet"] },
});
function buildRssXml(items) {
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
function epicItem(opts) {
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
function nonEpicItem(guid, title) {
    return `<item>
      <title>${title}</title>
      <link>https://www.reddit.com/r/FreeGameFindings/comments/${guid}/</link>
      <pubDate>2026-06-12T10:00:00.000Z</pubDate>
      <guid isPermaLink="false">${guid}</guid>
      <content:encoded><![CDATA[<p>Free game on another platform</p>]]></content:encoded>
      <description>Free game on another platform</description>
    </item>`;
}
async function parseFixture(xml) {
    return realParser.parseString(xml);
}
// ─── Discord mocks ────────────────────────────────────────────────────────────
function createMockChannel() {
    return { send: mockSend, isTextBased: mockIsTextBased };
}
function createMockClient(ch) {
    return { channels: { fetch: mockFetch.mockResolvedValue(ch) } };
}
// ─── Import du module testé ───────────────────────────────────────────────────
const freeGamesCron_1 = require("./freeGamesCron");
// ─── Tests ────────────────────────────────────────────────────────────────────
vitest_1.describe.skip("freeGamesCron \u2014 Int\u00e9gration (seul parseURL est mock\u00e9)", () => {
    let channel;
    let client;
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        vitest_1.vi.stubEnv("FREE_GAMES_CHANNEL_ID", "123456789");
        channel = createMockChannel();
        client = createMockClient(channel);
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.unstubAllEnvs();
        vitest_1.vi.useRealTimers();
    });
    vitest_1.it.skip("flux RSS r\u00e9el pars\u00e9 \u2192 filtre [Epic Games] \u2192 post + persistence BDD", async () => {
        const xml = buildRssXml([
            epicItem({ guid: "p1", title: "[Epic Games] Celeste - Gratuit !" }),
            nonEpicItem("p2", "[Steam] Portal gratuit"),
            nonEpicItem("p3", "[GOG] Shadow of the Tomb Raider"),
        ]);
        mockParseURL.mockResolvedValueOnce(await parseFixture(xml));
        mockFindUnique.mockResolvedValue(null);
        mockCreate.mockResolvedValue({ id: 1 });
        vitest_1.vi.useFakeTimers();
        const promise = (0, freeGamesCron_1.checkFreeGames)(client);
        await vitest_1.vi.runAllTimersAsync();
        await promise;
        (0, vitest_1.expect)(mockSend).toHaveBeenCalledTimes(1);
        const call = mockSend.mock.calls[0][0];
        (0, vitest_1.expect)(call.embeds).toHaveLength(1);
        const embed = call.embeds[0];
        (0, vitest_1.expect)(embed.data.title).toContain("Celeste");
        (0, vitest_1.expect)(embed.data.color).toBe(0x2a9d8f); // Vert Epic (nouveau)
        (0, vitest_1.expect)(embed.data.author?.name).toBe("Epic Games Store");
        (0, vitest_1.expect)(mockCreate).toHaveBeenCalledWith({
            data: { redditPostId: "p1", title: "[Epic Games] Celeste - Gratuit !" },
        });
        (0, vitest_1.expect)(mockFindUnique).toHaveBeenCalledTimes(1);
    });
    vitest_1.it.skip("ignore un article d\u00e9j\u00e0 pr\u00e9sent dans ProcessedFreeGames", async () => {
        const xml = buildRssXml([epicItem({ guid: "old", title: "[Epic Games] D\u00e9j\u00e0 publi\u00e9" })]);
        mockParseURL.mockResolvedValueOnce(await parseFixture(xml));
        mockFindUnique.mockResolvedValue({ id: 99, redditPostId: "old" });
        vitest_1.vi.useFakeTimers();
        const promise = (0, freeGamesCron_1.checkFreeGames)(client);
        await vitest_1.vi.runAllTimersAsync();
        await promise;
        (0, vitest_1.expect)(mockSend).not.toHaveBeenCalled();
        (0, vitest_1.expect)(mockCreate).not.toHaveBeenCalled();
        (0, vitest_1.expect)(mockLogger.info).toHaveBeenCalledWith("[FreeGamesCron] Tous les articles Epic sont d\u00e9j\u00e0 connus");
    });
    vitest_1.it.skip("publie uniquement les nouveaux dans un flux mixte (2/3 Epic)", async () => {
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
        vitest_1.vi.useFakeTimers();
        const promise = (0, freeGamesCron_1.checkFreeGames)(client);
        await vitest_1.vi.runAllTimersAsync();
        await promise;
        (0, vitest_1.expect)(mockSend).toHaveBeenCalledTimes(2);
        (0, vitest_1.expect)(mockCreate).toHaveBeenCalledTimes(2);
        (0, vitest_1.expect)(mockFindUnique).toHaveBeenCalledTimes(3);
        const posted = mockSend.mock.calls.map((c) => c[0].embeds[0].data.title);
        (0, vitest_1.expect)(posted).toEqual([
            vitest_1.expect.stringContaining("Nouveau A"),
            vitest_1.expect.stringContaining("Nouveau B"),
        ]);
    });
    vitest_1.it.skip("ne fait rien quand aucun article ne matche Epic Games", async () => {
        const xml = buildRssXml([
            nonEpicItem("s1", "[Steam] Portal"),
            nonEpicItem("s2", "[Amazon] Fallout"),
            nonEpicItem("s3", "[GOG] Witcher"),
        ]);
        mockParseURL.mockResolvedValueOnce(await parseFixture(xml));
        vitest_1.vi.useFakeTimers();
        const promise = (0, freeGamesCron_1.checkFreeGames)(client);
        await vitest_1.vi.runAllTimersAsync();
        await promise;
        (0, vitest_1.expect)(mockSend).not.toHaveBeenCalled();
        (0, vitest_1.expect)(mockFindUnique).not.toHaveBeenCalled();
        (0, vitest_1.expect)(mockLogger.info).toHaveBeenCalledWith("[FreeGamesCron] Aucun article Epic Games trouv\u00e9 cette fois");
    });
    vitest_1.it.skip("log un warning sans crasher quand le flux RSS est down", async () => {
        mockParseURL.mockRejectedValueOnce(new Error("ECONNREFUSED"));
        vitest_1.vi.useFakeTimers();
        const promise = (0, freeGamesCron_1.checkFreeGames)(client);
        await vitest_1.vi.runAllTimersAsync();
        await promise;
        (0, vitest_1.expect)(mockLogger.warn).toHaveBeenCalledWith("[FreeGamesCron] Flux Reddit inaccessible:", "Error: ECONNREFUSED");
        (0, vitest_1.expect)(mockSend).not.toHaveBeenCalled();
    });
    vitest_1.it.skip("construit un embed complet (tous les champs v\u00e9rifi\u00e9s)", async () => {
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
        vitest_1.vi.useFakeTimers();
        const promise = (0, freeGamesCron_1.checkFreeGames)(client);
        await vitest_1.vi.runAllTimersAsync();
        await promise;
        const embed = mockSend.mock.calls[0][0].embeds[0];
        (0, vitest_1.expect)(embed.data.title).toContain("Hollow Knight");
        (0, vitest_1.expect)(embed.data.url).toBe("https://reddit.com/r/FreeGameFindings/comments/full-embed/");
        (0, vitest_1.expect)(embed.data.color).toBe(0x121212);
        (0, vitest_1.expect)(embed.data.author?.name).toBe("Epic Games Store");
        (0, vitest_1.expect)(embed.data.author?.icon_url).toBe("https://store.epicgames.com/favicon.ico");
        (0, vitest_1.expect)(embed.data.description).toBe("Hollow Knight est disponible gratuitement cette semaine.");
        (0, vitest_1.expect)(embed.data.fields).toHaveLength(2);
        (0, vitest_1.expect)(embed.data.fields[0].name).toBe("\u{1F4C5} Publi\u00e9 le");
        (0, vitest_1.expect)(embed.data.fields[1].name).toBe("\u{1F517} Lien");
        (0, vitest_1.expect)(embed.data.footer?.text).toBe("Free Games Tracker \u2022 Surveillance automatique");
        (0, vitest_1.expect)(embed.data.timestamp).toBeDefined();
    });
    vitest_1.it.each([
        ["[epic games] minuscules", "[epic games] free game this week"],
        ["epic games sans crochets", "epic games mega giveaway"],
        ["epic game singulier", "new epic game available now"],
        ["epic seul", "latest epic freebie"],
    ])("d\u00e9tecte : %s", async (_, title) => {
        const xml = buildRssXml([epicItem({ guid: "var", title })]);
        mockParseURL.mockResolvedValueOnce(await parseFixture(xml));
        mockFindUnique.mockResolvedValue(null);
        mockCreate.mockResolvedValue({ id: 1 });
        vitest_1.vi.useFakeTimers();
        const promise = (0, freeGamesCron_1.checkFreeGames)(client);
        await vitest_1.vi.runAllTimersAsync();
        await promise;
        (0, vitest_1.expect)(mockSend).toHaveBeenCalledTimes(1);
    });
    vitest_1.it.skip("s'arr\u00eate proprement quand FREE_GAMES_CHANNEL_ID est absent", async () => {
        const { config } = await Promise.resolve().then(() => __importStar(require("../config")));
        const prev = config.freeGamesChannel;
        try {
            config.freeGamesChannel = "";
            vitest_1.vi.useFakeTimers();
            const promise = (0, freeGamesCron_1.checkFreeGames)(client);
            await vitest_1.vi.runAllTimersAsync();
            await promise;
            (0, vitest_1.expect)(mockLogger.warn).toHaveBeenCalledWith("[FreeGamesCron] FREE_GAMES_CHANNEL_ID non configur\u00e9 \u2014 cron d\u00e9sactiv\u00e9");
            (0, vitest_1.expect)(mockParseURL).not.toHaveBeenCalled();
        }
        finally {
            config.freeGamesChannel = prev;
        }
    });
});
//# sourceMappingURL=freeGamesCron.integration.test.js.map