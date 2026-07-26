import { describe, it, expect } from "vitest";
import { omit, pick, deepMerge, isEmpty, flatten } from "./object.js";

describe("object utils", () => {
  it("omit removes keys", () => {
    const obj = { a: 1, b: 2, c: 3 };
    expect(omit(obj, ["b"])).toEqual({ a: 1, c: 3 });
  });

  it("pick selects keys", () => {
    const obj = { a: 1, b: 2, c: 3 };
    expect(pick(obj, ["a", "c"])).toEqual({ a: 1, c: 3 });
  });

  it("deepMerge merges nested objects", () => {
    const target = { a: { x: 1, y: 2 }, b: 3 } as Record<string, unknown>;
    const source = { a: { y: 20, z: 30 } };
    expect(deepMerge(target, source)).toEqual({ a: { x: 1, y: 20, z: 30 }, b: 3 });
  });

  it("isEmpty detects empty objects", () => {
    expect(isEmpty({})).toBe(true);
    expect(isEmpty({ a: 1 })).toBe(false);
    expect(isEmpty([])).toBe(true);
    expect(isEmpty(null)).toBe(true);
  });

  it("flatten produces dot-notation keys", () => {
    const obj = { a: { b: { c: 1 } }, d: 2 };
    expect(flatten(obj)).toEqual({ "a.b.c": 1, d: 2 });
  });
});
