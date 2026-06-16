"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const instantgaming_news_1 = require("./instantgaming-news");
// ==================== Tests ====================
(0, vitest_1.describe)("isValidImageUrl", () => {
    (0, vitest_1.it)("accepte une URL HTTP valide", () => {
        (0, vitest_1.expect)((0, instantgaming_news_1.isValidImageUrl)("https://example.com/image.jpg")).toBe(true);
        (0, vitest_1.expect)((0, instantgaming_news_1.isValidImageUrl)("http://example.com/img.png")).toBe(true);
    });
    (0, vitest_1.it)("rejette les URLs non-HTTP", () => {
        (0, vitest_1.expect)((0, instantgaming_news_1.isValidImageUrl)("ftp://example.com/img.jpg")).toBe(false);
        (0, vitest_1.expect)((0, instantgaming_news_1.isValidImageUrl)("//example.com/img.jpg")).toBe(false);
        (0, vitest_1.expect)((0, instantgaming_news_1.isValidImageUrl)("/relative/path.jpg")).toBe(false);
    });
    (0, vitest_1.it)("rejette les valeurs non-string", () => {
        (0, vitest_1.expect)((0, instantgaming_news_1.isValidImageUrl)(null)).toBe(false);
        (0, vitest_1.expect)((0, instantgaming_news_1.isValidImageUrl)(undefined)).toBe(false);
        (0, vitest_1.expect)((0, instantgaming_news_1.isValidImageUrl)(123)).toBe(false);
        (0, vitest_1.expect)((0, instantgaming_news_1.isValidImageUrl)("")).toBe(false);
    });
});
(0, vitest_1.describe)("extractImageFromHtml", () => {
    (0, vitest_1.it)("extrait le src d'une balise img", () => {
        const html = '<p>Texte</p><img src="https://example.com/photo.jpg" alt="photo" /><p>Fin</p>';
        (0, vitest_1.expect)((0, instantgaming_news_1.extractImageFromHtml)(html)).toBe("https://example.com/photo.jpg");
    });
    (0, vitest_1.it)("extrait avec guillemets simples", () => {
        const html = "<img src='https://example.com/pic.png' />";
        (0, vitest_1.expect)((0, instantgaming_news_1.extractImageFromHtml)(html)).toBe("https://example.com/pic.png");
    });
    (0, vitest_1.it)("retourne null si pas d'image", () => {
        (0, vitest_1.expect)((0, instantgaming_news_1.extractImageFromHtml)("<p>Pas d'image</p>")).toBeNull();
    });
    (0, vitest_1.it)("extrait la première image parmi plusieurs", () => {
        const html = '<img src="https://a.com/1.jpg" /><img src="https://a.com/2.jpg" />';
        (0, vitest_1.expect)((0, instantgaming_news_1.extractImageFromHtml)(html)).toBe("https://a.com/1.jpg");
    });
});
(0, vitest_1.describe)("extractArticleImage — ordre de priorité", () => {
    (0, vitest_1.it)("1. enclosure.url (attribut @_url du parser XML)", () => {
        const item = {
            enclosure: { "@_url": "https://cdn.example.com/enclosure.jpg" },
            "content:encoded": '<img src="https://cdn.example.com/content.jpg" />',
            description: '<img src="https://cdn.example.com/desc.jpg" />',
        };
        (0, vitest_1.expect)((0, instantgaming_news_1.extractArticleImage)(item)).toBe("https://cdn.example.com/enclosure.jpg");
    });
    (0, vitest_1.it)("2. media:content (objet unique)", () => {
        const item = {
            "media:content": { "@_url": "https://cdn.example.com/media.jpg" },
            "content:encoded": '<img src="https://cdn.example.com/content.jpg" />',
        };
        (0, vitest_1.expect)((0, instantgaming_news_1.extractArticleImage)(item)).toBe("https://cdn.example.com/media.jpg");
    });
    (0, vitest_1.it)("2b. media:content (tableau)", () => {
        const item = {
            "media:content": [
                { "@_url": "https://cdn.example.com/media1.jpg" },
                { "@_url": "https://cdn.example.com/media2.jpg" },
            ],
        };
        (0, vitest_1.expect)((0, instantgaming_news_1.extractArticleImage)(item)).toBe("https://cdn.example.com/media1.jpg");
    });
    (0, vitest_1.it)("3. media:thumbnail", () => {
        const item = {
            "media:thumbnail": { "@_url": "https://cdn.example.com/thumb.jpg" },
            "content:encoded": '<img src="https://cdn.example.com/content.jpg" />',
        };
        (0, vitest_1.expect)((0, instantgaming_news_1.extractArticleImage)(item)).toBe("https://cdn.example.com/thumb.jpg");
    });
    (0, vitest_1.it)("4. content:encoded avec balise img", () => {
        const item = {
            "content:encoded": '<div><p>Article</p><img src="https://cdn.example.com/hero.jpg" alt="hero" /></div>',
        };
        (0, vitest_1.expect)((0, instantgaming_news_1.extractArticleImage)(item)).toBe("https://cdn.example.com/hero.jpg");
    });
    (0, vitest_1.it)("5. description avec balise img (fallback après content:encoded)", () => {
        const item = {
            description: '<p>Summary</p><img src="https://cdn.example.com/desc-img.jpg" />',
        };
        (0, vitest_1.expect)((0, instantgaming_news_1.extractArticleImage)(item)).toBe("https://cdn.example.com/desc-img.jpg");
    });
    (0, vitest_1.it)("6. retourne null si aucune source trouvée", () => {
        const item = {
            title: "Article sans image",
            description: "<p>Juste du texte</p>",
        };
        (0, vitest_1.expect)((0, instantgaming_news_1.extractArticleImage)(item)).toBeNull();
    });
    (0, vitest_1.it)("ignoré les URLs non valides dans les champs", () => {
        const item = {
            enclosure: { "@_url": "" },
            "media:content": { "@_url": "ftp://invalid.protocol/img.jpg" },
            "content:encoded": '<img src="/relative/not-absolute.jpg" />',
        };
        (0, vitest_1.expect)((0, instantgaming_news_1.extractArticleImage)(item)).toBeNull();
    });
    (0, vitest_1.it)("gère un item vide sans erreur", () => {
        (0, vitest_1.expect)((0, instantgaming_news_1.extractArticleImage)({})).toBeNull();
    });
});
//# sourceMappingURL=instantgaming-news.test.js.map