import { describe, it, expect, vi } from "vitest";
import { sleep, retryWithBackoff, timeout, throttle, debounce, pMap, pLimit } from "./async.js";

describe("async utils", () => {
  it("sleep resolves after delay", async () => {
    const start = Date.now();
    await sleep(50);
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
  });

  it("retryWithBackoff succeeds on first try", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await retryWithBackoff(fn, 3, 10);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retryWithBackoff retries on failure", async () => {
    let calls = 0;
    const fn = vi.fn().mockImplementation(async () => {
      calls++;
      if (calls < 3) throw new Error("fail");
      return "ok";
    });
    const result = await retryWithBackoff(fn, 5, 10);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("retryWithBackoff throws after max retries", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fail"));
    await expect(retryWithBackoff(fn, 2, 10)).rejects.toThrow("always fail");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("timeout rejects if promise too slow", async () => {
    const slow = new Promise((r) => setTimeout(r, 200));
    await expect(timeout(slow, 50, "too slow")).rejects.toThrow("too slow");
  });

  it("timeout resolves if promise fast enough", async () => {
    const fast = Promise.resolve("ok");
    await expect(timeout(fast, 100)).resolves.toBe("ok");
  });

  it("throttle limits calls", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled();
    throttled();
    throttled();
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    throttled();
    expect(fn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("debounce delays execution", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 50);
    debounced();
    debounced();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("pMap maps with concurrency", async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await pMap(items, async (n) => n * 2, 2);
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it("pMap handles empty array", async () => {
    const results = await pMap([], async (n) => n, 5);
    expect(results).toEqual([]);
  });

  it("pLimit limits concurrency", async () => {
    let active = 0;
    let maxActive = 0;
    const limit = pLimit(2);
    const tasks = Array.from({ length: 6 }, () =>
      limit(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await sleep(20);
        active--;
      }),
    );
    await Promise.all(tasks);
    expect(maxActive).toBeLessThanOrEqual(2);
  });
});
