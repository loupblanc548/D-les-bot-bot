import { describe, it, expect } from "vitest";
import { clamp, randomRange, formatNumber, average, median } from "./math.js";

describe("math utils", () => {
  it("clamp limits value", () => {
    expect(clamp(5, 1, 10)).toBe(5);
    expect(clamp(-5, 1, 10)).toBe(1);
    expect(clamp(15, 1, 10)).toBe(10);
  });

  it("randomRange returns int in range", () => {
    for (let i = 0; i < 50; i++) {
      const n = randomRange(1, 10);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(10);
      expect(Number.isInteger(n)).toBe(true);
    }
  });

  it("randomRange swaps if min > max", () => {
    const n = randomRange(10, 1);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(10);
  });

  it("formatNumber adds separators", () => {
    expect(formatNumber(1234567)).toBe("1 234 567");
  });

  it("average computes mean", () => {
    expect(average([1, 2, 3, 4, 5])).toBe(3);
    expect(average([])).toBe(0);
  });

  it("median computes middle value", () => {
    expect(median([1, 3, 5])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});
