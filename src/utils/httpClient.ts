// Wrapper fetch + retries + timeout + simple in-memory circuit-breaker.
// No external deps required.

type FetchOpts = {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  retries?: number;
  retryOn?: (status: number) => boolean;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  signal?: AbortSignal;
  parseJson?: boolean;
  onRetry?: (attempt: number, err: unknown) => void;
  fallback?: unknown;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(ms: number) {
  return Math.floor(Math.random() * ms);
}

export async function fetchWithRetry(url: string, opts: FetchOpts = {}): Promise<any> {
  const {
    method = "GET",
    headers = {},
    body,
    timeoutMs = 10_000,
    retries = 3,
    retryOn = (status: number) => status === 429 || (status >= 500 && status < 600),
    backoffBaseMs = 300,
    backoffMaxMs = 10_000,
    parseJson = true,
    onRetry,
    fallback,
  } = opts;

  let attempt = 0;

  while (attempt <= retries) {
    attempt++;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
        signal: opts.signal ?? ac.signal,
      });
      clearTimeout(timer);

      if (retryOn(res.status)) {
        const err = new Error(`Retryable status ${res.status}`);
        onRetry?.(attempt, err);
        if (attempt <= retries) {
          const backoff = Math.min(backoffBaseMs * 2 ** (attempt - 1), backoffMaxMs);
          const wait = backoff / 2 + jitter(backoff / 2);
          await sleep(wait);
          continue;
        } else {
          if (fallback !== undefined) return fallback;
          throw err;
        }
      }

      if (!parseJson) return res;
      const text = await res.text();
      try {
        return text ? JSON.parse(text) : null;
      } catch {
        return text;
      }
    } catch (err: any) {
      clearTimeout(timer);
      const isAbort = err?.name === "AbortError";
      const isNetwork = !err?.status;
      if (attempt <= retries && (isAbort || isNetwork)) {
        onRetry?.(attempt, err);
        const backoff = Math.min(backoffBaseMs * 2 ** (attempt - 1), backoffMaxMs);
        const wait = backoff / 2 + jitter(backoff / 2);
        await sleep(wait);
        continue;
      }
      if (fallback !== undefined) return fallback;
      throw err;
    }
  }
  return fallback;
}

/**
 * Very small in-memory circuit breaker.
 * Usage:
 *   const cb = createCircuitBreaker(async (args) => fetchWithRetry(...), { failureThreshold: 5, cooldownMs: 60_000 });
 *   const result = await cb.fire(...);
 */
export function createCircuitBreaker<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  opts?: {
    failureThreshold?: number;
    rollingWindowMs?: number;
    cooldownMs?: number;
    halfOpenSuccesses?: number;
  },
) {
  const failureThreshold = opts?.failureThreshold ?? 5;
  const rollingWindowMs = opts?.rollingWindowMs ?? 60_000;
  const cooldownMs = opts?.cooldownMs ?? 60_000;
  const halfOpenSuccesses = opts?.halfOpenSuccesses ?? 2;

  let failures: number[] = [];
  let state: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED";
  let openUntil = 0;
  let halfOpenSuccessCount = 0;

  function prune() {
    const cutoff = Date.now() - rollingWindowMs;
    failures = failures.filter((t) => t >= cutoff);
  }

  async function fire(...args: any[]) {
    prune();
    if (state === "OPEN") {
      if (Date.now() < openUntil) {
        const err = new Error("Circuit breaker OPEN");
        (err as any).code = "E_CIRCUIT_OPEN";
        throw err;
      } else {
        state = "HALF_OPEN";
        halfOpenSuccessCount = 0;
      }
    }

    try {
      const res = await fn(...args);
      if (state === "HALF_OPEN") {
        halfOpenSuccessCount++;
        if (halfOpenSuccessCount >= halfOpenSuccesses) {
          state = "CLOSED";
          failures = [];
        }
      }
      return res;
    } catch (err) {
      failures.push(Date.now());
      prune();
      if (state === "HALF_OPEN") {
        state = "OPEN";
        openUntil = Date.now() + cooldownMs;
      } else if (failures.length >= failureThreshold) {
        state = "OPEN";
        openUntil = Date.now() + cooldownMs;
      }
      throw err;
    }
  }

  return {
    fire,
    status: () => ({ state, failures: failures.length, openUntil }),
    forceOpen: (ms?: number) => {
      state = "OPEN";
      openUntil = Date.now() + (ms ?? cooldownMs);
    },
    forceClose: () => {
      state = "CLOSED";
      failures = [];
    },
  };
}
