import { describe, expect, it } from "vitest";
import { pickVoiceGreeting, VOICE_JOIN_GREETINGS } from "./voiceGreetings.js";

describe("voice greetings", () => {
  it("has a pool of short unique French join lines without yo", () => {
    expect(VOICE_JOIN_GREETINGS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(VOICE_JOIN_GREETINGS).size).toBe(VOICE_JOIN_GREETINGS.length);
    for (const line of VOICE_JOIN_GREETINGS) {
      expect(line.length).toBeGreaterThan(2);
      expect(line.length).toBeLessThanOrEqual(80);
      expect(line.toLowerCase()).not.toMatch(/\byo\b/);
    }
  });

  it("does not pick the same greeting twice in a row", () => {
    let previous = 0;
    for (let i = 0; i < 40; i++) {
      const next = pickVoiceGreeting(VOICE_JOIN_GREETINGS, previous);
      expect(next.index).not.toBe(previous);
      expect(VOICE_JOIN_GREETINGS[next.index]).toBe(next.text);
      previous = next.index;
    }
  });
});
