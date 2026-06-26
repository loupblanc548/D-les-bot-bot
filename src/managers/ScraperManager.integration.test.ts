import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock Playwright ──────────────────────────────────────────────────────

const { mockPage, mockBrowser, mockChromiumLaunch } = vi.hoisted(() => {
  const p = {
    goto: vi.fn(),
    $: vi.fn(),
    $$eval: vi.fn(),
    $eval: vi.fn(),
    close: vi.fn(),
  };
  const b = {
    isConnected: vi.fn(),
    newPage: vi.fn(),
  };
  return { mockPage: p, mockBrowser: b, mockChromiumLaunch: vi.fn() };
});

vi.mock("playwright", () => ({
  chromium: { launch: mockChromiumLaunch },
}));

vi.mock("../utils/scraper", () => ({
  closeBrowser: vi.fn(),
}));

// ─── Mock Prisma — 7 tables ────────────────────────────────────────────────

const mockProcessedTweets = vi.hoisted(() => ({ findUnique: vi.fn(), create: vi.fn() }));
const mockProcessedFreeGames = vi.hoisted(() => ({ findUnique: vi.fn(), create: vi.fn() }));
const mockProcessedPatchNotes = vi.hoisted(() => ({ findUnique: vi.fn(), create: vi.fn() }));
const mockProcessedDeal = vi.hoisted(() => ({ findUnique: vi.fn(), create: vi.fn() }));
const mockProcessedVideos = vi.hoisted(() => ({ findUnique: vi.fn(), create: vi.fn() }));
const mockProcessedGameUpdate = vi.hoisted(() => ({ findUnique: vi.fn(), create: vi.fn() }));
const mockProcessedPriceAlert = vi.hoisted(() => ({ findUnique: vi.fn(), create: vi.fn() }));

vi.mock("../prisma", () => ({
  default: {
    processedTweets: mockProcessedTweets,
    processedFreeGames: mockProcessedFreeGames,
    processedPatchNotes: mockProcessedPatchNotes,
    processedDeal: mockProcessedDeal,
    processedVideos: mockProcessedVideos,
    processedGameUpdate: mockProcessedGameUpdate,
    processedPriceAlert: mockProcessedPriceAlert,
  },
}));

// ─── Mock logger ───────────────────────────────────────────────────────────

