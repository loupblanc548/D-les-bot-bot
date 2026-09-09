import { describe, it, expect } from "vitest";
import { chunk, groupBy, uniqueBy, shuffle, sample, intersection } from "./array.js";

describe("array utils", () => {
  it("chunk splits array", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("chunk throws on size < 1", () => {
    expect(() => chunk([1], 0)).toThrow();
  });

  it("groupBy groups by key", () => {
    const items = [
      { type: "a", v: 1 },
      { type: "b", v: 2 },
      { type: "a", v: 3 },
    ];
    const grouped = groupBy(items, (i) => i.type);
    expect(grouped.a).toHaveLength(2);
    expect(grouped.b).toHaveLength(1);
  });

  it("uniqueBy deduplicates", () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 1 }, { id: 3 }];
    const result = uniqueBy(items, (i) => i.id);
    expect(result).toHaveLength(3);
  });

  it("shuffle returns same elements", () => {
    const arr = [1, 2, 3, 4, 5];
    const shuffled = shuffle(arr);
    expect(shuffled.sort()).toEqual(arr);
  });

  it("sample returns n elements", () => {
    const arr = [1, 2, 3, 4, 5];
    const sampled = sample(arr, 3);
    expect(sampled).toHaveLength(3);
    expect(sampled.every((x) => arr.includes(x))).toBe(true);
  });

  it("intersection finds common elements", () => {
    expect(intersection([1, 2, 3], [2, 3, 4])).toEqual([2, 3]);
  });
});
