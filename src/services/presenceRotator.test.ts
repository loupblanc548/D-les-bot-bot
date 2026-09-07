import { ActivityType } from "discord.js";
import { describe, expect, it } from "vitest";
import { BOT_DESCRIPTION, JOHN_ACTIVITIES, pickNextActivity } from "./presenceRotator.js";

describe("presenceRotator", () => {
  it("keeps the Discord app description under 400 characters", () => {
    expect(BOT_DESCRIPTION.length).toBeGreaterThan(40);
    expect(BOT_DESCRIPTION.length).toBeLessThanOrEqual(400);
    expect(BOT_DESCRIPTION.toLowerCase()).toContain("john");
  });

  it("uses short human activities of more than one type", () => {
    const types = new Set(JOHN_ACTIVITIES.map((a) => a.type));
    expect(types.size).toBeGreaterThanOrEqual(3);
    expect(JOHN_ACTIVITIES.some((a) => a.name === "Surveille les Helldivers")).toBe(false);
    for (const activity of JOHN_ACTIVITIES) {
      expect(activity.name.length).toBeGreaterThan(0);
      expect(activity.name.length).toBeLessThanOrEqual(128);
    }
    expect(JOHN_ACTIVITIES.map((a) => a.type)).toEqual(
      expect.arrayContaining([ActivityType.Playing, ActivityType.Watching, ActivityType.Listening]),
    );
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
