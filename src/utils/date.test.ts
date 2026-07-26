import { describe, it, expect } from "vitest";
import { formatRelative, parseDuration, toDiscordTimestamp, toTimezone, startOfDay, endOfDay } from "./date.js";

describe("date utils", () => {
  it("formatRelative past", () => {
    const past = new Date(Date.now() - 5 * 60_000);
    expect(formatRelative(past)).toContain("il y a");
    expect(formatRelative(past)).toContain("5");
  });

  it("formatRelative future", () => {
    const future = new Date(Date.now() + 2 * 3_600_000);
    expect(formatRelative(future)).toContain("dans");
    expect(formatRelative(future)).toContain("2");
  });

  it("formatRelative just now", () => {
    const now = new Date();
    expect(formatRelative(now)).toBe("à l'instant");
  });

  it("parseDuration seconds", () => {
    expect(parseDuration("30s")).toBe(30_000);
  });

  it("parseDuration hours", () => {
    expect(parseDuration("2h")).toBe(7_200_000);
  });

  it("parseDuration days", () => {
    expect(parseDuration("3d")).toBe(259_200_000);
  });

  it("parseDuration invalid", () => {
    expect(parseDuration("abc")).toBeNull();
  });

  it("toDiscordTimestamp produces valid tag", () => {
    const ts = toDiscordTimestamp(new Date(1700000000000), "R");
    expect(ts).toMatch(/^<t:\d+:R>$/);
  });

  it("toTimezone returns string", () => {
    const result = toTimezone(new Date(), "Europe/Paris");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("startOfDay sets hours to 0", () => {
    const d = startOfDay(new Date("2026-01-15T14:30:00Z"));
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it("endOfDay sets hours to 23:59", () => {
    const d = endOfDay(new Date("2026-01-15T14:30:00Z"));
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(59);
  });
});
