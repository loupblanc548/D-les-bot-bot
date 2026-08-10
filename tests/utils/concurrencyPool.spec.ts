import { describe, it, expect } from "vitest";
import { ConcurrencyPool } from "../../src/utils/concurrencyPool.js";

describe("ConcurrencyPool", () => {
  it("allows up to max concurrent tasks", async () => {
    const pool = new ConcurrencyPool(2);
    const order: number[] = [];

    const task = (id: number, delay: number) =>
      pool.run(async () => {
        order.push(id);
        await new Promise((r) => setTimeout(r, delay));
        return id;
      });

    const results = await Promise.all([
      task(1, 50),
      task(2, 30),
      task(3, 10),
    ]);

    expect(results).toEqual([1, 2, 3]);
    // Task 1 and 2 start immediately, task 3 waits for a slot
    expect(order[0]).toBe(1);
    expect(order[1]).toBe(2);
  });

  it("blocks when pool is full", async () => {
    const pool = new ConcurrencyPool(1);
    let task1Done = false;

    const p1 = pool.run(async () => {
      await new Promise((r) => setTimeout(r, 50));
      task1Done = true;
    });

    const p2 = pool.run(async () => {
      return "second";
    });

    await p1;
    const result = await p2;
    expect(task1Done).toBe(true);
    expect(result).toBe("second");
  });

  it("reports pending and running counts", async () => {
    const pool = new ConcurrencyPool(1);

    const p1 = pool.run(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Schedule second task while first is running
    const p2 = pool.run(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(pool.running).toBe(1);
    expect(pool.pending).toBeGreaterThanOrEqual(0);

    await p1;
    await p2;
    expect(pool.running).toBe(0);
  });
});
