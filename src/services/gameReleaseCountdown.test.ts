import { describe, expect, it, vi } from "vitest";

vi.mock("../prisma.js", () => ({ default: {} }));

import { parseSteamSearchDate } from "./gameReleaseCountdown.js";

describe("parseSteamSearchDate", () => {
  it("parses Steam English search dates", () => {
    const d = parseSteamSearchDate("8 Sep, 2026");
    expect(d?.toISOString().slice(0, 10)).toBe("2026-09-08");
  });

  it("accepts unabbreviated months", () => {
    const d = parseSteamSearchDate("22 September 2026");
    expect(d?.toISOString().slice(0, 10)).toBe("2026-09-22");
  });

  it("skips coming soon / TBA", () => {
    expect(parseSteamSearchDate("Coming soon")).toBeNull();
    expect(parseSteamSearchDate("TBA")).toBeNull();
    expect(parseSteamSearchDate("")).toBeNull();
  });
});
