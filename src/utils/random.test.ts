import { describe, it, expect } from "vitest";
import { secureToken, shortUuid, randomColor } from "./random.js";

describe("random utils", () => {
  it("secureToken returns hex string of correct length", () => {
    const token = secureToken(16);
    expect(token).toHaveLength(32);
    expect(/^[a-f0-9]+$/.test(token)).toBe(true);
  });

  it("secureToken default 32 bytes = 64 chars", () => {
    expect(secureToken()).toHaveLength(64);
  });

  it("shortUuid returns 8 hex chars", () => {
    const id = shortUuid();
    expect(id).toHaveLength(8);
    expect(/^[a-f0-9]+$/.test(id)).toBe(true);
  });

  it("randomColor returns valid color int", () => {
    const color = randomColor();
    expect(color).toBeGreaterThanOrEqual(0);
    expect(color).toBeLessThanOrEqual(0xffffff);
  });

  it("secureToken generates unique values", () => {
    const a = secureToken(8);
    const b = secureToken(8);
    expect(a).not.toBe(b);
  });
});
