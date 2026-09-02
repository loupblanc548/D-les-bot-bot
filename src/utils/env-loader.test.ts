import { describe, expect, it } from "vitest";
import { sanitizeSecret } from "./env-loader.js";

describe("sanitizeSecret", () => {
  it("keeps a clean key", () => {
    expect(sanitizeSecret("gsk_abc123")).toBe("gsk_abc123");
  });

  it("strips an em-dash comment glued onto a key", () => {
    expect(sanitizeSecret("gsk_abc123 — fallback groq")).toBe("gsk_abc123");
  });

  it("strips wrapping quotes and trailing spaces", () => {
    expect(sanitizeSecret('  "AIzaSyXXXX"  ')).toBe("AIzaSyXXXX");
  });

  it("returns undefined for empty values", () => {
    expect(sanitizeSecret("   ")).toBeUndefined();
    expect(sanitizeSecret(undefined)).toBeUndefined();
  });
});
