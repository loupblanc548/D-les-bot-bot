"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const events_1 = require("events");
// ─── Mock child_process ─────────────────────────────────────────────────────
const mockSpawn = vitest_1.vi.hoisted(() => vitest_1.vi.fn());
vitest_1.vi.mock('child_process', () => ({
    spawn: mockSpawn,
}));
// ─── Mock logger ────────────────────────────────────────────────────────────
vitest_1.vi.mock('../utils/logger', () => ({
    default: {
        error: vitest_1.vi.fn(),
        warn: vitest_1.vi.fn(),
        info: vitest_1.vi.fn(),
        debug: vitest_1.vi.fn(),
    },
}));
// ─── Imports (after mocks) ──────────────────────────────────────────────────
const scraper_bridge_1 = require("../scrapers/scraper-bridge");
// ─── Spawn Helpers ──────────────────────────────────────────────────────────
/**
 * Crée un mock ChildProcess qui étend EventEmitter pour que
 * proc.on('close', cb) et proc.emit('close', code) fonctionnent.
 */
function createMockProc() {
    const proc = new events_1.EventEmitter();
    proc.stdout = new events_1.EventEmitter();
    proc.stderr = new events_1.EventEmitter();
    proc.kill = vitest_1.vi.fn();
    return proc;
}
/**
 * Helper: émet stdout JSON valide et close(0) sur un mock proc.
 */
