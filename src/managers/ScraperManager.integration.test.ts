import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";

// ─── Mock child_process.spawn ──────────────────────────────────────────────

const mockSpawn = vi.hoisted(() => vi.fn());
vi.mock("child_process", () => ({
  spawn: mockSpawn,
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
// ─── Spawn Helpers ─────────────────────────────────────────────────────────

function createMockProc(): EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
} {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = vi.fn();
  return proc;
}

/** Émet un JSON Python valide sur stdout puis close(0) */
function emitPythonJson(
  proc: ReturnType<typeof createMockProc>,
  data: Record<string, unknown>,
): void {
  proc.stdout.emit("data", Buffer.from(JSON.stringify(data), "utf-8"));
  proc.emit("close", 0);
}

/** Émet un JSON Python avec success=true, date récente, titre+contenu */
function emitSuccessJson(
  proc: ReturnType<typeof createMockProc>,
  overrides: Record<string, unknown> = {},
): void {
  emitPythonJson(proc, {
    success: true,
    title: "Test Title",
    content: "Test content here",
    pubDate: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // -1h
    link: "https://example.com/article",
    image: "https://example.com/img.jpg",
    ...overrides,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 1: Pipeline complet — Succès
// ═══════════════════════════════════════════════════════════════════════════════

describe("runScrapingPipeline — Succès complet", () => {
  beforeEach(() => {
    mockSpawn.mockClear();
    mockProcessedPatchNotes.findUnique.mockReset();
    mockProcessedPatchNotes.create.mockReset();
  });

  it("retourne { valid: true, item } quand toutes les étapes passent", async () => {
    const proc = createMockProc();
    mockSpawn.mockReturnValue(proc);
    mockProcessedPatchNotes.findUnique.mockResolvedValue(null); // pas encore traité

    const promise = runScrapingPipeline("https://example.com/article", "guid-abc-123");
    emitSuccessJson(proc);

    const result = await promise;

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
// Suite 2: Pipeline — Échec scraping (Python error)
// ═══════════════════════════════════════════════════════════════════════════════

describe("runScrapingPipeline — Échec scraping", () => {
  beforeEach(() => {
    mockSpawn.mockClear();
    mockProcessedPatchNotes.findUnique.mockReset();
  });

  it("retourne skippedReason='scraping_failed' si Python exit != 0", async () => {
    const proc = createMockProc();
    mockSpawn.mockReturnValue(proc);

    const promise = runScrapingPipeline("https://example.com", "guid-1");
    proc.stderr.emit("data", Buffer.from("Python error traceback", "utf-8"));
    proc.emit("close", 1);

    const result = await promise;

    expect(result.valid).toBe(false);
    expect(result.skippedReason).toBe("scraping_failed");
    expect(result.error).toContain("exited with code 1");
  });

  it("retourne skippedReason='scraping_failed' si le JSON Python dit success:false", async () => {
    const proc = createMockProc();
    mockSpawn.mockReturnValue(proc);

    const promise = runScrapingPipeline("https://example.com", "guid-2");
    emitPythonJson(proc, {
      success: false,
      title: "",
      content: "",
      error: "Target page returned 403",
    });

    const result = await promise;

    expect(result.valid).toBe(false);
    // executeScraper rejecte quand success:false → passe par le catch → scraping_failed
    expect(result.skippedReason).toBe("scraping_failed");
    expect(result.error).toContain("Target page returned 403");
  });

  it("retourne skippedReason='scraping_failed' si le JSON Python est invalide (Zod)", async () => {
    const proc = createMockProc();
    mockSpawn.mockReturnValue(proc);

    const promise = runScrapingPipeline("https://example.com", "guid-3");
    // title est un nombre au lieu d'un string → Zod reject
    emitPythonJson(proc, { success: true, title: 12345 });

    const result = await promise;

    expect(result.valid).toBe(false);
    expect(result.skippedReason).toBe("scraping_failed");
    expect(result.error).toContain("Validation Zod");
  });

  it("retourne skippedReason='scraping_failed' si stdout n'est pas du JSON", async () => {
    const proc = createMockProc();
    mockSpawn.mockReturnValue(proc);

    const promise = runScrapingPipeline("https://example.com", "guid-4");
    proc.stdout.emit("data", Buffer.from("Not JSON at all", "utf-8"));
    proc.emit("close", 0);

    const result = await promise;

    expect(result.valid).toBe(false);
    expect(result.skippedReason).toBe("scraping_failed");
    expect(result.error).toContain("Invalid JSON");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 3: Pipeline — Barrière temporelle 48h
// ═══════════════════════════════════════════════════════════════════════════════

describe("runScrapingPipeline — Barrière temporelle 48h", () => {
  beforeEach(() => {
    mockSpawn.mockClear();
    mockProcessedPatchNotes.findUnique.mockReset();
  });

  it("retourne skippedReason='temporal_barrier' si pubDate > 48h", async () => {
    const proc = createMockProc();
    mockSpawn.mockReturnValue(proc);

    const promise = runScrapingPipeline("https://example.com", "guid-old");
    emitPythonJson(proc, {
      success: true,
      title: "Old Article",
      content: "Old content",
      pubDate: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(), // -72h
    });

    const result = await promise;

    expect(result.valid).toBe(false);
    expect(result.skippedReason).toBe("temporal_barrier");
  });

  it("retourne skippedReason='temporal_barrier' si pubDate est invalide", async () => {
    const proc = createMockProc();
    mockSpawn.mockReturnValue(proc);

    const promise = runScrapingPipeline("https://example.com", "guid-bad-date");
    emitPythonJson(proc, {
      success: true,
      title: "Bad date",
      content: "Content",
      pubDate: "not-a-valid-date",
    });

    const result = await promise;

    expect(result.valid).toBe(false);
    expect(result.skippedReason).toBe("temporal_barrier");
  });

  it("accepte un item avec pubDate vide (pessimiste)", async () => {
    const proc = createMockProc();
    mockSpawn.mockReturnValue(proc);
    mockProcessedPatchNotes.findUnique.mockResolvedValue(null);

    const promise = runScrapingPipeline("https://example.com", "guid-no-date");
    emitPythonJson(proc, {
      success: true,
      title: "No date article",
      content: "Content",
      pubDate: "",
    });

    const result = await promise;

    expect(result.valid).toBe(true);
    expect(result.skippedReason).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 4: Pipeline — Déduplication Prisma
// ═══════════════════════════════════════════════════════════════════════════════

describe("runScrapingPipeline — Déduplication Prisma", () => {
  beforeEach(() => {
    mockSpawn.mockClear();
    mockProcessedPatchNotes.findUnique.mockReset();
    mockProcessedPatchNotes.create.mockReset();
  });

  it("retourne skippedReason='duplicate' si l'item existe déjà", async () => {
    const proc = createMockProc();
    mockSpawn.mockReturnValue(proc);
    mockProcessedPatchNotes.findUnique.mockResolvedValue({
      guid: "guid-dup",
      title: "Already there",
    });

    const promise = runScrapingPipeline("https://example.com", "guid-dup");
    emitSuccessJson(proc);

    const result = await promise;

    expect(result.valid).toBe(false);
    expect(result.skippedReason).toBe("duplicate");
  });

  it("n'appelle PAS findUnique si le scraping échoue (short-circuit)", async () => {
    const proc = createMockProc();
    mockSpawn.mockReturnValue(proc);

    const promise = runScrapingPipeline("https://example.com", "guid-short");
    proc.emit("close", 1); // scraping fails

    await promise;

    // La déduplication ne doit pas être appelée
    expect(mockProcessedPatchNotes.findUnique).not.toHaveBeenCalled();
  });

  it("n'appelle PAS findUnique si la barrière temporelle échoue (short-circuit)", async () => {
    const proc = createMockProc();
    mockSpawn.mockReturnValue(proc);

    const promise = runScrapingPipeline("https://example.com", "guid-old-short");
    emitPythonJson(proc, {
      success: true,
      title: "Old",
      pubDate: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
    });

    await promise;

    expect(mockProcessedPatchNotes.findUnique).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 5: Pipeline — ContentType paramétrique
// ═══════════════════════════════════════════════════════════════════════════════

describe("runScrapingPipeline — ContentType paramétrique", () => {
  beforeEach(() => {
    mockSpawn.mockClear();
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
    const proc = createMockProc();
    mockSpawn.mockReturnValue(proc);
    mockProcessedPatchNotes.findUnique.mockResolvedValue(null);

    const promise = runScrapingPipeline("https://example.com", "guid-default");
    emitSuccessJson(proc);

    const result = await promise;

    expect(result.valid).toBe(true);
    expect(mockProcessedPatchNotes.findUnique).toHaveBeenCalledWith({
      where: { guid: "guid-default" },
    });
  });

  it("utilise FREE_GAME quand le type est spécifié", async () => {
    const proc = createMockProc();
    mockSpawn.mockReturnValue(proc);
    mockProcessedFreeGames.findUnique.mockResolvedValue(null);

    const promise = runScrapingPipeline(
      "https://example.com/free-game",
      "reddit-post-42",
      undefined,
      ContentType.FREE_GAME,
    );
    emitSuccessJson(proc);

    const result = await promise;

    expect(result.valid).toBe(true);
    expect(mockProcessedFreeGames.findUnique).toHaveBeenCalledWith({
      where: { redditPostId: "reddit-post-42" },
    });
  });

  it("utilise TWEET pour le ContentType correspondant", async () => {
    const proc = createMockProc();
    mockSpawn.mockReturnValue(proc);
    mockProcessedTweets.findUnique.mockResolvedValue(null);

    const promise = runScrapingPipeline(
      "https://twitter.com/user/status/123",
      "tweet-123",
      { mode: "html", timeout: 15000 },
      ContentType.TWEET,
    );
    emitSuccessJson(proc);

    const result = await promise;

    expect(result.valid).toBe(true);
    expect(result.item!.guid).toBe("tweet-123");
    expect(mockProcessedTweets.findUnique).toHaveBeenCalledWith({
      where: { tweetId: "tweet-123" },
    });
  });

  it("passe les options de scraping au spawn Python", async () => {
    const proc = createMockProc();
    mockSpawn.mockReturnValue(proc);
    mockProcessedDeal.findUnique.mockResolvedValue(null);

    const promise = runScrapingPipeline(
      "https://deals.example.com",
      "deal-xyz",
      { mode: "html", timeout: 20000 },
      ContentType.DEAL,
    );
    emitSuccessJson(proc);

    const result = await promise;

    expect(result.valid).toBe(true);

    // Vérifier les arguments passés à spawn
    const args = mockSpawn.mock.calls[0][1] as string[];
    const modeIdx = args.indexOf("--mode");
    expect(args[modeIdx + 1]).toBe("html");
    const timeoutIdx = args.indexOf("--timeout");
    expect(args[timeoutIdx + 1]).toBe("20"); // 20000ms / 1000
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 6: Pipeline — Timeout scraping
// ═══════════════════════════════════════════════════════════════════════════════

describe("runScrapingPipeline — Timeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSpawn.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retourne skippedReason='scraping_failed' après timeout", async () => {
    const proc = createMockProc();
    mockSpawn.mockReturnValue(proc);

    const promise = runScrapingPipeline("https://slow-server.com", "guid-timeout", {
      timeout: 5000,
    });

    vi.advanceTimersByTime(5001);

    const result = await promise;

    expect(result.valid).toBe(false);
    expect(result.skippedReason).toBe("scraping_failed");
    expect(result.error).toContain("timeout");
    expect(proc.kill).toHaveBeenCalledWith("SIGTERM");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 7: Pipeline — Erreur spawn (Python introuvable)
// ═══════════════════════════════════════════════════════════════════════════════

describe("runScrapingPipeline — Erreur spawn", () => {
  beforeEach(() => {
    mockSpawn.mockClear();
  });

  it("retourne skippedReason='scraping_failed' si Python est introuvable", async () => {
    const proc = createMockProc();
    mockSpawn.mockReturnValue(proc);

    const promise = runScrapingPipeline("https://example.com", "guid-spawn-err");
    proc.emit("error", new Error("Python not found"));

    const result = await promise;

    expect(result.valid).toBe(false);
    expect(result.skippedReason).toBe("scraping_failed");
    expect(result.error).toContain("Python not found");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 8: Pipeline — Flux complet 3 étapes (intégration vraie)
// ═══════════════════════════════════════════════════════════════════════════════

describe("runScrapingPipeline — Flux complet 3 étapes", () => {
  beforeEach(() => {
    mockSpawn.mockClear();
    mockProcessedPatchNotes.findUnique.mockReset();
    mockProcessedPatchNotes.create.mockReset();
  });

  it("chaîne: scraping OK → Zod OK → 48h OK → dédup OK → valid:true", async () => {
    const proc = createMockProc();
    mockSpawn.mockReturnValue(proc);
    mockProcessedPatchNotes.findUnique.mockResolvedValue(null);

    const promise = runScrapingPipeline("https://example.com", "chain-ok");
    emitSuccessJson(proc);

    const result = await promise;

    expect(result.valid).toBe(true);
    expect(result.item).toBeDefined();
    expect(result.item!.guid).toBe("chain-ok");
  });

  it("chaîne: scraping OK → Zod OK → 48h FAIL → valid:false (temporal_barrier)", async () => {
    const proc = createMockProc();
    mockSpawn.mockReturnValue(proc);

    const promise = runScrapingPipeline("https://example.com", "chain-old");
    emitPythonJson(proc, {
      success: true,
      title: "Old",
      content: "Old",
      pubDate: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const result = await promise;

    expect(result.valid).toBe(false);
    expect(result.skippedReason).toBe("temporal_barrier");
    expect(mockProcessedPatchNotes.findUnique).not.toHaveBeenCalled();
  });

  it("chaîne: scraping OK → Zod OK → 48h OK → dédup FAIL → valid:false (duplicate)", async () => {
    const proc = createMockProc();
    mockSpawn.mockReturnValue(proc);
    mockProcessedPatchNotes.findUnique.mockResolvedValue({ guid: "chain-dup" });

    const promise = runScrapingPipeline("https://example.com", "chain-dup");
    emitSuccessJson(proc);

    const result = await promise;

    expect(result.valid).toBe(false);
    expect(result.skippedReason).toBe("duplicate");
  });

  it("chaîne: scraping FAIL → les étapes Zod/48h/dédup sont court-circuitées", async () => {
    const proc = createMockProc();
    mockSpawn.mockReturnValue(proc);

    const promise = runScrapingPipeline("https://example.com", "chain-fail");
    proc.emit("close", 1);

    const result = await promise;

    expect(result.valid).toBe(false);
    expect(result.skippedReason).toBe("scraping_failed");
    expect(mockProcessedPatchNotes.findUnique).not.toHaveBeenCalled();
  });
});
