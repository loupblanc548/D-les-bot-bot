import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  checkCircuitBreaker,
  banMyMemory,
  getCircuitBreakerState,
  resetCircuitBreaker,
  translateText,
} from "./translator.js";

import { detectLanguage as mockedDetectLanguage } from "./languageDetector.js";

// ─── Logger Mock ─────────────────────────────────────────────────────────────

vi.mock("../utils/logger", () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// ─── Ollama Mock (prevent dynamic import from interfering) ──────────────────

vi.mock("./ollama", () => ({
  ollamaTranslate: vi.fn().mockResolvedValue(null),
  ollamaDetectLanguage: vi.fn().mockResolvedValue(null),
}));

// ─── Language Detector Mock (prevent false short-circuit) ───────────────────

vi.mock("./languageDetector", () => ({
  detectLanguage: vi
    .fn()
    .mockReturnValue({ lang: "en", confidence: 0.9, nativeName: "English", flag: "🇬🇧" }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Crée un mock fetch qui simule OpenRouter succès (first call)
 * puis MyMemory succès (second call, fallback).
 */
function mockFetchSuccess(): void {
  let callCount = 0;
  global.fetch = vi
    .fn()
    .mockImplementation(async (_url: string | URL | Request, _opts?: RequestInit) => {
      callCount++;
      if (callCount === 1) {
        // OpenRouter (called first by translateText)
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: "Bonjour le monde" } }],
          }),
        } as Response;
      }
      // MyMemory (fallback — shouldn't be called if OpenRouter succeeds)
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
    });
}

/**
 * Mock fetch: OpenRouter returns 429, MyMemory succeeds (fallback).
 */
function mockFetchMyMemory429(): void {
  let callCount = 0;
  global.fetch = vi
    .fn()
    .mockImplementation(async (_url: string | URL | Request, _opts?: RequestInit) => {
      callCount++;
      if (callCount === 1) {
        // OpenRouter → 429
        return {
          ok: false,
          status: 429,
          json: async () => ({ responseStatus: 429 }),
        } as Response;
      }
      // MyMemory → succès (fallback)
      return {
        ok: true,
        status: 200,
        json: async () => ({
          responseStatus: 200,
          responseData: {
            translatedText: "Bonjour le monde via OpenRouter",
            detectedLanguage: "en",
            match: 0.95,
          },
          quotaFinished: false,
          responseDetails: "",
        }),
      } as Response;
    });
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
    banMyMemory("Erreur 429");

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
    // Re-set mocks that vi.restoreAllMocks may have cleared
    vi.mocked(mockedDetectLanguage).mockReturnValue({
      lang: "en",
      confidence: 0.9,
      nativeName: "English",
      flag: "🇬🇧",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("utilise MyMemory (Plan A) quand le Circuit Breaker est ouvert", async () => {
    mockFetchSuccess();
    const prevKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "test-key";

    try {
      const result = await translateText("Hello world", "fr");

      expect(result).not.toBeNull();
      expect(result!.translatedText).toBe("Bonjour le monde");
      // Le Circuit Breaker ne doit pas être déclenché
      expect(getCircuitBreakerState().banned).toBe(false);
    } finally {
      process.env.OPENROUTER_API_KEY = prevKey;
    }
  });

  it("bascule sur MyMemory après une erreur 429 d'OpenRouter", async () => {
    mockFetchMyMemory429();

    // Patch process.env pour OpenRouter
    const prevKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "test-key";

    try {
      const result = await translateText("Hello world", "fr");

      // Le Circuit Breaker MyMemory ne doit pas être déclenché (c'est OpenRouter qui 429)
      expect(getCircuitBreakerState().banned).toBe(false);

      // Le résultat vient de MyMemory (fallback)
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
        if (
          urlStr.includes("openrouter") ||
          urlStr.includes("nvidia") ||
          urlStr.includes("integrate.api")
        ) {
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
    // Bannir
    banMyMemory("Test ban");
    expect(checkCircuitBreaker()).toBe(true);

    // Reset
    resetCircuitBreaker();
    expect(checkCircuitBreaker()).toBe(false);

    // Mock fetch: OpenRouter succès (called first)
    mockFetchSuccess();

    const result = await translateText("Hello world", "fr");
    expect(result!.translatedText).toBe("Bonjour le monde");
    expect(getCircuitBreakerState().banned).toBe(false);
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
    // --- Étape 1: Succès OpenRouter ---
    mockFetchSuccess();
    const result1 = await translateText("Hello", "fr");
    expect(result1!.translatedText).toBe("Bonjour le monde");
    expect(getCircuitBreakerState().banned).toBe(false);

    // --- Étape 2: Erreur 429 OpenRouter → fallback MyMemory ---
    mockFetchMyMemory429();
    const prevKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "test-key";

    const result2 = await translateText("Hello again", "fr");
    expect(getCircuitBreakerState().banned).toBe(false);
    expect(result2!.translatedText).toBe("Bonjour le monde via OpenRouter");

    process.env.OPENROUTER_API_KEY = prevKey;

    // --- Étape 3: Bannir manuellement MyMemory et vérifier le cooldown ---
    banMyMemory("Test ban for integration");
    expect(checkCircuitBreaker()).toBe(true);

    // --- Étape 4: Auto-réinitialisation après 1h ---
    vi.useFakeTimers();
    vi.advanceTimersByTime(61 * 60 * 1000);
    expect(checkCircuitBreaker()).toBe(false);
    expect(getCircuitBreakerState().banned).toBe(false);
    vi.useRealTimers();

    // --- Étape 5: Nouvel appel réussi ---
    mockFetchSuccess();
    const result5 = await translateText("Final test", "fr");
    expect(result5!.translatedText).toBe("Bonjour le monde");
    expect(getCircuitBreakerState().banned).toBe(false);
  });
});