function emitValidJson(proc, data) {
    proc.stdout.emit('data', Buffer.from(JSON.stringify(data), 'utf-8'));
    proc.emit('close', 0);
}
// ═══════════════════════════════════════════════════════════════════════════════
// Suite 1: ScrapedDataSchema — Validation Zod directe
// ═══════════════════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('ScrapedDataSchema — Validation Zod', () => {
    (0, vitest_1.it)('accepte des données valides complètes', () => {
        const result = scraper_bridge_1.ScrapedDataSchema.safeParse({
            title: 'Test Title',
            content: 'Test content',
            pubDate: '2024-01-15T10:00:00Z',
            date: '2024-01-15',
            link: 'https://example.com',
            image: 'https://example.com/img.jpg',
            raw: '<xml>...</xml>',
        });
        (0, vitest_1.expect)(result.success).toBe(true);
    });
    (0, vitest_1.it)('accepte des données minimales (valeurs par défaut)', () => {
        const result = scraper_bridge_1.ScrapedDataSchema.safeParse({});
        (0, vitest_1.expect)(result.success).toBe(true);
        if (result.success) {
            (0, vitest_1.expect)(result.data.title).toBe('');
            (0, vitest_1.expect)(result.data.content).toBe('');
            (0, vitest_1.expect)(result.data.pubDate).toBe('');
            (0, vitest_1.expect)(result.data.link).toBe('');
            (0, vitest_1.expect)(result.data.image).toBe('');
        }
    });
    (0, vitest_1.it)('rejette un title de mauvais type (number au lieu de string)', () => {
        const result = scraper_bridge_1.ScrapedDataSchema.safeParse({ title: 12345 });
        (0, vitest_1.expect)(result.success).toBe(false);
    });
    (0, vitest_1.it)('rejette un link de mauvais type (boolean)', () => {
        const result = scraper_bridge_1.ScrapedDataSchema.safeParse({ link: true });
        (0, vitest_1.expect)(result.success).toBe(false);
    });
    (0, vitest_1.it)('rejette items si ce n\'est pas un array', () => {
        const result = scraper_bridge_1.ScrapedDataSchema.safeParse({ items: 'not-an-array' });
        (0, vitest_1.expect)(result.success).toBe(false);
    });
    (0, vitest_1.it)('rejette un objet complètement corrompu (null)', () => {
        const result = scraper_bridge_1.ScrapedDataSchema.safeParse(null);
        (0, vitest_1.expect)(result.success).toBe(false);
    });
    (0, vitest_1.it)('rejette une string brute (pas un objet)', () => {
        const result = scraper_bridge_1.ScrapedDataSchema.safeParse('just a string');
        (0, vitest_1.expect)(result.success).toBe(false);
    });
    (0, vitest_1.it)('applique les valeurs par défaut pour les champs manquants', () => {
        const result = scraper_bridge_1.ScrapedDataSchema.safeParse({ pubDate: '2024-06-01' });
        (0, vitest_1.expect)(result.success).toBe(true);
        if (result.success) {
            (0, vitest_1.expect)(result.data.pubDate).toBe('2024-06-01');
            (0, vitest_1.expect)(result.data.title).toBe('');
            (0, vitest_1.expect)(result.data.content).toBe('');
            (0, vitest_1.expect)(result.data.date).toBe('');
            (0, vitest_1.expect)(result.data.link).toBe('');
            (0, vitest_1.expect)(result.data.image).toBe('');
        }
    });
});
// ═══════════════════════════════════════════════════════════════════════════════
// Suite 2: RssItemSchema — Validation Zod directe
// ═══════════════════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('RssItemSchema — Validation Zod', () => {
    (0, vitest_1.it)('accepte un item RSS valide complet', () => {
        const result = scraper_bridge_1.RssItemSchema.safeParse({
            title: 'Patch Note 1.2.3',
            content: 'Fixed bugs',
            pubDate: '2024-03-01T12:00:00Z',
            link: 'https://reddit.com/r/games/123',
            guid: 'abc123',
            thumbnail: 'https://img.example.com/thumb.jpg',
        });
        (0, vitest_1.expect)(result.success).toBe(true);
    });
    (0, vitest_1.it)('accepte un item minimal (seul title requis)', () => {
        const result = scraper_bridge_1.RssItemSchema.safeParse({ title: 'Minimal patch' });
        (0, vitest_1.expect)(result.success).toBe(true);
        if (result.success) {
            (0, vitest_1.expect)(result.data.content).toBe('');
            (0, vitest_1.expect)(result.data.pubDate).toBe('');
            (0, vitest_1.expect)(result.data.link).toBe('');
        }
    });
    (0, vitest_1.it)('rejette un item sans title (champ requis)', () => {
        const result = scraper_bridge_1.RssItemSchema.safeParse({ content: 'No title' });
        (0, vitest_1.expect)(result.success).toBe(false);
    });
    (0, vitest_1.it)('rejette un title vide min(1)', () => {
        const result = scraper_bridge_1.RssItemSchema.safeParse({ title: '' });
        (0, vitest_1.expect)(result.success).toBe(false);
    });
    (0, vitest_1.it)('rejette un title de mauvais type', () => {
        const result = scraper_bridge_1.RssItemSchema.safeParse({ title: 123 });
        (0, vitest_1.expect)(result.success).toBe(false);
    });
    (0, vitest_1.it)('rejette un guid de mauvais type', () => {
        const result = scraper_bridge_1.RssItemSchema.safeParse({ title: 'Test', guid: {} });
        (0, vitest_1.expect)(result.success).toBe(false);
    });
});
// ═══════════════════════════════════════════════════════════════════════════════
// Suite 3: scrapeWithScrapling — Succès (JSON valide)
// ═══════════════════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('scrapeWithScrapling — Succès', () => {
    (0, vitest_1.beforeEach)(() => {
        mockSpawn.mockClear();
    });
    (0, vitest_1.it)('retourne des données scrapées valides', async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        const promise = (0, scraper_bridge_1.scrapeWithScrapling)({ url: 'https://example.com' });
        emitValidJson(proc, {
            title: 'Test Title',
            content: 'Test content',
            date: '2024-01-15',
            link: 'https://example.com',
        });
        const result = await promise;
        (0, vitest_1.expect)(result.title).toBe('Test Title');
        (0, vitest_1.expect)(result.content).toBe('Test content');
        (0, vitest_1.expect)(result.date).toBe('2024-01-15');
        (0, vitest_1.expect)(result.link).toBe('https://example.com');
        (0, vitest_1.expect)(result.error).toBeUndefined();
    });
    (0, vitest_1.it)('retourne les données avec items pré-parsés', async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        const promise = (0, scraper_bridge_1.scrapeWithScrapling)({ url: 'https://example.com', mode: 'rss' });
        emitValidJson(proc, {
            title: 'RSS Feed',
            raw: '<rss>...</rss>',
            items: [
                { title: 'Item 1', link: 'https://a.com', pubDate: '2024-01-01' },
                { title: 'Item 2', link: 'https://b.com', pubDate: '2024-01-02' },
            ],
        });
        const result = await promise;
        (0, vitest_1.expect)(result.items).toHaveLength(2);
        (0, vitest_1.expect)(result.items[0].title).toBe('Item 1');
        (0, vitest_1.expect)(result.items[1].title).toBe('Item 2');
    });
});
// ═══════════════════════════════════════════════════════════════════════════════
// Suite 4: scrapeWithScrapling — Mapping pubDate → date
// ═══════════════════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('scrapeWithScrapling — Mapping pubDate → date', () => {
    (0, vitest_1.beforeEach)(() => {
        mockSpawn.mockClear();
    });
    (0, vitest_1.it)('mappe pubDate vers date quand date est absent', async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        const promise = (0, scraper_bridge_1.scrapeWithScrapling)({ url: 'https://example.com' });
        emitValidJson(proc, {
            title: 'Patch 1.0',
            content: 'Bug fixes',
            pubDate: '2024-06-15T14:30:00Z',
            link: 'https://reddit.com/r/games/abc',
        });
        const result = await promise;
        (0, vitest_1.expect)(result.date).toBe('2024-06-15T14:30:00Z');
        (0, vitest_1.expect)(result.title).toBe('Patch 1.0');
    });
    (0, vitest_1.it)('ne remplace PAS date si déjà présent (pubDate ignoré)', async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        const promise = (0, scraper_bridge_1.scrapeWithScrapling)({ url: 'https://example.com' });
        emitValidJson(proc, {
            title: 'Article',
            date: '2024-01-01',
            pubDate: '2024-12-31',
        });
        const result = await promise;
        (0, vitest_1.expect)(result.date).toBe('2024-01-01');
    });
    (0, vitest_1.it)('date reste vide si ni date ni pubDate', async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        const promise = (0, scraper_bridge_1.scrapeWithScrapling)({ url: 'https://example.com' });
        emitValidJson(proc, {
            title: 'No dates',
            content: 'Just content',
        });
        const result = await promise;
        (0, vitest_1.expect)(result.date).toBe('');
    });
});
// ═══════════════════════════════════════════════════════════════════════════════
// Suite 5: scrapeWithScrapling — Rejet Zod (données corrompues)
// ═══════════════════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('scrapeWithScrapling — Rejet Zod (données corrompues)', () => {
    (0, vitest_1.beforeEach)(() => {
        mockSpawn.mockClear();
    });
    (0, vitest_1.it)('rejette quand le title est un nombre (type invalide)', async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        const promise = (0, scraper_bridge_1.scrapeWithScrapling)({ url: 'https://example.com' });
        emitValidJson(proc, { title: 12345, content: 'Valid content' });
        await (0, vitest_1.expect)(promise).rejects.toThrow(/Validation Zod/i);
    });
    (0, vitest_1.it)('rejette quand le link est un objet (type invalide)', async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        const promise = (0, scraper_bridge_1.scrapeWithScrapling)({ url: 'https://example.com' });
        emitValidJson(proc, { title: 'Valid', link: { href: 'not-a-string' } });
        await (0, vitest_1.expect)(promise).rejects.toThrow(/Validation Zod/i);
    });
    (0, vitest_1.it)('rejette quand le stdout n\'est pas du JSON valide', async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        const promise = (0, scraper_bridge_1.scrapeWithScrapling)({ url: 'https://example.com' });
        proc.stdout.emit('data', Buffer.from('Pas du JSON !!!', 'utf-8'));
        proc.emit('close', 0);
        await (0, vitest_1.expect)(promise).rejects.toThrow(/Failed to parse/i);
    });
    (0, vitest_1.it)('rejette quand le stdout est vide', async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        const promise = (0, scraper_bridge_1.scrapeWithScrapling)({ url: 'https://example.com' });
        proc.emit('close', 0);
        await (0, vitest_1.expect)(promise).rejects.toThrow(/Failed to parse/i);
    });
    (0, vitest_1.it)('rejette quand le JSON a un champ error (échec scraper)', async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        const promise = (0, scraper_bridge_1.scrapeWithScrapling)({ url: 'https://example.com' });
        emitValidJson(proc, {
            title: '',
            content: '',
            error: 'Scraper failed: 403 Forbidden',
        });
        await (0, vitest_1.expect)(promise).rejects.toThrow(/403 Forbidden/i);
    });
    (0, vitest_1.it)('rejette quand Python exit avec code non-zéro', async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        const promise = (0, scraper_bridge_1.scrapeWithScrapling)({ url: 'https://example.com' });
        proc.stderr.emit('data', Buffer.from('Python traceback...', 'utf-8'));
        proc.emit('close', 1);
        await (0, vitest_1.expect)(promise).rejects.toThrow(/exited with code 1/i);
    });
    (0, vitest_1.it)('rejette quand items est un objet au lieu d\'un array', async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        const promise = (0, scraper_bridge_1.scrapeWithScrapling)({ url: 'https://example.com' });
        emitValidJson(proc, {
            title: 'Test',
            items: { not: 'an array' },
        });
        await (0, vitest_1.expect)(promise).rejects.toThrow(/Validation Zod/i);
    });
});
// ═══════════════════════════════════════════════════════════════════════════════
// Suite 6: scrapeWithScrapling — Timeout
// ═══════════════════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('scrapeWithScrapling — Timeout', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.useFakeTimers();
        mockSpawn.mockClear();
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.useRealTimers();
    });
    (0, vitest_1.it)('rejette après le délai timeout si le process ne termine pas', async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        const promise = (0, scraper_bridge_1.scrapeWithScrapling)({ url: 'https://example.com', timeout: 5000 });
        vitest_1.vi.advanceTimersByTime(5001);
        await (0, vitest_1.expect)(promise).rejects.toThrow(/timeout/i);
        (0, vitest_1.expect)(proc.kill).toHaveBeenCalledWith('SIGTERM');
    });
    (0, vitest_1.it)('ne timeout pas si le process termine avant le délai', async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        const promise = (0, scraper_bridge_1.scrapeWithScrapling)({ url: 'https://example.com', timeout: 10000 });
        emitValidJson(proc, { title: 'Quick', content: 'Done fast' });
        vitest_1.vi.advanceTimersByTime(15000);
        const result = await promise;
        (0, vitest_1.expect)(result.title).toBe('Quick');
        (0, vitest_1.expect)(proc.kill).not.toHaveBeenCalled();
    });
});
// ═══════════════════════════════════════════════════════════════════════════════
// Suite 7: scrapeRssFeed — Wrapper
// ═══════════════════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('scrapeRssFeed — Wrapper', () => {
    (0, vitest_1.beforeEach)(() => {
        mockSpawn.mockClear();
    });
    (0, vitest_1.it)('passe mode=rss et timeout au spawn', async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        const promise = (0, scraper_bridge_1.scrapeRssFeed)('https://reddit.com/r/games/.rss', 15000);
        const args = mockSpawn.mock.calls[0][1];
        const modeIdx = args.indexOf('--mode');
        (0, vitest_1.expect)(args[modeIdx + 1]).toBe('rss');
        const urlIdx = args.indexOf('--url');
        (0, vitest_1.expect)(args[urlIdx + 1]).toBe('https://reddit.com/r/games/.rss');
        const timeoutIdx = args.indexOf('--timeout');
        (0, vitest_1.expect)(args[timeoutIdx + 1]).toBe('15'); // 15000ms / 1000
        emitValidJson(proc, { title: 'RSS Feed', raw: '<rss version="2.0">...</rss>' });
        const result = await promise;
        (0, vitest_1.expect)(result.raw).toBe('<rss version="2.0">...</rss>');
    });
    (0, vitest_1.it)('utilise le timeout par défaut (30s) si non spécifié', async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        const promise = (0, scraper_bridge_1.scrapeRssFeed)('https://example.com/rss');
        const args = mockSpawn.mock.calls[0][1];
        const timeoutIdx = args.indexOf('--timeout');
        (0, vitest_1.expect)(args[timeoutIdx + 1]).toBe('30');
        emitValidJson(proc, { title: 'Feed' });
        await promise;
    });
});
// ═══════════════════════════════════════════════════════════════════════════════
// Suite 8: Scénarios combinés Zod + pubDate → date
// ═══════════════════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('scrapeWithScrapling — Scénarios combinés Zod + pubDate', () => {
    (0, vitest_1.beforeEach)(() => {
        mockSpawn.mockClear();
    });
    (0, vitest_1.it)('flux complet: pubDate → validé Zod → mappé date → résolu', async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        const promise = (0, scraper_bridge_1.scrapeWithScrapling)({ url: 'https://example.com' });
        emitValidJson(proc, {
            title: 'Reddit Patch Notes',
            content: 'Detailed patch notes content...',
            pubDate: '2024-12-25T08:00:00Z',
            link: 'https://reddit.com/r/games/comments/abc123',
            image: 'https://i.redd.it/thumbnail.jpg',
            raw: '<?xml version="1.0"?><rss>...</rss>',
            items: [
                { title: 'Item A', pubDate: '2024-12-25', link: 'https://a.com', guid: 'g1' },
                { title: 'Item B', pubDate: '2024-12-26', link: 'https://b.com', guid: 'g2' },
            ],
        });
        const result = await promise;
        (0, vitest_1.expect)(result.date).toBe('2024-12-25T08:00:00Z'); // pubDate → date
        (0, vitest_1.expect)(result.title).toBe('Reddit Patch Notes');
        (0, vitest_1.expect)(result.content).toBe('Detailed patch notes content...');
        (0, vitest_1.expect)(result.link).toBe('https://reddit.com/r/games/comments/abc123');
        (0, vitest_1.expect)(result.image).toBe('https://i.redd.it/thumbnail.jpg');
        (0, vitest_1.expect)(result.raw).toBe('<?xml version="1.0"?><rss>...</rss>');
        (0, vitest_1.expect)(result.items).toHaveLength(2);
        (0, vitest_1.expect)(result.items[0].guid).toBe('g1');
        (0, vitest_1.expect)(result.error).toBeUndefined();
    });
    (0, vitest_1.it)('extrait le dernier {...} JSON quand stdout a des logs Python avant', async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        const promise = (0, scraper_bridge_1.scrapeWithScrapling)({ url: 'https://example.com' });
        proc.stdout.emit('data', Buffer.from('2024-01-01 INFO Starting scraper...\n' +
            '2024-01-01 DEBUG Fetching URL...\n' +
            '{"title":"Valid","content":"Still works","pubDate":"2024-06-15"}\n', 'utf-8'));
        proc.emit('close', 0);
        const result = await promise;
        (0, vitest_1.expect)(result.title).toBe('Valid');
        (0, vitest_1.expect)(result.date).toBe('2024-06-15'); // mappé depuis pubDate
    });
    (0, vitest_1.it)('rejette si le JSON a un champ error après validation Zod', async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        const promise = (0, scraper_bridge_1.scrapeWithScrapling)({ url: 'https://example.com' });
        emitValidJson(proc, {
            title: 'Should fail',
            error: 'Connection refused',
        });
        await (0, vitest_1.expect)(promise).rejects.toThrow(/Connection refused/i);
    });
    (0, vitest_1.it)('rejette si spawn lui-même échoue (process error)', async () => {
        const proc = createMockProc();
        mockSpawn.mockReturnValue(proc);
        const promise = (0, scraper_bridge_1.scrapeWithScrapling)({ url: 'https://example.com' });
        proc.emit('error', new Error('Python not found'));
        await (0, vitest_1.expect)(promise).rejects.toThrow(/Python not found/i);
    });
});
//# sourceMappingURL=scraper-bridge.test.js.map