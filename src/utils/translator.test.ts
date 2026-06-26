import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  checkCircuitBreaker,
  banMyMemory,
  getCircuitBreakerState,
  resetCircuitBreaker,
  translateText,
} from "./translator.js";

// ─── Logger Mock ─────────────────────────────────────────────────────────────

vi.mock("../utils/logger", () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Crée un mock fetch qui simule MyMemory succès (first call)
 * puis OpenRouter succès (second call).
 */
function mockFetchSuccess(): void {
  let callCount = 0;
  global.fetch = vi
    .fn()
    .mockImplementation(async (_url: string | URL | Request, _opts?: RequestInit) => {
      callCount++;
      if (callCount === 1) {
        // MyMemory
        return {
          ok: true,
          status: 200,
          json: async () => ({
            responseStatus: 200,
            responseData: {
              translatedText: "Bonjour le monde",
              detectedLanguage: "en",
              match: 0.95,
            },
            quotaFinished: false,
            responseDetails: "",
          }),
        } as Response;
      }
      // OpenRouter (shouldn't be called if MyMemory succeeds)
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: "Bonjour le monde via OpenRouter" } }],
        }),
      } as Response;
    });
}

/**
 * Mock fetch: MyMemory returns 429, OpenRouter succeeds.
 */
function mockFetchMyMemory429(): void {
  let callCount = 0;
  global.fetch = vi
    .fn()
    .mockImplementation(async (_url: string | URL | Request, _opts?: RequestInit) => {
      callCount++;
      if (callCount === 1) {
        // MyMemory → 429
        return {
          ok: false,
          status: 429,
          json: async () => ({ responseStatus: 429 }),
        } as Response;
      }
      // OpenRouter → succès
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: "Bonjour le monde via OpenRouter" } }],
        }),
      } as Response;
    });
}

/**
 * Mock fetch: les deux services échouent.
 */
function _mockFetchBothFail(): void {
  global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
}

// ─── Suite 1: État initial ──────────────────────────────────────────────────

describe("Circuit Breaker — État initial", () => {
  beforeEach(() => {
    resetCircuitBreaker();
  });

  it("démarre avec isMyMemoryBanned = false", () => {
    expect(checkCircuitBreaker()).toBe(false);
  });

  it("getCircuitBreakerState() retourne un état non banni", () => {
    const state = getCircuitBreakerState();
    expect(state.banned).toBe(false);
    expect(state.remainingMs).toBe(0);
  });
});

// ─── Suite 2: Bannissement 1h ───────────────────────────────────────────────

