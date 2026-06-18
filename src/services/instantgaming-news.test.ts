import { describe, it, expect, vi } from "vitest";
import {
  extractArticleImage,
  extractImageFromHtml,
  isValidImageUrl,
} from "./instantgaming-news.js";

// ==================== Tests ====================

describe("isValidImageUrl", () => {
  it("accepte une URL HTTP valide", () => {
    expect(isValidImageUrl("https://example.com/image.jpg")).toBe(true);
    expect(isValidImageUrl("http://example.com/img.png")).toBe(true);
  });

  it("rejette les URLs non-HTTP", () => {
    expect(isValidImageUrl("ftp://example.com/img.jpg")).toBe(false);
    expect(isValidImageUrl("//example.com/img.jpg")).toBe(false);
    expect(isValidImageUrl("/relative/path.jpg")).toBe(false);
  });

  it("rejette les valeurs non-string", () => {
    expect(isValidImageUrl(null)).toBe(false);
    expect(isValidImageUrl(undefined)).toBe(false);
    expect(isValidImageUrl(123)).toBe(false);
    expect(isValidImageUrl("")).toBe(false);
  });
});

describe("extractImageFromHtml", () => {
  it("extrait le src d'une balise img", () => {
    const html = '<p>Texte</p><img src="https://example.com/photo.jpg" alt="photo" /><p>Fin</p>';
    expect(extractImageFromHtml(html)).toBe("https://example.com/photo.jpg");
  });

  it("extrait avec guillemets simples", () => {
    const html = "<img src='https://example.com/pic.png' />";
    expect(extractImageFromHtml(html)).toBe("https://example.com/pic.png");
  });

  it("retourne null si pas d'image", () => {
    expect(extractImageFromHtml("<p>Pas d'image</p>")).toBeNull();
  });

  it("extrait la première image parmi plusieurs", () => {
    const html =
      '<img src="https://a.com/1.jpg" /><img src="https://a.com/2.jpg" />';
    expect(extractImageFromHtml(html)).toBe("https://a.com/1.jpg");
  });
});

describe("extractArticleImage — ordre de priorité", () => {
  it("1. enclosure.url (attribut @_url du parser XML)", () => {
    const item = {
      enclosure: { "@_url": "https://cdn.example.com/enclosure.jpg" },
      "content:encoded": '<img src="https://cdn.example.com/content.jpg" />',
      description: '<img src="https://cdn.example.com/desc.jpg" />',
    };
    expect(extractArticleImage(item)).toBe("https://cdn.example.com/enclosure.jpg");
  });

  it("2. media:content (objet unique)", () => {
    const item = {
      "media:content": { "@_url": "https://cdn.example.com/media.jpg" },
      "content:encoded": '<img src="https://cdn.example.com/content.jpg" />',
    };
    expect(extractArticleImage(item)).toBe("https://cdn.example.com/media.jpg");
  });

  it("2b. media:content (tableau)", () => {
    const item = {
      "media:content": [
        { "@_url": "https://cdn.example.com/media1.jpg" },
        { "@_url": "https://cdn.example.com/media2.jpg" },
      ],
    };
    expect(extractArticleImage(item)).toBe("https://cdn.example.com/media1.jpg");
  });

  it("3. media:thumbnail", () => {
    const item = {
      "media:thumbnail": { "@_url": "https://cdn.example.com/thumb.jpg" },
      "content:encoded": '<img src="https://cdn.example.com/content.jpg" />',
    };
    expect(extractArticleImage(item)).toBe("https://cdn.example.com/thumb.jpg");
  });

  it("4. content:encoded avec balise img", () => {
    const item = {
      "content:encoded":
        '<div><p>Article</p><img src="https://cdn.example.com/hero.jpg" alt="hero" /></div>',
    };
    expect(extractArticleImage(item)).toBe("https://cdn.example.com/hero.jpg");
  });

  it("5. description avec balise img (fallback après content:encoded)", () => {
    const item = {
      description: '<p>Summary</p><img src="https://cdn.example.com/desc-img.jpg" />',
    };
    expect(extractArticleImage(item)).toBe("https://cdn.example.com/desc-img.jpg");
  });

  it("6. retourne null si aucune source trouvée", () => {
    const item = {
      title: "Article sans image",
      description: "<p>Juste du texte</p>",
    };
    expect(extractArticleImage(item)).toBeNull();
  });

  it("ignoré les URLs non valides dans les champs", () => {
    const item = {
      enclosure: { "@_url": "" },
      "media:content": { "@_url": "ftp://invalid.protocol/img.jpg" },
      "content:encoded": '<img src="/relative/not-absolute.jpg" />',
    };
    expect(extractArticleImage(item)).toBeNull();
  });

  it("gère un item vide sans erreur", () => {
    expect(extractArticleImage({})).toBeNull();
  });
});
