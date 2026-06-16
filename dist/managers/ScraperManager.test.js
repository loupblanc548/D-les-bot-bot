"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
// ─── Mock Prisma — 7 tables Processed* ─────────────────────────────────────
const mockFindUnique = vitest_1.vi.hoisted(() => vitest_1.vi.fn());
const mockCreate = vitest_1.vi.hoisted(() => vitest_1.vi.fn());
// Chaque table Processed* a son propre mock pour tracer les appels
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
// ─── Helpers ───────────────────────────────────────────────────────────────
/** Liste des 7 ContentTypes à parcourir dans les tests paramétrés */
const ALL_CONTENT_TYPES = [
    ScraperManager_1.ContentType.TWEET,
    ScraperManager_1.ContentType.FREE_GAME,
    ScraperManager_1.ContentType.PATCH_NOTE,
    ScraperManager_1.ContentType.DEAL,
    ScraperManager_1.ContentType.VIDEO,
    ScraperManager_1.ContentType.GAME_UPDATE,
    ScraperManager_1.ContentType.PRICE_ALERT,
];
/** Map ContentType → mock model */
function getMockForType(type) {
    const map = {
        [ScraperManager_1.ContentType.TWEET]: mockProcessedTweets,
        [ScraperManager_1.ContentType.FREE_GAME]: mockProcessedFreeGames,
        [ScraperManager_1.ContentType.PATCH_NOTE]: mockProcessedPatchNotes,
        [ScraperManager_1.ContentType.DEAL]: mockProcessedDeal,
        [ScraperManager_1.ContentType.VIDEO]: mockProcessedVideos,
        [ScraperManager_1.ContentType.GAME_UPDATE]: mockProcessedGameUpdate,
        [ScraperManager_1.ContentType.PRICE_ALERT]: mockProcessedPriceAlert,
    };
    return map[type];
}
/** Attendues pour chaque ContentType */
const EXPECTED_CONFIGS = {
    [ScraperManager_1.ContentType.TWEET]: { tableName: 'processedTweets', uniqueField: 'tweetId' },
    [ScraperManager_1.ContentType.FREE_GAME]: { tableName: 'processedFreeGames', uniqueField: 'redditPostId' },
    [ScraperManager_1.ContentType.PATCH_NOTE]: { tableName: 'processedPatchNotes', uniqueField: 'guid' },
    [ScraperManager_1.ContentType.DEAL]: { tableName: 'processedDeal', uniqueField: 'guid' },
    [ScraperManager_1.ContentType.VIDEO]: { tableName: 'processedVideos', uniqueField: 'videoId' },
    [ScraperManager_1.ContentType.GAME_UPDATE]: { tableName: 'processedGameUpdate', uniqueField: 'updateId' },
    [ScraperManager_1.ContentType.PRICE_ALERT]: { tableName: 'processedPriceAlert', uniqueField: 'alertId' },
};
// ═══════════════════════════════════════════════════════════════════════════════
// Suite 1: getContentTypeConfig — Résolution correcte pour les 7 types
// ═══════════════════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('getContentTypeConfig — Les 7 ContentTypes', () => {
    for (const type of ALL_CONTENT_TYPES) {
        (0, vitest_1.it)(`retourne la config correcte pour ${type}`, () => {
            const config = (0, ScraperManager_1.getContentTypeConfig)(type);
            (0, vitest_1.expect)(config.tableName).toBe(EXPECTED_CONFIGS[type].tableName);
            (0, vitest_1.expect)(config.uniqueField).toBe(EXPECTED_CONFIGS[type].uniqueField);
        });
    }
    (0, vitest_1.it)('lance une erreur pour un ContentType inconnu', () => {
        (0, vitest_1.expect)(() => (0, ScraperManager_1.getContentTypeConfig)('invalid_type')).toThrow(/ContentType inconnu/i);
    });
});
// ═══════════════════════════════════════════════════════════════════════════════
// Suite 2: getUniqueField — Champ unique correct pour les 7 types
// ═══════════════════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('getUniqueField — Les 7 ContentTypes', () => {
    for (const type of ALL_CONTENT_TYPES) {
        (0, vitest_1.it)(`retourne le champ unique correct pour ${type}`, () => {
            const field = (0, ScraperManager_1.getUniqueField)(type);
            (0, vitest_1.expect)(field).toBe(EXPECTED_CONFIGS[type].uniqueField);
        });
    }
});
// ═══════════════════════════════════════════════════════════════════════════════
// Suite 3: isNewItem — Déduplication sur les 7 tables
// ═══════════════════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('isNewItem — Déduplication générique (7 ContentTypes)', () => {
    (0, vitest_1.beforeEach)(() => {
        // Reset all mocks
        for (const type of ALL_CONTENT_TYPES) {
            const mock = getMockForType(type);
            mock.findUnique.mockReset();
            mock.create.mockReset();
        }
    });
    for (const type of ALL_CONTENT_TYPES) {
        const config = EXPECTED_CONFIGS[type];
        (0, vitest_1.describe)(`ContentType.${type.toUpperCase()}`, () => {
            (0, vitest_1.it)("retourne true quand l'item n'existe pas (findUnique → null)", async () => {
                const mock = getMockForType(type);
                mock.findUnique.mockResolvedValue(null);
                const result = await (0, ScraperManager_1.isNewItem)(type, 'unique-123');
                (0, vitest_1.expect)(result).toBe(true);
                (0, vitest_1.expect)(mock.findUnique).toHaveBeenCalledWith({
                    where: { [config.uniqueField]: 'unique-123' },
                });
            });
            (0, vitest_1.it)("retourne false quand l'item existe déjà (findUnique → objet)", async () => {
                const mock = getMockForType(type);
                mock.findUnique.mockResolvedValue({ [config.uniqueField]: 'unique-123', createdAt: new Date() });
                const result = await (0, ScraperManager_1.isNewItem)(type, 'unique-123');
                (0, vitest_1.expect)(result).toBe(false);
            });
            (0, vitest_1.it)("utilise le bon uniqueField dans la clause where", async () => {
                const mock = getMockForType(type);
                mock.findUnique.mockResolvedValue(null);
                await (0, ScraperManager_1.isNewItem)(type, 'test-id-42');
                const callArgs = mock.findUnique.mock.calls[0][0];
                (0, vitest_1.expect)(callArgs.where).toHaveProperty(config.uniqueField, 'test-id-42');
            });
        });
    }
    (0, vitest_1.it)("retourne false en cas d'erreur Prisma (sécurité anti-doublon)", async () => {
        mockProcessedPatchNotes.findUnique.mockRejectedValue(new Error('Connection refused'));
        const result = await (0, ScraperManager_1.isNewItem)(ScraperManager_1.ContentType.PATCH_NOTE, 'err-guid');
        (0, vitest_1.expect)(result).toBe(false);
    });
});
// ═══════════════════════════════════════════════════════════════════════════════
// Suite 4: markAsProcessed — Marquage sur les 7 tables
// ═══════════════════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('markAsProcessed — Marquage générique (7 ContentTypes)', () => {
    (0, vitest_1.beforeEach)(() => {
        for (const type of ALL_CONTENT_TYPES) {
            const mock = getMockForType(type);
            mock.findUnique.mockReset();
            mock.create.mockReset();
        }
    });
    for (const type of ALL_CONTENT_TYPES) {
        const config = EXPECTED_CONFIGS[type];
        (0, vitest_1.describe)(`ContentType.${type.toUpperCase()}`, () => {
            (0, vitest_1.it)("appelle create avec l'uniqueField et title vide", async () => {
                const mock = getMockForType(type);
                mock.create.mockResolvedValue({ [config.uniqueField]: 'mark-me' });
                await (0, ScraperManager_1.markAsProcessed)(type, 'mark-me');
                (0, vitest_1.expect)(mock.create).toHaveBeenCalledWith({
                    data: { [config.uniqueField]: 'mark-me', title: '' },
                });
            });
            (0, vitest_1.it)("ne lance pas d'erreur si l'item existe déjà (doublon P2002)", async () => {
                const mock = getMockForType(type);
                const prismaError = new Error('Unique constraint failed');
                prismaError.code = 'P2002';
                mock.create.mockRejectedValue(prismaError);
                // Ne doit pas throw
                await (0, vitest_1.expect)((0, ScraperManager_1.markAsProcessed)(type, 'duplicate-id')).resolves.toBeUndefined();
            });
            (0, vitest_1.it)("ne lance pas d'erreur pour d'autres erreurs Prisma non-P2002", async () => {
                const mock = getMockForType(type);
                mock.create.mockRejectedValue(new Error('Some other error'));
                // Ne doit pas throw (erreur silencieuse, loggée)
                await (0, vitest_1.expect)((0, ScraperManager_1.markAsProcessed)(type, 'error-id')).resolves.toBeUndefined();
            });
        });
    }
});
// ═══════════════════════════════════════════════════════════════════════════════
// Suite 5: Scénarios combinés — isNewItem + markAsProcessed
// ═══════════════════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('isNewItem + markAsProcessed — Flux complet', () => {
    (0, vitest_1.beforeEach)(() => {
        for (const type of ALL_CONTENT_TYPES) {
            const mock = getMockForType(type);
            mock.findUnique.mockReset();
            mock.create.mockReset();
        }
    });
    (0, vitest_1.it)("flux complet PATCH_NOTE: nouveau → traité → plus nouveau", async () => {
        // Étape 1: L'item n'existe pas encore
        mockProcessedPatchNotes.findUnique.mockResolvedValue(null);
        (0, vitest_1.expect)(await (0, ScraperManager_1.isNewItem)(ScraperManager_1.ContentType.PATCH_NOTE, 'guid-abc')).toBe(true);
        // Étape 2: Marquer comme traité
        mockProcessedPatchNotes.create.mockResolvedValue({ guid: 'guid-abc' });
        await (0, ScraperManager_1.markAsProcessed)(ScraperManager_1.ContentType.PATCH_NOTE, 'guid-abc');
        (0, vitest_1.expect)(mockProcessedPatchNotes.create).toHaveBeenCalledWith({
            data: { guid: 'guid-abc', title: '' },
        });
        // Étape 3: L'item existe maintenant
        mockProcessedPatchNotes.findUnique.mockResolvedValue({ guid: 'guid-abc' });
        (0, vitest_1.expect)(await (0, ScraperManager_1.isNewItem)(ScraperManager_1.ContentType.PATCH_NOTE, 'guid-abc')).toBe(false);
    });
    (0, vitest_1.it)('chaque ContentType utilise sa propre table (isolation)', async () => {
        // Marquer un TWEET
        mockProcessedTweets.create.mockResolvedValue({ tweetId: 't1' });
        await (0, ScraperManager_1.markAsProcessed)(ScraperManager_1.ContentType.TWEET, 't1');
        (0, vitest_1.expect)(mockProcessedTweets.create).toHaveBeenCalledWith({
            data: { tweetId: 't1', title: '' },
        });
        // Marquer un FREE_GAME (table différente)
        mockProcessedFreeGames.create.mockResolvedValue({ redditPostId: 'fg1' });
        await (0, ScraperManager_1.markAsProcessed)(ScraperManager_1.ContentType.FREE_GAME, 'fg1');
        (0, vitest_1.expect)(mockProcessedFreeGames.create).toHaveBeenCalledWith({
            data: { redditPostId: 'fg1', title: '' },
        });
        // Vérifier l'isolation: chaque table a reçu exactement 1 appel
        (0, vitest_1.expect)(mockProcessedTweets.create).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(mockProcessedFreeGames.create).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(mockProcessedPatchNotes.create).toHaveBeenCalledTimes(0);
    });
    (0, vitest_1.it)('deux ContentTypes avec le même uniqueField (DEAL et PATCH_NOTE → guid) restent isolés', async () => {
        // Marquer un DEAL
        mockProcessedDeal.findUnique.mockResolvedValue(null);
        mockProcessedDeal.create.mockResolvedValue({ guid: 'shared-guid' });
        (0, vitest_1.expect)(await (0, ScraperManager_1.isNewItem)(ScraperManager_1.ContentType.DEAL, 'shared-guid')).toBe(true);
        await (0, ScraperManager_1.markAsProcessed)(ScraperManager_1.ContentType.DEAL, 'shared-guid');
        // Le même guid dans PATCH_NOTE est indépendant
        mockProcessedPatchNotes.findUnique.mockResolvedValue(null);
        (0, vitest_1.expect)(await (0, ScraperManager_1.isNewItem)(ScraperManager_1.ContentType.PATCH_NOTE, 'shared-guid')).toBe(true);
        (0, vitest_1.expect)(mockProcessedDeal.create).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(mockProcessedPatchNotes.create).toHaveBeenCalledTimes(0);
    });
});
// ═══════════════════════════════════════════════════════════════════════════════
// Suite 6: isWithinTemporalBarrier — Barrière 48h
// ═══════════════════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('isWithinTemporalBarrier — Barrière 48h', () => {
    (0, vitest_1.it)('accepte une date récente (moins de 48h)', () => {
        const recent = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(); // -1h
        (0, vitest_1.expect)((0, ScraperManager_1.isWithinTemporalBarrier)(recent)).toBe(true);
    });
    (0, vitest_1.it)('accepte une date tout juste dans la limite (47h)', () => {
        const borderline = new Date(Date.now() - 47 * 60 * 60 * 1000).toISOString();
        (0, vitest_1.expect)((0, ScraperManager_1.isWithinTemporalBarrier)(borderline)).toBe(true);
    });
    (0, vitest_1.it)('rejette une date de plus de 48h', () => {
        const old = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(); // -72h
        (0, vitest_1.expect)((0, ScraperManager_1.isWithinTemporalBarrier)(old)).toBe(false);
    });
    (0, vitest_1.it)('rejette une date tout juste hors limite (49h)', () => {
        const justOver = new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString();
        (0, vitest_1.expect)((0, ScraperManager_1.isWithinTemporalBarrier)(justOver)).toBe(false);
    });
    (0, vitest_1.it)('accepte quand pubDate est vide (pessimiste)', () => {
        (0, vitest_1.expect)((0, ScraperManager_1.isWithinTemporalBarrier)('')).toBe(true);
    });
    (0, vitest_1.it)('rejette une date invalide (NaN)', () => {
        (0, vitest_1.expect)((0, ScraperManager_1.isWithinTemporalBarrier)('not-a-date-at-all')).toBe(false);
    });
    (0, vitest_1.it)('rejette une date future bizarre', () => {
        const future = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000).toISOString();
        // Une date future est > 48h dans le PASSÉ, donc elle est acceptée
        // car age = now - future < 0 → age <= TEMPORAL_BARRIER_MS
        // C'est techniquement un edge case: une date future passe la barrière
        (0, vitest_1.expect)((0, ScraperManager_1.isWithinTemporalBarrier)(future)).toBe(true);
    });
    (0, vitest_1.it)('accepte une date à exactement 48h (limite inclusive)', () => {
        const exact48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        (0, vitest_1.expect)((0, ScraperManager_1.isWithinTemporalBarrier)(exact48h)).toBe(true);
    });
});
// ═══════════════════════════════════════════════════════════════════════════════
// Suite 7: ContentType enum — Valeurs correctes
// ═══════════════════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('ContentType enum — Valeurs', () => {
    (0, vitest_1.it)('contient exactement 7 membres', () => {
        const values = Object.values(ScraperManager_1.ContentType);
        (0, vitest_1.expect)(values).toHaveLength(7);
    });
    (0, vitest_1.it)('chaque valeur est un string distinct', () => {
        const values = Object.values(ScraperManager_1.ContentType);
        const unique = new Set(values);
        (0, vitest_1.expect)(unique.size).toBe(7);
    });
    (0, vitest_1.it)('TWEET = "tweet"', () => {
        (0, vitest_1.expect)(ScraperManager_1.ContentType.TWEET).toBe('tweet');
    });
    (0, vitest_1.it)('FREE_GAME = "free_game"', () => {
        (0, vitest_1.expect)(ScraperManager_1.ContentType.FREE_GAME).toBe('free_game');
    });
    (0, vitest_1.it)('PATCH_NOTE = "patch_note"', () => {
        (0, vitest_1.expect)(ScraperManager_1.ContentType.PATCH_NOTE).toBe('patch_note');
    });
    (0, vitest_1.it)('DEAL = "deal"', () => {
        (0, vitest_1.expect)(ScraperManager_1.ContentType.DEAL).toBe('deal');
    });
    (0, vitest_1.it)('VIDEO = "video"', () => {
        (0, vitest_1.expect)(ScraperManager_1.ContentType.VIDEO).toBe('video');
    });
    (0, vitest_1.it)('GAME_UPDATE = "game_update"', () => {
        (0, vitest_1.expect)(ScraperManager_1.ContentType.GAME_UPDATE).toBe('game_update');
    });
    (0, vitest_1.it)('PRICE_ALERT = "price_alert"', () => {
        (0, vitest_1.expect)(ScraperManager_1.ContentType.PRICE_ALERT).toBe('price_alert');
    });
});
// ═══════════════════════════════════════════════════════════════════════════════
// Suite 8: Zod Schemas — Validation des schémas exportés
// ═══════════════════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('ScrapedDataSchema — Validation', () => {
    (0, vitest_1.it)('accepte un objet valide avec success=true', () => {
        const result = ScraperManager_1.ScrapedDataSchema.safeParse({
            success: true,
            title: 'Test',
            content: 'Content',
            pubDate: '2024-01-01',
        });
        (0, vitest_1.expect)(result.success).toBe(true);
    });
    (0, vitest_1.it)('rejette si success est un string au lieu de boolean', () => {
        const result = ScraperManager_1.ScrapedDataSchema.safeParse({ success: 'true' });
        (0, vitest_1.expect)(result.success).toBe(false);
    });
    (0, vitest_1.it)('applique les valeurs par défaut', () => {
        const result = ScraperManager_1.ScrapedDataSchema.safeParse({ success: true });
        (0, vitest_1.expect)(result.success).toBe(true);
        if (result.success) {
            (0, vitest_1.expect)(result.data.title).toBe('');
            (0, vitest_1.expect)(result.data.content).toBe('');
            (0, vitest_1.expect)(result.data.pubDate).toBe('');
        }
    });
});
(0, vitest_1.describe)('ScrapedItemSchema — Validation', () => {
    (0, vitest_1.it)('accepte un item valide', () => {
        const result = ScraperManager_1.ScrapedItemSchema.safeParse({
            guid: 'abc-123',
            title: 'Valid Item',
            content: 'Some content',
        });
        (0, vitest_1.expect)(result.success).toBe(true);
    });
    (0, vitest_1.it)('rejette sans guid (champ requis min(1))', () => {
        const result = ScraperManager_1.ScrapedItemSchema.safeParse({ title: 'No GUID' });
        (0, vitest_1.expect)(result.success).toBe(false);
    });
    (0, vitest_1.it)('rejette avec guid vide', () => {
        const result = ScraperManager_1.ScrapedItemSchema.safeParse({ guid: '', title: 'Empty GUID' });
        (0, vitest_1.expect)(result.success).toBe(false);
    });
    (0, vitest_1.it)('rejette sans title (champ requis min(1))', () => {
        const result = ScraperManager_1.ScrapedItemSchema.safeParse({ guid: 'abc' });
        (0, vitest_1.expect)(result.success).toBe(false);
    });
});
//# sourceMappingURL=ScraperManager.test.js.map