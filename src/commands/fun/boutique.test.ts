import { describe, expect, it, vi } from "vitest";

vi.mock("../../utils/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../../config.js", () => ({ config: { boutiqueChannel: "" } }));

import {
  buildBoutiqueComponents,
  buildBoutiqueEmbeds,
  buildBoutiquePayload,
  formatShopDate,
  formatVbucks,
  uniqueBoutiqueItems,
  type BoutiqueData,
  type BoutiqueItem,
} from "./boutique.js";

function item(over: Partial<BoutiqueItem> = {}): BoutiqueItem {
  return {
    name: "Peely",
    description: "",
    type: "Tenue",
    rarity: "Épique",
    price: 1200,
    icon: "https://example.com/icon.png",
    featuredImage: "https://example.com/featured.png",
    sectionId: "featured",
    sectionName: "En vedette",
    isNew: false,
    expiry: null,
    isBundle: false,
    bundleNames: [],
    ...over,
  };
}

function sampleShop(): BoutiqueData {
  const soon = new Date(Date.now() + 6 * 60 * 60 * 1000);
  return {
    date: "2026-09-03",
    shopImage: "https://example.com/shop.png",
    nextReset: soon,
    items: [
      item({ name: "Peely", isNew: true, price: 1500 }),
      item({ name: "Peely", isNew: true, price: 1500 }),
      item({
        name: "Renegade",
        type: "Pioche",
        rarity: "Rare",
        price: 800,
        sectionId: "daily",
        sectionName: "Quotidien",
      }),
      item({
        name: "Pack Crew",
        isBundle: true,
        isNew: true,
        price: 0,
        expiry: soon,
        sectionId: "specialoffers",
        sectionName: "Offres",
      }),
    ],
  };
}

describe("boutique layout", () => {
  it("formats the shop date in French without the ISO string", () => {
    const label = formatShopDate("2026-09-03");
    expect(label).toMatch(/septembre/i);
    expect(label).toContain("2026");
    expect(label).not.toContain("2026-09-03");
    expect(label.charAt(0)).toBe(label.charAt(0).toUpperCase());
  });

  it("formats V-Bucks with a thousands separator", () => {
    expect(formatVbucks(0)).toBe("Gratuit");
    expect(formatVbucks(1200)).toBe("1 200 VB");
    expect(formatVbucks(1500)).toBe("1 500 VB");
  });

  it("dedupes items by name", () => {
    expect(uniqueBoutiqueItems([item(), item(), item({ name: "Renegade" })])).toHaveLength(2);
  });

  it("builds a hero embed without numbered lists or a random shop screenshot", () => {
    const [hero, news, leaving] = buildBoutiqueEmbeds(sampleShop());
    const heroJson = hero.toJSON();
    const newsJson = news.toJSON();
    const leavingJson = leaving.toJSON();

    expect(heroJson.title).toMatch(/septembre/i);
    expect(heroJson.title).not.toContain("2026-09-03");
    expect(heroJson.description).not.toMatch(/\*\*1\.\*\*/);
    expect(heroJson.footer?.text).not.toMatch(/fortnite-api/i);
    expect(heroJson.image).toBeUndefined();
    expect(heroJson.thumbnail?.url).toBe("https://example.com/icon.png");
    expect(heroJson.fields?.map((f) => f.name)).toEqual(
      expect.arrayContaining(["Articles", "Nouveautés", "Reset", "Rayons"]),
    );

    expect(newsJson.title).toBe("🆕 Nouveautés");
    expect(newsJson.description).not.toMatch(/\*\*\d+\.\*\*/);
    expect(newsJson.fields?.some((f) => f.name.includes("Peely"))).toBe(true);
    expect(
      newsJson.fields?.some((f) => f.value.includes("VB") || f.value.includes("Gratuit")),
    ).toBe(true);

    expect(leavingJson.title).toBe("⏰ Bientôt retirés");
    expect(leavingJson.description).not.toMatch(/\*\*\d+\.\*\*/);
  });

  it("adds shop buttons without a duplicate title line", async () => {
    const payload = await buildBoutiquePayload(sampleShop());
    expect(payload.embeds[0].toJSON().image).toBeUndefined();
    expect(payload.files).toBeUndefined();
    expect(payload.components).toHaveLength(1);

    const row = buildBoutiqueComponents().toJSON();
    const labels = (row.components ?? []).map((c) => ("label" in c ? c.label : ""));
    expect(labels).toEqual(["Boutique officielle", "Voir en images"]);
  });
});
