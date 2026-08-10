import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchWithRetry, createCircuitBreaker } from "../../src/utils/httpClient.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("fetchWithRetry", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns parsed JSON on success", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      text: async () => JSON.stringify({ ok: true }),
    });
    const result = await fetchWithRetry("http://localhost/test");
    expect(result).toEqual({ ok: true });
  });

  it("retries on 500 then succeeds", async () => {
    mockFetch
      .mockResolvedValueOnce({ status: 500, text: async () => "err" })
      .mockResolvedValueOnce({ status: 200, text: async () => JSON.stringify({ ok: true }) });
    const onRetry = vi.fn();
    const result = await fetchWithRetry("http://localhost/test", {
      retries: 2,
      backoffBaseMs: 1,
      backoffMaxMs: 10,
      onRetry,
    });
    expect(result).toEqual({ ok: true });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("returns fallback after all retries exhausted", async () => {
    mockFetch.mockResolvedValue({ status: 500, text: async () => "err" });
    const result = await fetchWithRetry("http://localhost/test", {
      retries: 1,
      backoffBaseMs: 1,
      backoffMaxMs: 5,
      fallback: null,
    });
    expect(result).toBeNull();
  });

  it("retries on network error then succeeds", async () => {
    mockFetch
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce({ status: 200, text: async () => JSON.stringify({ ok: true }) });
    const result = await fetchWithRetry("http://localhost/test", {
      retries: 2,
      backoffBaseMs: 1,
      backoffMaxMs: 10,
    });
    expect(result).toEqual({ ok: true });
  });

  it("returns raw Response when parseJson is false", async () => {
    const rawRes = { status: 200, text: async () => "data" };
    mockFetch.mockResolvedValueOnce(rawRes);
    const result = await fetchWithRetry("http://localhost/test", { parseJson: false });
    expect(result).toBe(rawRes);
  });
});

describe("createCircuitBreaker", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("opens after threshold failures", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));
    const cb = createCircuitBreaker(fn, {
      failureThreshold: 3,
      cooldownMs: 60_000,
      rollingWindowMs: 60_000,
    });

    for (let i = 0; i < 3; i++) {
      await expect(cb.fire()).rejects.toThrow("fail");
    }

    // Circuit should be OPEN now
    await expect(cb.fire()).rejects.toThrow("Circuit breaker OPEN");
    expect(fn).toHaveBeenCalledTimes(3); // 4th call should not reach fn
  });

  it("closes after cooldown + half-open successes", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce("ok")
      .mockResolvedValueOnce("ok");
    const cb = createCircuitBreaker(fn, {
      failureThreshold: 2,
      cooldownMs: 50,
      rollingWindowMs: 60_000,
      halfOpenSuccesses: 2,
    });

    // Trigger opening
    await expect(cb.fire()).rejects.toThrow("fail");
    await expect(cb.fire()).rejects.toThrow("fail");

    // Wait for cooldown
    await new Promise((r) => setTimeout(r, 60));

    // Half-open: should allow calls and close after 2 successes
    const r1 = await cb.fire();
    expect(r1).toBe("ok");
    const r2 = await cb.fire();
    expect(r2).toBe("ok");

    expect(cb.status().state).toBe("CLOSED");
  });

  it("forceOpen and forceClose work", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const cb = createCircuitBreaker(fn);

    cb.forceOpen(60_000);
    expect(cb.status().state).toBe("OPEN");
    await expect(cb.fire()).rejects.toThrow("Circuit breaker OPEN");

    cb.forceClose();
    expect(cb.status().state).toBe("CLOSED");
    const result = await cb.fire();
    expect(result).toBe("ok");
  });
});
