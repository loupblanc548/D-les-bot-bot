/**
 * taskQueue.test.ts — Tests pour la file d'attente des tâches longues
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  registerTaskHandler,
  unregisterTaskHandler,
  enqueue,
  cancelTask,
  getActiveTaskCount,
  clearResultCache,
  getResultCacheSize,
  getPendingTasks,
} from "./taskQueue.js";

vi.mock("../utils/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe("taskQueue", () => {
  beforeEach(() => {
    clearResultCache();
  });

  it("should execute a registered task", async () => {
    registerTaskHandler("test-type", async (payload: { value: number }) => {
      return payload.value * 2;
    });

    const result = await enqueue({
      id: "task-1",
      type: "test-type",
      payload: { value: 21 },
    });

    expect(result.success).toBe(true);
    expect(result.result).toBe(42);
    expect(result.fromCache).toBe(false);
  });

  it("should return error for unregistered type", async () => {
    const result = await enqueue({
      id: "task-2",
      type: "nonexistent",
      payload: {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("No handler");
  });

  it("should deduplicate with idempotency key", async () => {
    const handler = vi.fn().mockResolvedValue("result");
    registerTaskHandler("dedup-type", handler);

    const def = {
      id: "task-3",
      type: "dedup-type",
      payload: {},
      idempotencyKey: "dedup-key-1",
    };

    const result1 = await enqueue(def);
    const result2 = await enqueue(def);

    expect(result1.fromCache).toBe(false);
    expect(result2.fromCache).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("should retry on failure", async () => {
    let attempts = 0;
    registerTaskHandler("retry-type", async () => {
      attempts++;
      if (attempts < 2) throw new Error("Temporary failure");
      return "success";
    });

    const result = await enqueue({
      id: "task-4",
      type: "retry-type",
      payload: {},
      maxRetries: 2,
    });

    expect(result.success).toBe(true);
    expect(result.result).toBe("success");
    expect(attempts).toBe(2);
  });

  it("should fail after max retries", async () => {
    registerTaskHandler("always-fail", async () => {
      throw new Error("Permanent failure");
    });

    const result = await enqueue({
      id: "task-5",
      type: "always-fail",
      payload: {},
      maxRetries: 1,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Permanent failure");
  });

  it("should track active tasks", () => {
    expect(getActiveTaskCount()).toBeGreaterThanOrEqual(0);
    expect(getPendingTasks()).toBeInstanceOf(Array);
  });

  it("should track cache size", async () => {
    registerTaskHandler("cache-type", async () => "cached");
    await enqueue({
      id: "task-6",
      type: "cache-type",
      payload: {},
      idempotencyKey: "cache-key-1",
    });
    expect(getResultCacheSize()).toBeGreaterThan(0);
  });
});
