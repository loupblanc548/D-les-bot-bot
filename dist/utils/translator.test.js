"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const translator_1 = require("./translator");
// ─── Logger Mock ─────────────────────────────────────────────────────────────
vitest_1.vi.mock('../utils/logger', () => ({
    default: {
        error: vitest_1.vi.fn(),
        warn: vitest_1.vi.fn(),
        info: vitest_1.vi.fn(),
        debug: vitest_1.vi.fn(),
    },
}));
// ─── Helpers ─────────────────────────────────────────────────────────────────
/**
 * Crée un mock fetch qui simule MyMemory succès (first call)
 * puis OpenRouter succès (second call).
 */
function mockFetchSuccess() {
    let callCount = 0;
    global.fetch = vitest_1.vi.fn().mockImplementation(async (_url, _opts) => {
        callCount++;
        if (callCount === 1) {
            // MyMemory
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    responseStatus: 200,
                    responseData: {
                        translatedText: 'Bonjour le monde',
                        detectedLanguage: 'en',
                        match: 0.95,
                    },
                    quotaFinished: false,
                    responseDetails: '',
                }),
            };
        }
        // OpenRouter (shouldn't be called if MyMemory succeeds)
        return {
            ok: true,
            status: 200,
            json: async () => ({
                choices: [{ message: { content: 'Bonjour le monde via OpenRouter' } }],
            }),
        };
    });
}
/**
 * Mock fetch: MyMemory returns 429, OpenRouter succeeds.
 */
function mockFetchMyMemory429() {
    let callCount = 0;
    global.fetch = vitest_1.vi.fn().mockImplementation(async (_url, _opts) => {
        callCount++;
        if (callCount === 1) {
            // MyMemory → 429
            return {
                ok: false,
                status: 429,
                json: async () => ({ responseStatus: 429 }),
            };
        }
        // OpenRouter → succès
        return {
            ok: true,
            status: 200,
            json: async () => ({
                choices: [{ message: { content: 'Bonjour le monde via OpenRouter' } }],
            }),
        };
    });
}
/**
 * Mock fetch: les deux services échouent.
 */
