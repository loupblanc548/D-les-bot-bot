import { ActivityType } from "discord.js";
import { describe, expect, it } from "vitest";
import { BOT_DESCRIPTION, JOHN_ACTIVITIES, pickNextActivity } from "./presenceRotator.js";

describe("presenceRotator", () => {
  it("keeps the Discord app description under 400 characters", () => {
    expect(BOT_DESCRIPTION.length).toBeGreaterThan(40);
    expect(BOT_DESCRIPTION.length).toBeLessThanOrEqual(400);
    expect(BOT_DESCRIPTION.toLowerCase()).toContain("john");
  });

  it("uses a large pool of short unique activities", () => {
    const types = new Set(JOHN_ACTIVITIES.map((a) => a.type));
    const names = JOHN_ACTIVITIES.map((a) => a.name);
    expect(JOHN_ACTIVITIES.length).toBeGreaterThanOrEqual(500);
    expect(types.size).toBeGreaterThanOrEqual(3);
    expect(new Set(names).size).toBe(names.length);
    expect(JOHN_ACTIVITIES.some((a) => a.name === "Surveille les Helldivers")).toBe(false);
    for (const activity of JOHN_ACTIVITIES) {
      expect(activity.name.length).toBeGreaterThan(0);
      expect(activity.name.length).toBeLessThanOrEqual(128);
    }
    expect(JOHN_ACTIVITIES.map((a) => a.type)).toEqual(
      expect.arrayContaining([
        ActivityType.Playing,
        ActivityType.Watching,
        ActivityType.Listening,
        ActivityType.Competing,
      ]),
    );
    for (const activity of JOHN_ACTIVITIES.filter((a) => a.type === ActivityType.Playing)) {
      expect(activity.name.toLowerCase().startsWith("à ")).toBe(false);
      expect(activity.name.toLowerCase().startsWith("au ")).toBe(false);
      expect(activity.name.toLowerCase().startsWith("aux ")).toBe(false);
    }
  });

  it("does not pick the same activity twice in a row", () => {
    let previous = 0;
    for (let i = 0; i < 40; i++) {
      const next = pickNextActivity(JOHN_ACTIVITIES, previous);
      expect(next.index).not.toBe(previous);
      previous = next.index;
    }
  });
});
