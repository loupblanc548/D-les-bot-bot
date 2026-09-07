import { describe, expect, it } from "vitest";
import { weekReleaseTier } from "./gameReleaseCountdownWeb.js";

const DAY = 86_400_000;

describe("weekReleaseTier", () => {
  it("marks this week gold, purple, then blue", () => {
    expect(weekReleaseTier(DAY)).toBe("gold");
    expect(weekReleaseTier(2 * DAY)).toBe("gold");
    expect(weekReleaseTier(3 * DAY)).toBe("purple");
    expect(weekReleaseTier(4 * DAY)).toBe("purple");
    expect(weekReleaseTier(5 * DAY)).toBe("blue");
    expect(weekReleaseTier(7 * DAY)).toBe("blue");
  });

  it("ignores past or far-future releases", () => {
    expect(weekReleaseTier(0)).toBeNull();
    expect(weekReleaseTier(-DAY)).toBeNull();
    expect(weekReleaseTier(8 * DAY)).toBeNull();
    expect(weekReleaseTier(Number.NaN)).toBeNull();
  });
});
