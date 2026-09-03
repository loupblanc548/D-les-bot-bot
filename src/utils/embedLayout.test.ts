import { describe, expect, it } from "vitest";
import {
  decodeHtmlEntities,
  isFortniteOnTopic,
  notificationHeadline,
  oneLineEmbedTitle,
} from "./embedLayout.js";

describe("embedLayout", () => {
  it("decodes HTML entities in titles", () => {
    expect(decodeHtmlEntities("PlayStation&#8217;s State of Play")).toBe(
      "PlayStation’s State of Play",
    );
  });

  it("keeps a one-line title and drops markdown body", () => {
    const raw = `**Final Fantasy Resonance: Le Dernier Aperçu**

*Date de sortie : 2024*

**Genre :** RPG`;
    const title = oneLineEmbedTitle(raw, 90);
    expect(title.length).toBeLessThanOrEqual(90);
    expect(title.toLowerCase()).toContain("final fantasy");
    expect(title).not.toContain("**");
    expect(title).not.toContain("Genre");
  });

  it("never exceeds Discord's 256-char title limit", () => {
    const headline = notificationHeadline("🐦", "A".repeat(400), "Twitter");
    expect(headline.length).toBeLessThanOrEqual(256);
  });

  it("lets official Fortnite accounts through and drops GTA-only HYPEX tweets", () => {
    expect(isFortniteOnTopic("GTA 6 MONEY LAUNDERING", "HYPEX")).toBe(false);
    expect(isFortniteOnTopic("FIRST LOOK AT TONIGHT'S ITEM SHOP", "HYPEX")).toBe(true);
    expect(isFortniteOnTopic("Random collab tweet", "FortniteGame")).toBe(true);
  });
});