describe("Circuit Breaker — Bannissement 1h", () => {
  beforeEach(() => {
    resetCircuitBreaker();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("banMyMemory() passe isMyMemoryBanned à true", () => {
    expect(checkCircuitBreaker()).toBe(false);

    banMyMemory("MyMemory quota épuisé (429)");

    expect(checkCircuitBreaker()).toBe(true);
    const state = getCircuitBreakerState();
    expect(state.banned).toBe(true);
  });

  it("bannit MyMemory après un timeout (AbortError)", () => {
    // Simuler un AbortError → transformé en "MyMemory timeout" par le code
    banMyMemory("MyMemory timeout");

    expect(checkCircuitBreaker()).toBe(true);
    const state = getCircuitBreakerState();
    expect(state.banned).toBe(true);
    expect(state.remainingMs).toBeGreaterThan(0);
    expect(state.remainingMs).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  it("banMyMemory() enregistre un timestamp récent", () => {
    const _before = Date.now();
    banMyMemory("Erreur 429");
    const _after = Date.now();

    const state = getCircuitBreakerState();
    expect(state.banned).toBe(true);
    // Le temps restant doit être proche de 1h (3 600 000 ms)
    expect(state.remainingMs).toBeGreaterThan(0);
    expect(state.remainingMs).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  it("checkCircuitBreaker() retourne true tant que le bannissement < 1h", () => {
    vi.useFakeTimers();

    banMyMemory("Test ban");

    // Avance de 30 minutes
    vi.advanceTimersByTime(30 * 60 * 1000);
    expect(checkCircuitBreaker()).toBe(true);
    expect(getCircuitBreakerState().banned).toBe(true);

    // Avance de 29 minutes supplémentaires (59 minutes au total)
    vi.advanceTimersByTime(29 * 60 * 1000);
    expect(checkCircuitBreaker()).toBe(true);
    expect(getCircuitBreakerState().banned).toBe(true);
  });

  it("checkCircuitBreaker() auto-réinitialise après exactement 1h", () => {
    vi.useFakeTimers();

    banMyMemory("Test ban");

    // Avance exactement 1h
    vi.advanceTimersByTime(60 * 60 * 1000);

    // checkCircuitBreaker doit détecter l'expiration et réinitialiser
    expect(checkCircuitBreaker()).toBe(false);

    const state = getCircuitBreakerState();
    expect(state.banned).toBe(false);
    expect(state.remainingMs).toBe(0);
  });

  it("checkCircuitBreaker() auto-réinitialise après plus de 1h (1h+1ms)", () => {
    vi.useFakeTimers();

    banMyMemory("Test ban");

    // Avance 1h + 1ms
    vi.advanceTimersByTime(60 * 60 * 1000 + 1);

    expect(checkCircuitBreaker()).toBe(false);
    expect(getCircuitBreakerState().banned).toBe(false);
  });

  it("checkCircuitBreaker() auto-réinitialise après plusieurs heures", () => {
    vi.useFakeTimers();

    banMyMemory("Test ban");

    // Avance 5 heures
    vi.advanceTimersByTime(5 * 60 * 60 * 1000);

    expect(checkCircuitBreaker()).toBe(false);
    expect(getCircuitBreakerState().banned).toBe(false);
  });

  it("après auto-réinitialisation, un nouvel appel réussit sans bannissement", () => {
    vi.useFakeTimers();

    banMyMemory("Test ban");

    // Avance 1h
    vi.advanceTimersByTime(60 * 60 * 1000);

    // L'auto-réinitialisation se produit
    checkCircuitBreaker();

    // Un check ultérieur confirme que tout est normal
    expect(checkCircuitBreaker()).toBe(false);
    expect(getCircuitBreakerState().banned).toBe(false);
  });
});

// ─── Suite 3: Fallback OpenRouter ───────────────────────────────────────────

describe("Circuit Breaker — Fallback OpenRouter", () => {
  beforeEach(() => {
    resetCircuitBreaker();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("utilise MyMemory (Plan A) quand le Circuit Breaker est ouvert", async () => {
    mockFetchSuccess();

    const result = await translateText("Hello world", "fr");

    expect(result).not.toBeNull();
    expect(result!.translatedText).toBe("Bonjour le monde");
    // Le Circuit Breaker ne doit pas être déclenché
    expect(getCircuitBreakerState().banned).toBe(false);
  });

  it("bannit MyMemory après une erreur 429 et bascule sur OpenRouter", async () => {
    mockFetchMyMemory429();

    // Patch process.env pour OpenRouter
    const prevKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "test-key";

    try {
      const result = await translateText("Hello world", "fr");

      // Le Circuit Breaker doit être activé
      expect(getCircuitBreakerState().banned).toBe(true);

      // Le résultat vient d'OpenRouter (Plan B)
      expect(result).not.toBeNull();
      expect(result!.translatedText).toBe("Bonjour le monde via OpenRouter");
    } finally {
      process.env.OPENROUTER_API_KEY = prevKey;
    }
  });

  it("ne contacte pas MyMemory quand le Circuit Breaker est fermé (banni)", async () => {
    vi.useFakeTimers();

    // Bannir manuellement MyMemory
    banMyMemory("Test ban");

    // Mock fetch: seul OpenRouter doit être appelé
    let myMemoryCalled = false;
    let openRouterCalled = false;
    global.fetch = vi
      .fn()
      .mockImplementation(async (url: string | URL | Request, _opts?: RequestInit) => {
        const urlStr = typeof url === "string" ? url : url.toString();
        if (urlStr.includes("mymemory")) {
          myMemoryCalled = true;
          throw new Error("MyMemory should NOT be called");
        }
        if (urlStr.includes("openrouter")) {
          openRouterCalled = true;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              choices: [{ message: { content: "Fallback OpenRouter" } }],
            }),
          } as Response;
        }
        throw new Error("Unknown URL");
      });

    const prevKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "test-key";

    try {
      const result = await translateText("Hello world", "fr");

      expect(myMemoryCalled).toBe(false);
      expect(openRouterCalled).toBe(true);
      expect(result!.translatedText).toBe("Fallback OpenRouter");
    } finally {
      process.env.OPENROUTER_API_KEY = prevKey;
    }

    vi.useRealTimers();
  });

  it("retourne le texte original si tous les services échouent (fallback ultime)", async () => {
    // Bannir MyMemory
    banMyMemory("Test");

    // OpenRouter échoue aussi (pas de clé API)
    const prevKey = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    try {
      const result = await translateText("Hello world", "fr");

      expect(result).not.toBeNull();
      // Fallback ultime: texte original
      expect(result!.translatedText).toBe("Hello world");
      expect(result!.detectedLanguage).toBe("unknown");
    } finally {
      process.env.OPENROUTER_API_KEY = prevKey;
    }
  });
});

// ─── Suite 4: Reset manuel ──────────────────────────────────────────────────

describe("Circuit Breaker — Reset manuel", () => {
  beforeEach(() => {
    resetCircuitBreaker();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resetCircuitBreaker() efface le bannissement", () => {
    banMyMemory("Test ban");
    expect(checkCircuitBreaker()).toBe(true);

    resetCircuitBreaker();

    expect(checkCircuitBreaker()).toBe(false);
    expect(getCircuitBreakerState().banned).toBe(false);
    expect(getCircuitBreakerState().remainingMs).toBe(0);
  });

  it("resetCircuitBreaker() est idempotent (safe à appeler en boucle)", () => {
    resetCircuitBreaker();
    resetCircuitBreaker();
    resetCircuitBreaker();

    expect(checkCircuitBreaker()).toBe(false);
    expect(getCircuitBreakerState().banned).toBe(false);
  });

  it("après reset, un nouvel appel à translateText réessaie MyMemory", async () => {
    vi.useFakeTimers();

    // Bannir
    banMyMemory("Test ban");
    expect(checkCircuitBreaker()).toBe(true);

    // Reset
    resetCircuitBreaker();
    expect(checkCircuitBreaker()).toBe(false);

    // Mock fetch: MyMemory succès
    mockFetchSuccess();

    const result = await translateText("Hello world", "fr");
    expect(result!.translatedText).toBe("Bonjour le monde");
    expect(getCircuitBreakerState().banned).toBe(false);

    vi.useRealTimers();
  });
});

// ─── Suite 5: getCircuitBreakerState() ──────────────────────────────────────

describe("Circuit Breaker — getCircuitBreakerState()", () => {
  beforeEach(() => {
    resetCircuitBreaker();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retourne banned=false et remainingMs=0 par défaut", () => {
    const state = getCircuitBreakerState();
    expect(state).toEqual({ banned: false, remainingMs: 0 });
  });

  it("retourne banned=true avec remainingMs > 0 après bannissement", () => {
    banMyMemory("Test");
    const state = getCircuitBreakerState();
    expect(state.banned).toBe(true);
    expect(state.remainingMs).toBeGreaterThan(0);
    expect(state.remainingMs).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  it("le remainingMs diminue avec le temps", () => {
    vi.useFakeTimers();

    banMyMemory("Test");
    const state1 = getCircuitBreakerState();

    // Avance 10 minutes
    vi.advanceTimersByTime(10 * 60 * 1000);
    const state2 = getCircuitBreakerState();

    expect(state2.remainingMs).toBeLessThan(state1.remainingMs);
    // La différence doit être proche de 10 minutes
    const diff = state1.remainingMs - state2.remainingMs;
    expect(diff).toBeGreaterThanOrEqual(10 * 60 * 1000 - 100); // tolérance 100ms
  });

  it("remainingMs ne descend jamais en dessous de 0", () => {
    vi.useFakeTimers();

    banMyMemory("Test");

    // Avance 2h (au-delà du bannissement)
    vi.advanceTimersByTime(2 * 60 * 60 * 1000);

    const state = getCircuitBreakerState();
    // remainingMs est flooré à 0 via Math.max(0, ...)
    expect(state.remainingMs).toBe(0);
    // Note: getCircuitBreakerState ne déclenche PAS checkCircuitBreaker,
    // donc banned reste true tant que checkCircuitBreaker n'est pas appelé
    expect(state.banned).toBe(true);
  });

  it("après checkCircuitBreaker auto-réinitialisation, getCircuitBreakerState reflète l'état normal", () => {
    vi.useFakeTimers();

    banMyMemory("Test");
    vi.advanceTimersByTime(60 * 60 * 1000);

    // L'auto-réinitialisation se produit ici
    checkCircuitBreaker();

    const state = getCircuitBreakerState();
    expect(state.banned).toBe(false);
    expect(state.remainingMs).toBe(0);
  });
});

// ─── Suite 6: Scénarios d'intégration ───────────────────────────────────────

describe("Circuit Breaker — Scénarios d'intégration", () => {
  beforeEach(() => {
    resetCircuitBreaker();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("chaîne: succès → erreur 429 → bannissement → auto-réinitialisation → succès", async () => {
    vi.useFakeTimers();

    // --- Étape 1: Succès MyMemory ---
    mockFetchSuccess();
    const result1 = await translateText("Hello", "fr");
    expect(result1!.translatedText).toBe("Bonjour le monde");
    expect(getCircuitBreakerState().banned).toBe(false);

    // --- Étape 2: Erreur 429 → bannissement + fallback OpenRouter ---
    mockFetchMyMemory429();
    const prevKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "test-key";

    const result2 = await translateText("Hello again", "fr");
    expect(getCircuitBreakerState().banned).toBe(true);
    expect(result2!.translatedText).toBe("Bonjour le monde via OpenRouter");

    process.env.OPENROUTER_API_KEY = prevKey;

    // --- Étape 3: Toujours banni après 30 min → OpenRouter utilisé ---
    vi.advanceTimersByTime(30 * 60 * 1000);
    expect(checkCircuitBreaker()).toBe(true);

    // --- Étape 4: Auto-réinitialisation après 1h → MyMemory de nouveau disponible ---
    vi.advanceTimersByTime(31 * 60 * 1000); // total: 61 minutes
    expect(checkCircuitBreaker()).toBe(false);
    expect(getCircuitBreakerState().banned).toBe(false);

    // --- Étape 5: Nouvel appel réussi avec MyMemory ---
    mockFetchSuccess();
    const result5 = await translateText("Final test", "fr");
    expect(result5!.translatedText).toBe("Bonjour le monde");
    expect(getCircuitBreakerState().banned).toBe(false);

    vi.useRealTimers();
  });
});