vi.mock("../utils/logger", () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// ─── Imports ───────────────────────────────────────────────────────────────

import { runScrapingPipeline, ContentType } from "../managers/ScraperManager.js";

// ─── Playwright Helpers ────────────────────────────────────────────────────

function setupSuccessfulScrape(overrides: Record<string, string> = {}): void {
  const t = overrides.title ?? "Test Title";
  const c = overrides.content ?? "Test content here";
  const d = overrides.pubDate ?? new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
  const img = overrides.image ?? "https://example.com/img.jpg";
  const og = overrides.ogTitle ?? "";

  mockPage.goto.mockResolvedValue(undefined);
  mockPage.$.mockImplementation(async (selector: string) => {
    if (selector === "h1") return { textContent: async () => t };
    return null;
  });
  mockPage.$$eval.mockResolvedValue(c);
  mockPage.$eval.mockImplementation(async (selector: string) => {
    if (selector.includes("og:title")) return og || "OG Fallback";
    if (selector.includes("time") || selector.includes("datetime") || selector.includes("date"))
      return d;
    if (selector.includes("img") || selector.includes("og:image")) return img;
    return "";
  });
  mockPage.close.mockResolvedValue(undefined);
  mockBrowser.isConnected.mockReturnValue(false);
  mockBrowser.newPage.mockResolvedValue(mockPage);
  mockChromiumLaunch.mockResolvedValue(mockBrowser);
}

function setupFailedScrape(errorMessage: string): void {
  mockBrowser.isConnected.mockReturnValue(false);
  mockBrowser.newPage.mockResolvedValue(mockPage);
  mockChromiumLaunch.mockResolvedValue(mockBrowser);
  mockPage.goto.mockRejectedValue(new Error(errorMessage));
  mockPage.close.mockResolvedValue(undefined);
}

function setupTimeoutScrape(): void {
  mockBrowser.isConnected.mockReturnValue(false);
  mockBrowser.newPage.mockResolvedValue(mockPage);
  mockChromiumLaunch.mockResolvedValue(mockBrowser);
  mockPage.goto.mockRejectedValue(new Error("page.goto: Timeout 30000ms exceeded."));
  mockPage.close.mockResolvedValue(undefined);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 1: Pipeline complet — Succès
// ═══════════════════════════════════════════════════════════════════════════════

describe("runScrapingPipeline — Succès complet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProcessedPatchNotes.findUnique.mockReset();
    mockProcessedPatchNotes.create.mockReset();
  });

  it("retourne { valid: true, item } quand toutes les étapes passent", async () => {
    setupSuccessfulScrape();
    mockProcessedPatchNotes.findUnique.mockResolvedValue(null);

    const result = await runScrapingPipeline("https://example.com/article", "guid-abc-123");

    expect(result.valid).toBe(true);
    expect(result.item).toBeDefined();
    expect(result.item!.guid).toBe("guid-abc-123");
    expect(result.item!.title).toBe("Test Title");
    expect(result.item!.content).toBe("Test content here");
    expect(result.item!.link).toBe("https://example.com/article");
    expect(result.skippedReason).toBeUndefined();
    expect(result.error).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 2: Pipeline — Échec scraping
// ═══════════════════════════════════════════════════════════════════════════════

describe("runScrapingPipeline — Échec scraping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProcessedPatchNotes.findUnique.mockReset();
  });

  it("retourne skippedReason='scraping_failed' si page.goto échoue", async () => {
    setupFailedScrape("net::ERR_CONNECTION_REFUSED");

    const result = await runScrapingPipeline("https://example.com", "guid-1");

    expect(result.valid).toBe(false);
    expect(result.skippedReason).toBe("scraping_unsuccessful");
    expect(result.error).toContain("ERR_CONNECTION_REFUSED");
  });

  it("retourne skippedReason='scraping_unsuccessful' si timeout page.goto", async () => {
    setupTimeoutScrape();

    const result = await runScrapingPipeline("https://example.com", "guid-2");

    expect(result.valid).toBe(false);
    expect(result.skippedReason).toBe("scraping_unsuccessful");
    expect(result.error).toContain("timeout");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 3: Pipeline — Barrière temporelle 48h
// ═══════════════════════════════════════════════════════════════════════════════

describe("runScrapingPipeline — Barrière temporelle 48h", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProcessedPatchNotes.findUnique.mockReset();
  });

  it("retourne skippedReason='temporal_barrier' si pubDate > 48h", async () => {
    setupSuccessfulScrape({
      pubDate: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
    });

    const result = await runScrapingPipeline("https://example.com", "guid-old");

    expect(result.valid).toBe(false);
    expect(result.skippedReason).toBe("temporal_barrier");
  });

  it("retourne skippedReason='temporal_barrier' si pubDate est invalide", async () => {
    setupSuccessfulScrape({ pubDate: "not-a-valid-date" });

    const result = await runScrapingPipeline("https://example.com", "guid-bad-date");

    expect(result.valid).toBe(false);
    expect(result.skippedReason).toBe("temporal_barrier");
  });

  it("accepte un item avec pubDate vide (pessimiste)", async () => {
    setupSuccessfulScrape({ pubDate: "" });
    mockProcessedPatchNotes.findUnique.mockResolvedValue(null);

    const result = await runScrapingPipeline("https://example.com", "guid-no-date");

    expect(result.valid).toBe(true);
    expect(result.skippedReason).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 4: Pipeline — Déduplication Prisma
// ═══════════════════════════════════════════════════════════════════════════════

describe("runScrapingPipeline — Déduplication Prisma", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProcessedPatchNotes.findUnique.mockReset();
    mockProcessedPatchNotes.create.mockReset();
  });

  it("retourne skippedReason='duplicate' si l'item existe déjà", async () => {
    setupSuccessfulScrape();
    mockProcessedPatchNotes.findUnique.mockResolvedValue({
      guid: "guid-dup",
      title: "Already there",
    });

    const result = await runScrapingPipeline("https://example.com", "guid-dup");

    expect(result.valid).toBe(false);
    expect(result.skippedReason).toBe("duplicate");
  });

  it("n'appelle PAS findUnique si le scraping échoue (short-circuit)", async () => {
    setupFailedScrape("Connection refused");

    await runScrapingPipeline("https://example.com", "guid-short");

    expect(mockProcessedPatchNotes.findUnique).not.toHaveBeenCalled();
  });

  it("n'appelle PAS findUnique si la barrière temporelle échoue (short-circuit)", async () => {
    setupSuccessfulScrape({
      pubDate: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
    });

    await runScrapingPipeline("https://example.com", "guid-old-short");

    expect(mockProcessedPatchNotes.findUnique).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 5: Pipeline — ContentType paramétrique
// ═══════════════════════════════════════════════════════════════════════════════

describe("runScrapingPipeline — ContentType paramétrique", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const mock of [
      mockProcessedTweets,
      mockProcessedFreeGames,
      mockProcessedPatchNotes,
      mockProcessedDeal,
      mockProcessedVideos,
      mockProcessedGameUpdate,
      mockProcessedPriceAlert,
    ]) {
      mock.findUnique.mockReset();
      mock.create.mockReset();
    }
  });

  it("utilise PATCH_NOTE par défaut (backward compatible)", async () => {
    setupSuccessfulScrape();
    mockProcessedPatchNotes.findUnique.mockResolvedValue(null);

    const result = await runScrapingPipeline("https://example.com", "guid-default");

    expect(result.valid).toBe(true);
    expect(mockProcessedPatchNotes.findUnique).toHaveBeenCalledWith({
      where: { guid: "guid-default" },
    });
  });

  it("utilise FREE_GAME quand le type est spécifié", async () => {
    setupSuccessfulScrape();
    mockProcessedFreeGames.findUnique.mockResolvedValue(null);

    const result = await runScrapingPipeline(
      "https://example.com/free-game",
      "reddit-post-42",
      undefined,
      ContentType.FREE_GAME,
    );

    expect(result.valid).toBe(true);
    expect(mockProcessedFreeGames.findUnique).toHaveBeenCalledWith({
      where: { redditPostId: "reddit-post-42" },
    });
  });

  it("utilise TWEET pour le ContentType correspondant", async () => {
    setupSuccessfulScrape();
    mockProcessedTweets.findUnique.mockResolvedValue(null);

    const result = await runScrapingPipeline(
      "https://twitter.com/user/status/123",
      "tweet-123",
      { mode: "html", timeout: 15000 },
      ContentType.TWEET,
    );

    expect(result.valid).toBe(true);
    expect(result.item!.guid).toBe("tweet-123");
    expect(mockProcessedTweets.findUnique).toHaveBeenCalledWith({
      where: { tweetId: "tweet-123" },
    });
  });

  it("passe les options de scraping à page.goto", async () => {
    setupSuccessfulScrape();
    mockProcessedDeal.findUnique.mockResolvedValue(null);

    const result = await runScrapingPipeline(
      "https://deals.example.com",
      "deal-xyz",
      { mode: "html", timeout: 20000 },
      ContentType.DEAL,
    );

    expect(result.valid).toBe(true);
    expect(mockPage.goto).toHaveBeenCalledWith("https://deals.example.com", {
      waitUntil: "networkidle",
      timeout: 20000,
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 6: Pipeline — Timeout scraping
// ═══════════════════════════════════════════════════════════════════════════════

describe("runScrapingPipeline — Timeout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retourne skippedReason='scraping_failed' après timeout", async () => {
    setupTimeoutScrape();

    const result = await runScrapingPipeline("https://slow-server.com", "guid-timeout", {
      timeout: 5000,
    });

    expect(result.valid).toBe(false);
    expect(result.skippedReason).toBe("scraping_unsuccessful");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 7: Pipeline — Erreur spawn (navigateur introuvable)
// ═══════════════════════════════════════════════════════════════════════════════

describe("runScrapingPipeline — Erreur navigateur", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retourne skippedReason='scraping_failed' si chromium.launch échoue", async () => {
    mockBrowser.isConnected.mockReturnValue(false);
    mockChromiumLaunch.mockRejectedValue(new Error("Browser not found"));

    const result = await runScrapingPipeline("https://example.com", "guid-spawn-err");

    expect(result.valid).toBe(false);
    expect(result.skippedReason).toBe("scraping_unsuccessful");
    expect(result.error).toContain("Browser not found");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 8: Pipeline — Flux complet 3 étapes (intégration vraie)
// ═══════════════════════════════════════════════════════════════════════════════

describe("runScrapingPipeline — Flux complet 3 étapes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProcessedPatchNotes.findUnique.mockReset();
    mockProcessedPatchNotes.create.mockReset();
  });

  it("chaîne: scraping OK → Zod OK → 48h OK → dédup OK → valid:true", async () => {
    setupSuccessfulScrape();
    mockProcessedPatchNotes.findUnique.mockResolvedValue(null);

    const result = await runScrapingPipeline("https://example.com", "chain-ok");

    expect(result.valid).toBe(true);
    expect(result.item).toBeDefined();
    expect(result.item!.guid).toBe("chain-ok");
  });

  it("chaîne: scraping OK → Zod OK → 48h FAIL → valid:false (temporal_barrier)", async () => {
    setupSuccessfulScrape({
      pubDate: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const result = await runScrapingPipeline("https://example.com", "chain-old");

    expect(result.valid).toBe(false);
    expect(result.skippedReason).toBe("temporal_barrier");
    expect(mockProcessedPatchNotes.findUnique).not.toHaveBeenCalled();
  });

  it("chaîne: scraping OK → Zod OK → 48h OK → dédup FAIL → valid:false (duplicate)", async () => {
    setupSuccessfulScrape();
    mockProcessedPatchNotes.findUnique.mockResolvedValue({ guid: "chain-dup" });

    const result = await runScrapingPipeline("https://example.com", "chain-dup");

    expect(result.valid).toBe(false);
    expect(result.skippedReason).toBe("duplicate");
  });

  it("chaîne: scraping FAIL → les étapes Zod/48h/dédup sont court-circuitées", async () => {
    setupFailedScrape("Connection refused");

    const result = await runScrapingPipeline("https://example.com", "chain-fail");

    expect(result.valid).toBe(false);
    expect(result.skippedReason).toBe("scraping_unsuccessful");
    expect(mockProcessedPatchNotes.findUnique).not.toHaveBeenCalled();
  });
});
