"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const events_1 = require("events");
// ─── Mock child_process.spawn ──────────────────────────────────────────────
const mockSpawn = vitest_1.vi.hoisted(() => vitest_1.vi.fn());
vitest_1.vi.mock('child_process', () => ({
    spawn: mockSpawn,
}));
// ─── Mock Prisma — 7 tables ────────────────────────────────────────────────
const mockProcessedTweets = vitest_1.vi.hoisted(() => ({ findUnique: vitest_1.vi.fn(), create: vitest_1.vi.fn() }));
const mockProcessedFreeGames = vitest_1.vi.hoisted(() => ({ findUnique: vitest_1.vi.fn(), create: vitest_1.vi.fn() }));
const mockProcessedPatchNotes = vitest_1.vi.hoisted(() => ({ findUnique: vitest_1.vi.fn(), create: vitest_1.vi.fn() }));
const mockProcessedDeal = vitest_1.vi.hoisted(() => ({ findUnique: vitest_1.vi.fn(), create: vitest_1.vi.fn() }));
const mockProcessedVideos = vitest_1.vi.hoisted(() => ({ findUnique: vitest_1.vi.fn(), create: vitest_1.vi.fn() }));
const mockProcessedGameUpdate = vitest_1.vi.hoisted(() => ({ findUnique: vitest_1.vi.fn(), create: vitest_1.vi.fn() }));
const mockProcessedPriceAlert = vitest_1.vi.hoisted(() => ({ findUnique: vitest_1.vi.fn(), create: vitest_1.vi.fn() }));
vitest_1.vi.mock('../prisma', () => ({
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
vitest_1.vi.mock('../utils/logger', () => ({
    default: {
        error: vitest_1.vi.fn(),
        warn: vitest_1.vi.fn(),
        info: vitest_1.vi.fn(),
        debug: vitest_1.vi.fn(),
    },
}));
// ─── Imports ───────────────────────────────────────────────────────────────
const ScraperManager_1 = require("../managers/ScraperManager");
// ─── Spawn Helpers ─────────────────────────────────────────────────────────
function createMockProc() {
    const proc = new events_1.EventEmitter();
    proc.stdout = new events_1.EventEmitter();
    proc.stderr = new events_1.EventEmitter();
    proc.kill = vitest_1.vi.fn();
    return proc;
}
/** Émet un JSON Python valide sur stdout puis close(0) */
function emitPythonJson(proc, data) {
    proc.stdout.emit('data', Buffer.from(JSON.stringify(data), 'utf-8'));
    proc.emit('close', 0);
}
/** Émet un JSON Python avec success=true, date récente, titre+contenu */
function emitSuccessJson(proc, overrides = {}) {
    emitPythonJson(proc, {
        success: true,
        title: 'Test Title',
        content: 'Test content here',
        pubDate: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // -1h
        link: 'https://example.com/article',
        image: 'https://example.com/img.jpg',
        ...overrides,
    });
}
// ═══════════════════════════════════════════════════════════════════════════════
// Suite 1: Pipeline complet — Succès
// ═══════════════════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('runScrapingPipeline — Succès complet', () => {
    (0, vitest_1.beforeEach)(() => {
        mockSpawn.mockClear();
        mockProcessedPatchNotes.findUnique.mockReset();
        mockProcessedPatchNotes.create.mockReset();
    });
    (0, vitest_1.it)('retourne { valid: true, item } quand toutes les étapes passent', async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        mockProcessedPatchNotes.findUnique.mockResolvedValue(null); // pas encore traité
        const promise = (0, ScraperManager_1.runScrapingPipeline)('https://example.com/article', 'guid-abc-123');
        emitSuccessJson(proc);
        const result = await promise;
        (0, vitest_1.expect)(result.valid).toBe(true);
        (0, vitest_1.expect)(result.item).toBeDefined();
        (0, vitest_1.expect)(result.item.guid).toBe('guid-abc-123');
        (0, vitest_1.expect)(result.item.title).toBe('Test Title');
        (0, vitest_1.expect)(result.item.content).toBe('Test content here');
        (0, vitest_1.expect)(result.item.link).toBe('https://example.com/article');
        (0, vitest_1.expect)(result.skippedReason).toBeUndefined();
        (0, vitest_1.expect)(result.error).toBeUndefined();
    });
});
// ═══════════════════════════════════════════════════════════════════════════════
// Suite 2: Pipeline — Échec scraping (Python error)
// ═══════════════════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('runScrapingPipeline — Échec scraping', () => {
    (0, vitest_1.beforeEach)(() => {
        mockSpawn.mockClear();
        mockProcessedPatchNotes.findUnique.mockReset();
    });
    (0, vitest_1.it)("retourne skippedReason='scraping_failed' si Python exit != 0", async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        const promise = (0, ScraperManager_1.runScrapingPipeline)('https://example.com', 'guid-1');
        proc.stderr.emit('data', Buffer.from('Python error traceback', 'utf-8'));
        proc.emit('close', 1);
        const result = await promise;
        (0, vitest_1.expect)(result.valid).toBe(false);
        (0, vitest_1.expect)(result.skippedReason).toBe('scraping_failed');
        (0, vitest_1.expect)(result.error).toContain('exited with code 1');
    });
    (0, vitest_1.it)("retourne skippedReason='scraping_failed' si le JSON Python dit success:false", async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        const promise = (0, ScraperManager_1.runScrapingPipeline)('https://example.com', 'guid-2');
        emitPythonJson(proc, {
            success: false,
            title: '',
            content: '',
            error: 'Target page returned 403',
        });
        const result = await promise;
        (0, vitest_1.expect)(result.valid).toBe(false);
        // executeScraper rejecte quand success:false → passe par le catch → scraping_failed
        (0, vitest_1.expect)(result.skippedReason).toBe('scraping_failed');
        (0, vitest_1.expect)(result.error).toContain('Target page returned 403');
    });
    (0, vitest_1.it)("retourne skippedReason='scraping_failed' si le JSON Python est invalide (Zod)", async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        const promise = (0, ScraperManager_1.runScrapingPipeline)('https://example.com', 'guid-3');
        // title est un nombre au lieu d'un string → Zod reject
        emitPythonJson(proc, { success: true, title: 12345 });
        const result = await promise;
        (0, vitest_1.expect)(result.valid).toBe(false);
        (0, vitest_1.expect)(result.skippedReason).toBe('scraping_failed');
        (0, vitest_1.expect)(result.error).toContain('Validation Zod');
    });
    (0, vitest_1.it)("retourne skippedReason='scraping_failed' si stdout n'est pas du JSON", async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        const promise = (0, ScraperManager_1.runScrapingPipeline)('https://example.com', 'guid-4');
        proc.stdout.emit('data', Buffer.from('Not JSON at all', 'utf-8'));
        proc.emit('close', 0);
        const result = await promise;
        (0, vitest_1.expect)(result.valid).toBe(false);
        (0, vitest_1.expect)(result.skippedReason).toBe('scraping_failed');
        (0, vitest_1.expect)(result.error).toContain('Invalid JSON');
    });
});
// ═══════════════════════════════════════════════════════════════════════════════
// Suite 3: Pipeline — Barrière temporelle 48h
// ═══════════════════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('runScrapingPipeline — Barrière temporelle 48h', () => {
    (0, vitest_1.beforeEach)(() => {
        mockSpawn.mockClear();
        mockProcessedPatchNotes.findUnique.mockReset();
    });
    (0, vitest_1.it)("retourne skippedReason='temporal_barrier' si pubDate > 48h", async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        const promise = (0, ScraperManager_1.runScrapingPipeline)('https://example.com', 'guid-old');
        emitPythonJson(proc, {
            success: true,
            title: 'Old Article',
            content: 'Old content',
            pubDate: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(), // -72h
        });
        const result = await promise;
        (0, vitest_1.expect)(result.valid).toBe(false);
        (0, vitest_1.expect)(result.skippedReason).toBe('temporal_barrier');
    });
    (0, vitest_1.it)("retourne skippedReason='temporal_barrier' si pubDate est invalide", async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        const promise = (0, ScraperManager_1.runScrapingPipeline)('https://example.com', 'guid-bad-date');
        emitPythonJson(proc, {
            success: true,
            title: 'Bad date',
            content: 'Content',
            pubDate: 'not-a-valid-date',
        });
        const result = await promise;
        (0, vitest_1.expect)(result.valid).toBe(false);
        (0, vitest_1.expect)(result.skippedReason).toBe('temporal_barrier');
    });
    (0, vitest_1.it)('accepte un item avec pubDate vide (pessimiste)', async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        mockProcessedPatchNotes.findUnique.mockResolvedValue(null);
        const promise = (0, ScraperManager_1.runScrapingPipeline)('https://example.com', 'guid-no-date');
        emitPythonJson(proc, {
            success: true,
            title: 'No date article',
            content: 'Content',
            pubDate: '',
        });
        const result = await promise;
        (0, vitest_1.expect)(result.valid).toBe(true);
        (0, vitest_1.expect)(result.skippedReason).toBeUndefined();
    });
});
// ═══════════════════════════════════════════════════════════════════════════════
// Suite 4: Pipeline — Déduplication Prisma
// ═══════════════════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('runScrapingPipeline — Déduplication Prisma', () => {
    (0, vitest_1.beforeEach)(() => {
        mockSpawn.mockClear();
        mockProcessedPatchNotes.findUnique.mockReset();
        mockProcessedPatchNotes.create.mockReset();
    });
    (0, vitest_1.it)("retourne skippedReason='duplicate' si l'item existe déjà", async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        mockProcessedPatchNotes.findUnique.mockResolvedValue({ guid: 'guid-dup', title: 'Already there' });
        const promise = (0, ScraperManager_1.runScrapingPipeline)('https://example.com', 'guid-dup');
        emitSuccessJson(proc);
        const result = await promise;
        (0, vitest_1.expect)(result.valid).toBe(false);
        (0, vitest_1.expect)(result.skippedReason).toBe('duplicate');
    });
    (0, vitest_1.it)("n'appelle PAS findUnique si le scraping échoue (short-circuit)", async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        const promise = (0, ScraperManager_1.runScrapingPipeline)('https://example.com', 'guid-short');
        proc.emit('close', 1); // scraping fails
        await promise;
        // La déduplication ne doit pas être appelée
        (0, vitest_1.expect)(mockProcessedPatchNotes.findUnique).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)("n'appelle PAS findUnique si la barrière temporelle échoue (short-circuit)", async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        const promise = (0, ScraperManager_1.runScrapingPipeline)('https://example.com', 'guid-old-short');
        emitPythonJson(proc, {
            success: true,
            title: 'Old',
            pubDate: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
        });
        await promise;
        (0, vitest_1.expect)(mockProcessedPatchNotes.findUnique).not.toHaveBeenCalled();
    });
});
// ═══════════════════════════════════════════════════════════════════════════════
// Suite 5: Pipeline — ContentType paramétrique
// ═══════════════════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('runScrapingPipeline — ContentType paramétrique', () => {
    (0, vitest_1.beforeEach)(() => {
        mockSpawn.mockClear();
        for (const mock of [mockProcessedTweets, mockProcessedFreeGames, mockProcessedPatchNotes,
            mockProcessedDeal, mockProcessedVideos, mockProcessedGameUpdate, mockProcessedPriceAlert]) {
            mock.findUnique.mockReset();
            mock.create.mockReset();
        }
    });
    (0, vitest_1.it)('utilise PATCH_NOTE par défaut (backward compatible)', async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        mockProcessedPatchNotes.findUnique.mockResolvedValue(null);
        const promise = (0, ScraperManager_1.runScrapingPipeline)('https://example.com', 'guid-default');
        emitSuccessJson(proc);
        const result = await promise;
        (0, vitest_1.expect)(result.valid).toBe(true);
        (0, vitest_1.expect)(mockProcessedPatchNotes.findUnique).toHaveBeenCalledWith({
            where: { guid: 'guid-default' },
        });
    });
    (0, vitest_1.it)('utilise FREE_GAME quand le type est spécifié', async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        mockProcessedFreeGames.findUnique.mockResolvedValue(null);
        const promise = (0, ScraperManager_1.runScrapingPipeline)('https://example.com/free-game', 'reddit-post-42', undefined, ScraperManager_1.ContentType.FREE_GAME);
        emitSuccessJson(proc);
        const result = await promise;
        (0, vitest_1.expect)(result.valid).toBe(true);
        (0, vitest_1.expect)(mockProcessedFreeGames.findUnique).toHaveBeenCalledWith({
            where: { redditPostId: 'reddit-post-42' },
        });
    });
    (0, vitest_1.it)('utilise TWEET pour le ContentType correspondant', async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        mockProcessedTweets.findUnique.mockResolvedValue(null);
        const promise = (0, ScraperManager_1.runScrapingPipeline)('https://twitter.com/user/status/123', 'tweet-123', { mode: 'html', timeout: 15000 }, ScraperManager_1.ContentType.TWEET);
        emitSuccessJson(proc);
        const result = await promise;
        (0, vitest_1.expect)(result.valid).toBe(true);
        (0, vitest_1.expect)(result.item.guid).toBe('tweet-123');
        (0, vitest_1.expect)(mockProcessedTweets.findUnique).toHaveBeenCalledWith({
            where: { tweetId: 'tweet-123' },
        });
    });
    (0, vitest_1.it)('passe les options de scraping au spawn Python', async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        mockProcessedDeal.findUnique.mockResolvedValue(null);
        const promise = (0, ScraperManager_1.runScrapingPipeline)('https://deals.example.com', 'deal-xyz', { mode: 'html', timeout: 20000 }, ScraperManager_1.ContentType.DEAL);
        emitSuccessJson(proc);
        const result = await promise;
        (0, vitest_1.expect)(result.valid).toBe(true);
        // Vérifier les arguments passés à spawn
        const args = mockSpawn.mock.calls[0][1];
        const modeIdx = args.indexOf('--mode');
        (0, vitest_1.expect)(args[modeIdx + 1]).toBe('html');
        const timeoutIdx = args.indexOf('--timeout');
        (0, vitest_1.expect)(args[timeoutIdx + 1]).toBe('20'); // 20000ms / 1000
    });
});
// ═══════════════════════════════════════════════════════════════════════════════
// Suite 6: Pipeline — Timeout scraping
// ═══════════════════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('runScrapingPipeline — Timeout', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.useFakeTimers();
        mockSpawn.mockClear();
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.useRealTimers();
    });
    (0, vitest_1.it)("retourne skippedReason='scraping_failed' après timeout", async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        const promise = (0, ScraperManager_1.runScrapingPipeline)('https://slow-server.com', 'guid-timeout', { timeout: 5000 });
        vitest_1.vi.advanceTimersByTime(5001);
        const result = await promise;
        (0, vitest_1.expect)(result.valid).toBe(false);
        (0, vitest_1.expect)(result.skippedReason).toBe('scraping_failed');
        (0, vitest_1.expect)(result.error).toContain('timeout');
        (0, vitest_1.expect)(proc.kill).toHaveBeenCalledWith('SIGTERM');
    });
});
// ═══════════════════════════════════════════════════════════════════════════════
// Suite 7: Pipeline — Erreur spawn (Python introuvable)
// ═══════════════════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('runScrapingPipeline — Erreur spawn', () => {
    (0, vitest_1.beforeEach)(() => {
        mockSpawn.mockClear();
    });
    (0, vitest_1.it)("retourne skippedReason='scraping_failed' si Python est introuvable", async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        const promise = (0, ScraperManager_1.runScrapingPipeline)('https://example.com', 'guid-spawn-err');
        proc.emit('error', new Error('Python not found'));
        const result = await promise;
        (0, vitest_1.expect)(result.valid).toBe(false);
        (0, vitest_1.expect)(result.skippedReason).toBe('scraping_failed');
        (0, vitest_1.expect)(result.error).toContain('Python not found');
    });
});
// ═══════════════════════════════════════════════════════════════════════════════
// Suite 8: Pipeline — Flux complet 3 étapes (intégration vraie)
// ═══════════════════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('runScrapingPipeline — Flux complet 3 étapes', () => {
    (0, vitest_1.beforeEach)(() => {
        mockSpawn.mockClear();
        mockProcessedPatchNotes.findUnique.mockReset();
        mockProcessedPatchNotes.create.mockReset();
    });
    (0, vitest_1.it)('chaîne: scraping OK → Zod OK → 48h OK → dédup OK → valid:true', async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        mockProcessedPatchNotes.findUnique.mockResolvedValue(null);
        const promise = (0, ScraperManager_1.runScrapingPipeline)('https://example.com', 'chain-ok');
        emitSuccessJson(proc);
        const result = await promise;
        (0, vitest_1.expect)(result.valid).toBe(true);
        (0, vitest_1.expect)(result.item).toBeDefined();
        (0, vitest_1.expect)(result.item.guid).toBe('chain-ok');
    });
    (0, vitest_1.it)("chaîne: scraping OK → Zod OK → 48h FAIL → valid:false (temporal_barrier)", async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        const promise = (0, ScraperManager_1.runScrapingPipeline)('https://example.com', 'chain-old');
        emitPythonJson(proc, {
            success: true,
            title: 'Old',
            content: 'Old',
            pubDate: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
        });
        const result = await promise;
        (0, vitest_1.expect)(result.valid).toBe(false);
        (0, vitest_1.expect)(result.skippedReason).toBe('temporal_barrier');
        (0, vitest_1.expect)(mockProcessedPatchNotes.findUnique).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)("chaîne: scraping OK → Zod OK → 48h OK → dédup FAIL → valid:false (duplicate)", async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        mockProcessedPatchNotes.findUnique.mockResolvedValue({ guid: 'chain-dup' });
        const promise = (0, ScraperManager_1.runScrapingPipeline)('https://example.com', 'chain-dup');
        emitSuccessJson(proc);
        const result = await promise;
        (0, vitest_1.expect)(result.valid).toBe(false);
        (0, vitest_1.expect)(result.skippedReason).toBe('duplicate');
    });
    (0, vitest_1.it)("chaîne: scraping FAIL → les étapes Zod/48h/dédup sont court-circuitées", async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        const promise = (0, ScraperManager_1.runScrapingPipeline)('https://example.com', 'chain-fail');
        proc.emit('close', 1);
        const result = await promise;
        (0, vitest_1.expect)(result.valid).toBe(false);
        (0, vitest_1.expect)(result.skippedReason).toBe('scraping_failed');
        (0, vitest_1.expect)(mockProcessedPatchNotes.findUnique).not.toHaveBeenCalled();
    });
});
//# sourceMappingURL=ScraperManager.integration.test.js.map