function mockFetchBothFail() {
    global.fetch = vitest_1.vi.fn().mockRejectedValue(new Error('Network error'));
}
// ─── Suite 1: État initial ──────────────────────────────────────────────────
(0, vitest_1.describe)('Circuit Breaker — État initial', () => {
    (0, vitest_1.beforeEach)(() => {
        (0, translator_1.resetCircuitBreaker)();
    });
    (0, vitest_1.it)('démarre avec isMyMemoryBanned = false', () => {
        (0, vitest_1.expect)((0, translator_1.checkCircuitBreaker)()).toBe(false);
    });
    (0, vitest_1.it)('getCircuitBreakerState() retourne un état non banni', () => {
        const state = (0, translator_1.getCircuitBreakerState)();
        (0, vitest_1.expect)(state.banned).toBe(false);
        (0, vitest_1.expect)(state.remainingMs).toBe(0);
    });
});
// ─── Suite 2: Bannissement 1h ───────────────────────────────────────────────
(0, vitest_1.describe)('Circuit Breaker — Bannissement 1h', () => {
    (0, vitest_1.beforeEach)(() => {
        (0, translator_1.resetCircuitBreaker)();
        vitest_1.vi.restoreAllMocks();
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.useRealTimers();
    });
    (0, vitest_1.it)('banMyMemory() passe isMyMemoryBanned à true', () => {
        (0, vitest_1.expect)((0, translator_1.checkCircuitBreaker)()).toBe(false);
        (0, translator_1.banMyMemory)('MyMemory quota épuisé (429)');
        (0, vitest_1.expect)((0, translator_1.checkCircuitBreaker)()).toBe(true);
        const state = (0, translator_1.getCircuitBreakerState)();
        (0, vitest_1.expect)(state.banned).toBe(true);
    });
    (0, vitest_1.it)('bannit MyMemory après un timeout (AbortError)', () => {
        // Simuler un AbortError → transformé en "MyMemory timeout" par le code
        (0, translator_1.banMyMemory)('MyMemory timeout');
        (0, vitest_1.expect)((0, translator_1.checkCircuitBreaker)()).toBe(true);
        const state = (0, translator_1.getCircuitBreakerState)();
        (0, vitest_1.expect)(state.banned).toBe(true);
        (0, vitest_1.expect)(state.remainingMs).toBeGreaterThan(0);
        (0, vitest_1.expect)(state.remainingMs).toBeLessThanOrEqual(60 * 60 * 1000);
    });
    (0, vitest_1.it)('banMyMemory() enregistre un timestamp récent', () => {
        const before = Date.now();
        (0, translator_1.banMyMemory)('Erreur 429');
        const after = Date.now();
        const state = (0, translator_1.getCircuitBreakerState)();
        (0, vitest_1.expect)(state.banned).toBe(true);
        // Le temps restant doit être proche de 1h (3 600 000 ms)
        (0, vitest_1.expect)(state.remainingMs).toBeGreaterThan(0);
        (0, vitest_1.expect)(state.remainingMs).toBeLessThanOrEqual(60 * 60 * 1000);
    });
    (0, vitest_1.it)('checkCircuitBreaker() retourne true tant que le bannissement < 1h', () => {
        vitest_1.vi.useFakeTimers();
        (0, translator_1.banMyMemory)('Test ban');
        // Avance de 30 minutes
        vitest_1.vi.advanceTimersByTime(30 * 60 * 1000);
        (0, vitest_1.expect)((0, translator_1.checkCircuitBreaker)()).toBe(true);
        (0, vitest_1.expect)((0, translator_1.getCircuitBreakerState)().banned).toBe(true);
        // Avance de 29 minutes supplémentaires (59 minutes au total)
        vitest_1.vi.advanceTimersByTime(29 * 60 * 1000);
        (0, vitest_1.expect)((0, translator_1.checkCircuitBreaker)()).toBe(true);
        (0, vitest_1.expect)((0, translator_1.getCircuitBreakerState)().banned).toBe(true);
    });
    (0, vitest_1.it)('checkCircuitBreaker() auto-réinitialise après exactement 1h', () => {
        vitest_1.vi.useFakeTimers();
        (0, translator_1.banMyMemory)('Test ban');
        // Avance exactement 1h
        vitest_1.vi.advanceTimersByTime(60 * 60 * 1000);
        // checkCircuitBreaker doit détecter l'expiration et réinitialiser
        (0, vitest_1.expect)((0, translator_1.checkCircuitBreaker)()).toBe(false);
        const state = (0, translator_1.getCircuitBreakerState)();
        (0, vitest_1.expect)(state.banned).toBe(false);
        (0, vitest_1.expect)(state.remainingMs).toBe(0);
    });
    (0, vitest_1.it)('checkCircuitBreaker() auto-réinitialise après plus de 1h (1h+1ms)', () => {
        vitest_1.vi.useFakeTimers();
        (0, translator_1.banMyMemory)('Test ban');
        // Avance 1h + 1ms
        vitest_1.vi.advanceTimersByTime(60 * 60 * 1000 + 1);
        (0, vitest_1.expect)((0, translator_1.checkCircuitBreaker)()).toBe(false);
        (0, vitest_1.expect)((0, translator_1.getCircuitBreakerState)().banned).toBe(false);
    });
    (0, vitest_1.it)('checkCircuitBreaker() auto-réinitialise après plusieurs heures', () => {
        vitest_1.vi.useFakeTimers();
        (0, translator_1.banMyMemory)('Test ban');
        // Avance 5 heures
        vitest_1.vi.advanceTimersByTime(5 * 60 * 60 * 1000);
        (0, vitest_1.expect)((0, translator_1.checkCircuitBreaker)()).toBe(false);
        (0, vitest_1.expect)((0, translator_1.getCircuitBreakerState)().banned).toBe(false);
    });
    (0, vitest_1.it)('après auto-réinitialisation, un nouvel appel réussit sans bannissement', () => {
        vitest_1.vi.useFakeTimers();
        (0, translator_1.banMyMemory)('Test ban');
        // Avance 1h
        vitest_1.vi.advanceTimersByTime(60 * 60 * 1000);
        // L'auto-réinitialisation se produit
        (0, translator_1.checkCircuitBreaker)();
        // Un check ultérieur confirme que tout est normal
        (0, vitest_1.expect)((0, translator_1.checkCircuitBreaker)()).toBe(false);
        (0, vitest_1.expect)((0, translator_1.getCircuitBreakerState)().banned).toBe(false);
    });
});
// ─── Suite 3: Fallback OpenRouter ───────────────────────────────────────────
(0, vitest_1.describe)('Circuit Breaker — Fallback OpenRouter', () => {
    (0, vitest_1.beforeEach)(() => {
        (0, translator_1.resetCircuitBreaker)();
        vitest_1.vi.restoreAllMocks();
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.useRealTimers();
    });
    (0, vitest_1.it)('utilise MyMemory (Plan A) quand le Circuit Breaker est ouvert', async () => {
        mockFetchSuccess();
        const result = await (0, translator_1.translateText)('Hello world', 'fr');
        (0, vitest_1.expect)(result).not.toBeNull();
        (0, vitest_1.expect)(result.translatedText).toBe('Bonjour le monde');
        // Le Circuit Breaker ne doit pas être déclenché
        (0, vitest_1.expect)((0, translator_1.getCircuitBreakerState)().banned).toBe(false);
    });
    (0, vitest_1.it)('bannit MyMemory après une erreur 429 et bascule sur OpenRouter', async () => {
        mockFetchMyMemory429();
        // Patch process.env pour OpenRouter
        const prevKey = process.env.OPENROUTER_API_KEY;
        process.env.OPENROUTER_API_KEY = 'test-key';
        try {
            const result = await (0, translator_1.translateText)('Hello world', 'fr');
            // Le Circuit Breaker doit être activé
            (0, vitest_1.expect)((0, translator_1.getCircuitBreakerState)().banned).toBe(true);
            // Le résultat vient d'OpenRouter (Plan B)
            (0, vitest_1.expect)(result).not.toBeNull();
            (0, vitest_1.expect)(result.translatedText).toBe('Bonjour le monde via OpenRouter');
        }
        finally {
            process.env.OPENROUTER_API_KEY = prevKey;
        }
    });
    (0, vitest_1.it)('ne contacte pas MyMemory quand le Circuit Breaker est fermé (banni)', async () => {
        vitest_1.vi.useFakeTimers();
        // Bannir manuellement MyMemory
        (0, translator_1.banMyMemory)('Test ban');
        // Mock fetch: seul OpenRouter doit être appelé
        let myMemoryCalled = false;
        let openRouterCalled = false;
        global.fetch = vitest_1.vi.fn().mockImplementation(async (url, _opts) => {
            const urlStr = typeof url === 'string' ? url : url.toString();
            if (urlStr.includes('mymemory')) {
                myMemoryCalled = true;
                throw new Error('MyMemory should NOT be called');
            }
            if (urlStr.includes('openrouter')) {
                openRouterCalled = true;
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        choices: [{ message: { content: 'Fallback OpenRouter' } }],
                    }),
                };
            }
            throw new Error('Unknown URL');
        });
        const prevKey = process.env.OPENROUTER_API_KEY;
        process.env.OPENROUTER_API_KEY = 'test-key';
        try {
            const result = await (0, translator_1.translateText)('Hello world', 'fr');
            (0, vitest_1.expect)(myMemoryCalled).toBe(false);
            (0, vitest_1.expect)(openRouterCalled).toBe(true);
            (0, vitest_1.expect)(result.translatedText).toBe('Fallback OpenRouter');
        }
        finally {
            process.env.OPENROUTER_API_KEY = prevKey;
        }
        vitest_1.vi.useRealTimers();
    });
    (0, vitest_1.it)('retourne le texte original si tous les services échouent (fallback ultime)', async () => {
        // Bannir MyMemory
        (0, translator_1.banMyMemory)('Test');
        // OpenRouter échoue aussi (pas de clé API)
        const prevKey = process.env.OPENROUTER_API_KEY;
        delete process.env.OPENROUTER_API_KEY;
        try {
            const result = await (0, translator_1.translateText)('Hello world', 'fr');
            (0, vitest_1.expect)(result).not.toBeNull();
            // Fallback ultime: texte original
            (0, vitest_1.expect)(result.translatedText).toBe('Hello world');
            (0, vitest_1.expect)(result.detectedLanguage).toBe('unknown');
        }
        finally {
            process.env.OPENROUTER_API_KEY = prevKey;
        }
    });
});
// ─── Suite 4: Reset manuel ──────────────────────────────────────────────────
(0, vitest_1.describe)('Circuit Breaker — Reset manuel', () => {
    (0, vitest_1.beforeEach)(() => {
        (0, translator_1.resetCircuitBreaker)();
        vitest_1.vi.restoreAllMocks();
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.useRealTimers();
    });
    (0, vitest_1.it)('resetCircuitBreaker() efface le bannissement', () => {
        (0, translator_1.banMyMemory)('Test ban');
        (0, vitest_1.expect)((0, translator_1.checkCircuitBreaker)()).toBe(true);
        (0, translator_1.resetCircuitBreaker)();
        (0, vitest_1.expect)((0, translator_1.checkCircuitBreaker)()).toBe(false);
        (0, vitest_1.expect)((0, translator_1.getCircuitBreakerState)().banned).toBe(false);
        (0, vitest_1.expect)((0, translator_1.getCircuitBreakerState)().remainingMs).toBe(0);
    });
    (0, vitest_1.it)('resetCircuitBreaker() est idempotent (safe à appeler en boucle)', () => {
        (0, translator_1.resetCircuitBreaker)();
        (0, translator_1.resetCircuitBreaker)();
        (0, translator_1.resetCircuitBreaker)();
        (0, vitest_1.expect)((0, translator_1.checkCircuitBreaker)()).toBe(false);
        (0, vitest_1.expect)((0, translator_1.getCircuitBreakerState)().banned).toBe(false);
    });
    (0, vitest_1.it)('après reset, un nouvel appel à translateText réessaie MyMemory', async () => {
        vitest_1.vi.useFakeTimers();
        // Bannir
        (0, translator_1.banMyMemory)('Test ban');
        (0, vitest_1.expect)((0, translator_1.checkCircuitBreaker)()).toBe(true);
        // Reset
        (0, translator_1.resetCircuitBreaker)();
        (0, vitest_1.expect)((0, translator_1.checkCircuitBreaker)()).toBe(false);
        // Mock fetch: MyMemory succès
        mockFetchSuccess();
        const result = await (0, translator_1.translateText)('Hello world', 'fr');
        (0, vitest_1.expect)(result.translatedText).toBe('Bonjour le monde');
        (0, vitest_1.expect)((0, translator_1.getCircuitBreakerState)().banned).toBe(false);
        vitest_1.vi.useRealTimers();
    });
});
// ─── Suite 5: getCircuitBreakerState() ──────────────────────────────────────
(0, vitest_1.describe)('Circuit Breaker — getCircuitBreakerState()', () => {
    (0, vitest_1.beforeEach)(() => {
        (0, translator_1.resetCircuitBreaker)();
        vitest_1.vi.restoreAllMocks();
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.useRealTimers();
    });
    (0, vitest_1.it)('retourne banned=false et remainingMs=0 par défaut', () => {
        const state = (0, translator_1.getCircuitBreakerState)();
        (0, vitest_1.expect)(state).toEqual({ banned: false, remainingMs: 0 });
    });
    (0, vitest_1.it)('retourne banned=true avec remainingMs > 0 après bannissement', () => {
        (0, translator_1.banMyMemory)('Test');
        const state = (0, translator_1.getCircuitBreakerState)();
        (0, vitest_1.expect)(state.banned).toBe(true);
        (0, vitest_1.expect)(state.remainingMs).toBeGreaterThan(0);
        (0, vitest_1.expect)(state.remainingMs).toBeLessThanOrEqual(60 * 60 * 1000);
    });
    (0, vitest_1.it)('le remainingMs diminue avec le temps', () => {
        vitest_1.vi.useFakeTimers();
        (0, translator_1.banMyMemory)('Test');
        const state1 = (0, translator_1.getCircuitBreakerState)();
        // Avance 10 minutes
        vitest_1.vi.advanceTimersByTime(10 * 60 * 1000);
        const state2 = (0, translator_1.getCircuitBreakerState)();
        (0, vitest_1.expect)(state2.remainingMs).toBeLessThan(state1.remainingMs);
        // La différence doit être proche de 10 minutes
        const diff = state1.remainingMs - state2.remainingMs;
        (0, vitest_1.expect)(diff).toBeGreaterThanOrEqual(10 * 60 * 1000 - 100); // tolérance 100ms
    });
    (0, vitest_1.it)('remainingMs ne descend jamais en dessous de 0', () => {
        vitest_1.vi.useFakeTimers();
        (0, translator_1.banMyMemory)('Test');
        // Avance 2h (au-delà du bannissement)
        vitest_1.vi.advanceTimersByTime(2 * 60 * 60 * 1000);
        const state = (0, translator_1.getCircuitBreakerState)();
        // remainingMs est flooré à 0 via Math.max(0, ...)
        (0, vitest_1.expect)(state.remainingMs).toBe(0);
        // Note: getCircuitBreakerState ne déclenche PAS checkCircuitBreaker,
        // donc banned reste true tant que checkCircuitBreaker n'est pas appelé
        (0, vitest_1.expect)(state.banned).toBe(true);
    });
    (0, vitest_1.it)('après checkCircuitBreaker auto-réinitialisation, getCircuitBreakerState reflète l\'état normal', () => {
        vitest_1.vi.useFakeTimers();
        (0, translator_1.banMyMemory)('Test');
        vitest_1.vi.advanceTimersByTime(60 * 60 * 1000);
        // L'auto-réinitialisation se produit ici
        (0, translator_1.checkCircuitBreaker)();
        const state = (0, translator_1.getCircuitBreakerState)();
        (0, vitest_1.expect)(state.banned).toBe(false);
        (0, vitest_1.expect)(state.remainingMs).toBe(0);
    });
});
// ─── Suite 6: Scénarios d'intégration ───────────────────────────────────────
(0, vitest_1.describe)('Circuit Breaker — Scénarios d\'intégration', () => {
    (0, vitest_1.beforeEach)(() => {
        (0, translator_1.resetCircuitBreaker)();
        vitest_1.vi.restoreAllMocks();
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.useRealTimers();
    });
    (0, vitest_1.it)('chaîne: succès → erreur 429 → bannissement → auto-réinitialisation → succès', async () => {
        vitest_1.vi.useFakeTimers();
        // --- Étape 1: Succès MyMemory ---
        mockFetchSuccess();
        const result1 = await (0, translator_1.translateText)('Hello', 'fr');
        (0, vitest_1.expect)(result1.translatedText).toBe('Bonjour le monde');
        (0, vitest_1.expect)((0, translator_1.getCircuitBreakerState)().banned).toBe(false);
        // --- Étape 2: Erreur 429 → bannissement + fallback OpenRouter ---
        mockFetchMyMemory429();
        const prevKey = process.env.OPENROUTER_API_KEY;
        process.env.OPENROUTER_API_KEY = 'test-key';
        const result2 = await (0, translator_1.translateText)('Hello again', 'fr');
        (0, vitest_1.expect)((0, translator_1.getCircuitBreakerState)().banned).toBe(true);
        (0, vitest_1.expect)(result2.translatedText).toBe('Bonjour le monde via OpenRouter');
        process.env.OPENROUTER_API_KEY = prevKey;
        // --- Étape 3: Toujours banni après 30 min → OpenRouter utilisé ---
        vitest_1.vi.advanceTimersByTime(30 * 60 * 1000);
        (0, vitest_1.expect)((0, translator_1.checkCircuitBreaker)()).toBe(true);
        // --- Étape 4: Auto-réinitialisation après 1h → MyMemory de nouveau disponible ---
        vitest_1.vi.advanceTimersByTime(31 * 60 * 1000); // total: 61 minutes
        (0, vitest_1.expect)((0, translator_1.checkCircuitBreaker)()).toBe(false);
        (0, vitest_1.expect)((0, translator_1.getCircuitBreakerState)().banned).toBe(false);
        // --- Étape 5: Nouvel appel réussi avec MyMemory ---
        mockFetchSuccess();
        const result5 = await (0, translator_1.translateText)('Final test', 'fr');
        (0, vitest_1.expect)(result5.translatedText).toBe('Bonjour le monde');
        (0, vitest_1.expect)((0, translator_1.getCircuitBreakerState)().banned).toBe(false);
        vitest_1.vi.useRealTimers();
    });
});
//# sourceMappingURL=translator.test.js.map