import { describe, it, expect } from "vitest";
import { CircuitBreaker, CircuitOpenError, getCircuitBreaker } from "./circuitBreaker.js";

describe("CircuitBreaker", () => {
  it("executes fn when closed", async () => {
    const cb = new CircuitBreaker({ name: "test1", failureThreshold: 3 });
    const result = await cb.execute(async () => "ok");
    expect(result).toBe("ok");
    expect(cb.getState()).toBe("closed");
  });

  it("opens after threshold failures", async () => {
    const cb = new CircuitBreaker({ name: "test2", failureThreshold: 3, resetTimeoutMs: 100 });
    for (let i = 0; i < 3; i++) {
      await expect(
        cb.execute(async () => {
          throw new Error("fail");
        }),
      ).rejects.toThrow("fail");
    }
    expect(cb.getState()).toBe("open");
  });

  it("throws CircuitOpenError when open", async () => {
    const cb = new CircuitBreaker({ name: "test3", failureThreshold: 1, resetTimeoutMs: 10_000 });
    await expect(
      cb.execute(async () => {
        throw new Error("fail");
      }),
    ).rejects.toThrow("fail");
    expect(cb.isOpen()).toBe(true);
    await expect(cb.execute(async () => "ok")).rejects.toThrow(CircuitOpenError);
  });

  it("transitions to half-open after reset timeout", async () => {
    const cb = new CircuitBreaker({
      name: "test4",
      failureThreshold: 1,
      resetTimeoutMs: 50,
      successThreshold: 1,
    });
    await expect(
      cb.execute(async () => {
        throw new Error("fail");
      }),
    ).rejects.toThrow();
    expect(cb.getState()).toBe("open");
    await new Promise((r) => setTimeout(r, 60));
    const result = await cb.execute(async () => "ok");
    expect(result).toBe("ok");
    expect(cb.getState()).toBe("closed");
  });

  it("returns to open if half-open fails", async () => {
    const cb = new CircuitBreaker({ name: "test5", failureThreshold: 1, resetTimeoutMs: 50 });
    await expect(
      cb.execute(async () => {
        throw new Error("fail");
      }),
    ).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 60));
    await expect(
      cb.execute(async () => {
        throw new Error("still failing");
      }),
    ).rejects.toThrow();
    expect(cb.getState()).toBe("open");
  });

  it("getCircuitBreaker returns singleton per name", () => {
    const a = getCircuitBreaker("shared");
    const b = getCircuitBreaker("shared");
    expect(a).toBe(b);
  });
});
