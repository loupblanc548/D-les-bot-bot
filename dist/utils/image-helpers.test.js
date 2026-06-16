"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fast_xml_parser_1 = require("fast-xml-parser");
const image_helpers_1 = require("./image-helpers");
const feeds_1 = require("../services/feeds");
// ============================================================
// extractMediaThumbnail — Tests unitaires (objets JS pré-construits)
// ============================================================
(0, vitest_1.describe)("extractMediaThumbnail", () => {
    (0, vitest_1.it)("extrait <media:thumbnail> au format RSS simple", () => {
        const item = {
            title: "Ma vidéo",
            "media:thumbnail": {
                "@_url": "https://i.ytimg.com/vi/abc123/default.jpg",
                "@_width": "120",
                "@_height": "90",
            },
        };
        (0, vitest_1.expect)((0, image_helpers_1.extractMediaThumbnail)(item)).toBe("https://i.ytimg.com/vi/abc123/default.jpg");
    });
    (0, vitest_1.it)("extrait <media:group><media:thumbnail> au format Atom YouTube", () => {
        const item = {
            title: "Xbox Game Pass — June 2025 Update",
            link: [{ "@_href": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }],
            "media:group": {
                "media:thumbnail": {
                    "@_url": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
                    "@_width": "480",
                    "@_height": "360",
                },
            },
        };
        (0, vitest_1.expect)((0, image_helpers_1.extractMediaThumbnail)(item)).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
    });
    (0, vitest_1.it)("retourne la dernière miniature (maxresdefault) quand plusieurs existent", () => {
        const item = {
            title: "Nouveauté Fortnite",
            "media:group": {
                "media:thumbnail": [
                    { "@_url": "https://i.ytimg.com/vi/xyz789/default.jpg", "@_width": "120", "@_height": "90" },
                    { "@_url": "https://i.ytimg.com/vi/xyz789/mqdefault.jpg", "@_width": "320", "@_height": "180" },
                    { "@_url": "https://i.ytimg.com/vi/xyz789/hqdefault.jpg", "@_width": "480", "@_height": "360" },
                    { "@_url": "https://i.ytimg.com/vi/xyz789/sddefault.jpg", "@_width": "640", "@_height": "480" },
                    { "@_url": "https://i.ytimg.com/vi/xyz789/maxresdefault.jpg", "@_width": "1280", "@_height": "720" },
                ],
            },
        };
        (0, vitest_1.expect)((0, image_helpers_1.extractMediaThumbnail)(item)).toBe("https://i.ytimg.com/vi/xyz789/maxresdefault.jpg");
    });
    (0, vitest_1.it)("retourne undefined si aucun media:thumbnail ni media:group", () => {
        const item = { title: "Un post sans image", link: "https://example.com/post" };
        (0, vitest_1.expect)((0, image_helpers_1.extractMediaThumbnail)(item)).toBeUndefined();
    });
    (0, vitest_1.it)("retourne undefined pour un objet vide", () => {
        (0, vitest_1.expect)((0, image_helpers_1.extractMediaThumbnail)({})).toBeUndefined();
    });
    (0, vitest_1.it)("retourne undefined si media:group existe mais sans media:thumbnail", () => {
        const item = { "media:group": { "media:title": "Titre", "media:description": "Desc" } };
        (0, vitest_1.expect)((0, image_helpers_1.extractMediaThumbnail)(item)).toBeUndefined();
    });
    (0, vitest_1.it)("retourne undefined si media:thumbnail existe mais sans url", () => {
        const item = { "media:thumbnail": { "@_width": "120", "@_height": "90" } };
        (0, vitest_1.expect)((0, image_helpers_1.extractMediaThumbnail)(item)).toBeUndefined();
    });
    (0, vitest_1.it)("priorise <media:thumbnail> direct sur <media:group>", () => {
        const item = {
            "media:thumbnail": { "@_url": "https://i.ytimg.com/vi/direct.jpg" },
            "media:group": { "media:thumbnail": { "@_url": "https://i.ytimg.com/vi/grouped.jpg" } },
        };
        (0, vitest_1.expect)((0, image_helpers_1.extractMediaThumbnail)(item)).toBe("https://i.ytimg.com/vi/direct.jpg");
    });
});
// ============================================================
// extractMediaThumbnail — Tests d'intégration avec du vrai XML
// ============================================================
// Parse du XML réel via fast-xml-parser, puis extraction de la miniature.
// Même config que feeds.ts/monitor.ts : ignoreAttributes=false, attributeNamePrefix="@_"
(0, vitest_1.describe)("extractMediaThumbnail (intégration XML réel)", () => {
    const xmlParser = new fast_xml_parser_1.XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
    });
    (0, vitest_1.it)("parse un flux Atom YouTube réel et extrait la miniature", () => {
        // Extrait réel d'un flux YouTube Atom (channel_id=...)
        const atomXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <entry>
    <title>Xbox Games Showcase 2025 — Récap</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=AbCdEfGhIjK"/>
    <media:group>
      <media:thumbnail url="https://i.ytimg.com/vi/AbCdEfGhIjK/default.jpg" width="120" height="90"/>
      <media:thumbnail url="https://i.ytimg.com/vi/AbCdEfGhIjK/mqdefault.jpg" width="320" height="180"/>
      <media:thumbnail url="https://i.ytimg.com/vi/AbCdEfGhIjK/hqdefault.jpg" width="480" height="360"/>
      <media:thumbnail url="https://i.ytimg.com/vi/AbCdEfGhIjK/sddefault.jpg" width="640" height="480"/>
      <media:thumbnail url="https://i.ytimg.com/vi/AbCdEfGhIjK/maxresdefault.jpg" width="1280" height="720"/>
    </media:group>
  </entry>
</feed>`;
        const parsed = xmlParser.parse(atomXml);
        const entry = parsed.feed.entry;
        const thumb = (0, image_helpers_1.extractMediaThumbnail)(entry);
        (0, vitest_1.expect)(thumb).toBe("https://i.ytimg.com/vi/AbCdEfGhIjK/maxresdefault.jpg");
    });
    (0, vitest_1.it)("parse un flux RSS classique avec media:thumbnail", () => {
        // Flux RSS standard (certains fournisseurs utilisent ce format)
        const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <item>
      <title>Nouvelle vidéo de test</title>
      <link>https://www.youtube.com/watch?v=KlMnOpQrStU</link>
      <media:thumbnail url="https://i.ytimg.com/vi/KlMnOpQrStU/hqdefault.jpg" width="480" height="360"/>
    </item>
  </channel>
</rss>`;
        const parsed = xmlParser.parse(rssXml);
        const item = parsed.rss.channel.item;
        const thumb = (0, image_helpers_1.extractMediaThumbnail)(item);
        (0, vitest_1.expect)(thumb).toBe("https://i.ytimg.com/vi/KlMnOpQrStU/hqdefault.jpg");
    });
    (0, vitest_1.it)("parse un flux Atom YouTube avec une seule miniature", () => {
        // Certaines entrées Atom n'ont qu'une seule miniature (vieilles vidéos)
        const singleThumbXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <entry>
    <title>Ancienne vidéo</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=VwXyZ012345"/>
    <media:group>
      <media:thumbnail url="https://i.ytimg.com/vi/VwXyZ012345/hqdefault.jpg" width="480" height="360"/>
    </media:group>
  </entry>
</feed>`;
        const parsed = xmlParser.parse(singleThumbXml);
        const entry = parsed.feed.entry;
        const thumb = (0, image_helpers_1.extractMediaThumbnail)(entry);
        (0, vitest_1.expect)(thumb).toBe("https://i.ytimg.com/vi/VwXyZ012345/hqdefault.jpg");
    });
    (0, vitest_1.it)("retourne undefined pour une entrée Atom sans média", () => {
        const noMediaXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Post sans image</title>
    <link rel="alternate" href="https://example.com/post"/>
    <content>Du texte uniquement</content>
  </entry>
</feed>`;
        const parsed = xmlParser.parse(noMediaXml);
        const entry = parsed.feed.entry;
        const thumb = (0, image_helpers_1.extractMediaThumbnail)(entry);
        (0, vitest_1.expect)(thumb).toBeUndefined();
    });
});
// ============================================================
// extractMediaThumbnail — Test d'intégration LIVE
// Récupère un vrai flux RSS YouTube, le parse, et vérifie
// que toutes les miniatures sont correctement extraites.
// ============================================================
// Si le réseau est indisponible, le test est ignoré (soft skip).
(0, vitest_1.describe)("extractMediaThumbnail (intégration live - flux YouTube réel)", () => {
    const xmlParser = new fast_xml_parser_1.XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
    });
    // Garantir que fetch est le vrai fetch (restaurer les mocks éventuels)
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.restoreAllMocks();
    });
    // Chaînes YouTube stables et connues, testées en parallèle
    const LIVE_FEEDS = [
        {
            label: "channel_id (Fortnite)",
            url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCsLiV4WJfkTEHH0b9PmRklw",
        },
        {
            label: "channel_id (Google Developers)",
            url: "https://www.youtube.com/feeds/videos.xml?channel_id=UC_x5XG1OV2P6uZZ5FSM9Ttw",
        },
    ];
    for (const { label, url } of LIVE_FEEDS) {
        (0, vitest_1.it)(`fetch → parse → extrait les miniatures : ${label}`, async () => {
            let response;
            try {
                response = await fetch(url, {
                    signal: AbortSignal.timeout(10_000),
                });
            }
            catch {
                // Réseau indisponible → skip silencieux
                return;
            }
            if (!response.ok) {
                // Flux inaccessible (ex: 404, rate-limit) → skip silencieux
                return;
            }
            const xml = await response.text();
            (0, vitest_1.expect)(xml.length).toBeGreaterThan(200);
            const parsed = xmlParser.parse(xml);
            const entries = parsed.feed?.entry;
            (0, vitest_1.expect)(entries).toBeDefined();
            const items = Array.isArray(entries) ? entries : [entries];
            (0, vitest_1.expect)(items.length).toBeGreaterThan(0);
            let thumbnailsFound = 0;
            for (const item of items) {
                const thumb = (0, image_helpers_1.extractMediaThumbnail)(item);
                (0, vitest_1.expect)(thumb).toBeDefined();
                // YouTube sert les miniatures via i.ytimg.com ou iN.ytimg.com (CDN)
                (0, vitest_1.expect)(thumb).toMatch(/^https:\/\/i\d*\.ytimg\.com\/vi\/[A-Za-z0-9_-]+\/.+\.jpg$/);
                thumbnailsFound++;
            }
            (0, vitest_1.expect)(thumbnailsFound).toBe(items.length);
        }, 15_000);
    }
    (0, vitest_1.it)("vérifie que extractMediaThumbnail retourne la dernière miniature (la plus grande résolution)", async () => {
        const url = "https://www.youtube.com/feeds/videos.xml?channel_id=UCsLiV4WJfkTEHH0b9PmRklw";
        let response;
        try {
            response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        }
        catch {
            return;
        }
        if (!response.ok)
            return;
        const xml = await response.text();
        const parsed = xmlParser.parse(xml);
        const entries = parsed.feed?.entry;
        if (!entries)
            return;
        const items = Array.isArray(entries) ? entries : [entries];
        let verified = 0;
        for (const item of items) {
            const mediaGroup = item["media:group"];
            if (!mediaGroup)
                continue;
            const thumbs = mediaGroup["media:thumbnail"];
            if (!thumbs)
                continue;
            const thumbList = Array.isArray(thumbs) ? thumbs : [thumbs];
            // extractMediaThumbnail doit toujours matcher la dernière miniature du groupe
            const extracted = (0, image_helpers_1.extractMediaThumbnail)(item);
            if (extracted && thumbList.length > 0) {
                const lastUrl = thumbList[thumbList.length - 1]?.["@_url"];
                if (lastUrl) {
                    (0, vitest_1.expect)(extracted).toBe(lastUrl);
                    verified++;
                }
            }
        }
        // Au moins une entrée avec plusieurs miniatures doit être vérifiée
        (0, vitest_1.expect)(verified).toBeGreaterThan(0);
    }, 15_000);
});
// ============================================================
// getYouTubeThumbnail — Tests du fallback maxresdefault → hqdefault
// ============================================================
(0, vitest_1.describe)("getYouTubeThumbnail", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.restoreAllMocks();
    });
    (0, vitest_1.it)("retourne maxresdefault si la réponse HEAD est OK (200)", async () => {
        vitest_1.vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
        });
        const url = "https://www.youtube.com/watch?v=test0000001";
        const result = await (0, image_helpers_1.getYouTubeThumbnail)(url);
        (0, vitest_1.expect)(result).toBe("https://img.youtube.com/vi/test0000001/maxresdefault.jpg");
        (0, vitest_1.expect)(fetch).toHaveBeenCalledWith("https://img.youtube.com/vi/test0000001/maxresdefault.jpg", vitest_1.expect.objectContaining({ method: "HEAD" }));
    });
    (0, vitest_1.it)("fallback hqdefault si maxresdefault renvoie 404", async () => {
        vitest_1.vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: false,
            status: 404,
        });
        const url = "https://www.youtube.com/watch?v=test0000002";
        const result = await (0, image_helpers_1.getYouTubeThumbnail)(url);
        (0, vitest_1.expect)(result).toBe("https://img.youtube.com/vi/test0000002/hqdefault.jpg");
    });
    (0, vitest_1.it)("fallback hqdefault si le fetch de maxresdefault lève une erreur réseau", async () => {
        vitest_1.vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));
        const url = "https://www.youtube.com/watch?v=test0000003";
        const result = await (0, image_helpers_1.getYouTubeThumbnail)(url);
        (0, vitest_1.expect)(result).toBe("https://img.youtube.com/vi/test0000003/hqdefault.jpg");
    });
    (0, vitest_1.it)("retourne null si l'URL ne correspond pas au format YouTube", async () => {
        const spy = vitest_1.vi.spyOn(globalThis, "fetch");
        const url = "https://example.com/some-random-page";
        const result = await (0, image_helpers_1.getYouTubeThumbnail)(url);
        (0, vitest_1.expect)(result).toBeNull();
        (0, vitest_1.expect)(spy).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)("supporte les URLs courtes youtu.be", async () => {
        vitest_1.vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
        });
        const url = "https://youtu.be/shrt0000001";
        const result = await (0, image_helpers_1.getYouTubeThumbnail)(url);
        (0, vitest_1.expect)(result).toBe("https://img.youtube.com/vi/shrt0000001/maxresdefault.jpg");
    });
});
// ============================================================
// getBlogImage — Tests du scraping og:image et fallback <img>
// ============================================================
(0, vitest_1.describe)("getBlogImage", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.restoreAllMocks();
    });
    (0, vitest_1.it)("extrait og:image depuis une page HTML avec meta property og:image", async () => {
        vitest_1.vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            text: async () => `<html><head><meta property="og:image" content="https://example.com/hero.jpg"></head><body></body></html>`,
        });
        const url = "https://example.com/article";
        const result = await (0, image_helpers_1.getBlogImage)(url);
        (0, vitest_1.expect)(result).toBe("https://example.com/hero.jpg");
    });
    (0, vitest_1.it)("extrait og:image avec lordre content puis property inverse", async () => {
        vitest_1.vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            text: async () => `<html><head><meta content="https://example.com/hero2.png" property="og:image"></head><body></body></html>`,
        });
        const url = "https://example.com/article2";
        const result = await (0, image_helpers_1.getBlogImage)(url);
        (0, vitest_1.expect)(result).toBe("https://example.com/hero2.png");
    });
    (0, vitest_1.it)("fallback <img> quand aucun og:image nest present", async () => {
        vitest_1.vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            text: async () => `<html><body><img src="https://example.com/content-image.jpg"></body></html>`,
        });
        const url = "https://example.com/no-og";
        const result = await (0, image_helpers_1.getBlogImage)(url);
        (0, vitest_1.expect)(result).toBe("https://example.com/content-image.jpg");
    });
    (0, vitest_1.it)("ignore les data:image, avatars, icones et pixels dans le fallback img", async () => {
        vitest_1.vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            text: async () => `<html><body><img src="data:image/png;base64,abc123"><img src="https://example.com/avatar/user.png"><img src="https://example.com/pixel.gif"><img src="https://example.com/1x1.png"><img src="https://example.com/real-photo.webp"></body></html>`,
        });
        const url = "https://example.com/filtered";
        const result = await (0, image_helpers_1.getBlogImage)(url);
        (0, vitest_1.expect)(result).toBe("https://example.com/real-photo.webp");
    });
    (0, vitest_1.it)("resout les URLs relatives dimage par rapport a lURL de la page", async () => {
        vitest_1.vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            text: async () => `<html><body><img src="/images/relative.jpg"></body></html>`,
        });
        const url = "https://example.com/blog/post";
        const result = await (0, image_helpers_1.getBlogImage)(url);
        (0, vitest_1.expect)(result).toBe("https://example.com/images/relative.jpg");
    });
    (0, vitest_1.it)("retourne null si la reponse fetch nest pas ok", async () => {
        vitest_1.vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: false,
            status: 404,
        });
        const url = "https://example.com/not-found";
        const result = await (0, image_helpers_1.getBlogImage)(url);
        (0, vitest_1.expect)(result).toBeNull();
    });
    (0, vitest_1.it)("retourne null si le fetch leve une erreur reseau", async () => {
        vitest_1.vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));
        const url = "https://example.com/offline";
        const result = await (0, image_helpers_1.getBlogImage)(url);
        (0, vitest_1.expect)(result).toBeNull();
    });
    (0, vitest_1.it)("retourne null si la page na ni og:image ni <img> valide", async () => {
        vitest_1.vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            text: async () => `<html><body><p>Pas dimage ici</p></body></html>`,
        });
        const url = "https://example.com/text-only";
        const result = await (0, image_helpers_1.getBlogImage)(url);
        (0, vitest_1.expect)(result).toBeNull();
    });
});
// ============================================================
// Integration — Pipeline complet : flux YouTube reel → parseRssItems → extractMediaThumbnail → getYouTubeThumbnail
// ============================================================
// Test qui verifie lensemble de la chaine dextraction sur un vrai flux RSS YouTube.
// Soft-skip si le reseau est indisponible.
(0, vitest_1.describe)("Pipeline complet flux YouTube (integration live)", () => {
    const LIVE_CHANNEL = "UCsLiV4WJfkTEHH0b9PmRklw"; // Fortnite — chaine stable
    const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${LIVE_CHANNEL}`;
    (0, vitest_1.it)("fetch un vrai flux → parseRssItems → extractMediaThumbnail integre → getYouTubeThumbnail sur la 1ere video", async () => {
        let response;
        try {
            response = await fetch(FEED_URL, { signal: AbortSignal.timeout(10_000) });
        }
        catch {
            return; // Reseau indisponible → skip
        }
        if (!response.ok)
            return; // Flux inaccessible → skip
        const xml = await response.text();
        (0, vitest_1.expect)(xml.length).toBeGreaterThan(200);
        // Etape 1 : parseRssItems (parse XML + extractMediaThumbnail interne)
        const items = (0, feeds_1.parseRssItems)(xml);
        (0, vitest_1.expect)(items.length).toBeGreaterThan(0);
        for (const item of items) {
            (0, vitest_1.expect)(item.title).toBeTruthy();
            (0, vitest_1.expect)(item.url).toBeTruthy();
            // La miniature peut etre extraite par extractMediaThumbnail (integre dans parseRssItems)
            // mais ce n'est pas garanti pour tous les items
            if (item.thumbnail) {
                (0, vitest_1.expect)(item.thumbnail).toMatch(/^https:\/\/i\d*\.ytimg\.com\/vi\/[A-Za-z0-9_-]+\/.+\.jpg$/);
            }
        }
        // Etape 2 : getYouTubeThumbnail sur la 1ere video
        const firstVideo = items[0];
        const ytThumb = await (0, image_helpers_1.getYouTubeThumbnail)(firstVideo.url);
        (0, vitest_1.expect)(ytThumb).toBeTruthy();
        (0, vitest_1.expect)(ytThumb).toMatch(/^https:\/\/img\.youtube\.com\/vi\/[A-Za-z0-9_-]+\/(maxresdefault|hqdefault)\.jpg$/);
    }, 20_000);
});
// ============================================================
// getOgImage — Tests du scraping og:image (pas de fallback img)
// ============================================================
(0, vitest_1.describe)("getOgImage", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.restoreAllMocks();
    });
    (0, vitest_1.it)("extrait og:image depuis une page HTML avec meta property og:image", async () => {
        vitest_1.vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            text: async () => `<html><head><meta property="og:image" content="https://example.com/hero.jpg"></head><body></body></html>`,
        });
        const result = await (0, image_helpers_1.getOgImage)("https://example.com/article");
        (0, vitest_1.expect)(result).toBe("https://example.com/hero.jpg");
    });
    (0, vitest_1.it)("extrait og:image avec lordre content puis property inverse", async () => {
        vitest_1.vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            text: async () => `<html><head><meta content="https://example.com/hero2.png" property="og:image"></head><body></body></html>`,
        });
        const result = await (0, image_helpers_1.getOgImage)("https://example.com/article2");
        (0, vitest_1.expect)(result).toBe("https://example.com/hero2.png");
    });
    (0, vitest_1.it)("retourne null si aucun og:image dans la page", async () => {
        vitest_1.vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            text: async () => `<html><head><meta property="og:title" content="Un article"></head><body></body></html>`,
        });
        const result = await (0, image_helpers_1.getOgImage)("https://example.com/no-og");
        (0, vitest_1.expect)(result).toBeNull();
    });
    (0, vitest_1.it)("retourne null si la reponse fetch nest pas ok", async () => {
        vitest_1.vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: false,
            status: 404,
        });
        const result = await (0, image_helpers_1.getOgImage)("https://example.com/not-found");
        (0, vitest_1.expect)(result).toBeNull();
    });
    (0, vitest_1.it)("retourne null si le fetch leve une erreur reseau", async () => {
        vitest_1.vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));
        const result = await (0, image_helpers_1.getOgImage)("https://example.com/offline");
        (0, vitest_1.expect)(result).toBeNull();
    });
});
// ============================================================
// getTweetImage — Tests du scraping dimages de tweets (pbs.twimg.com)
// ============================================================
(0, vitest_1.describe)("getTweetImage", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.restoreAllMocks();
    });
    (0, vitest_1.it)("extrait une image pbs.twimg.com depuis le HTML", async () => {
        vitest_1.vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            text: async () => `<html><body><img src="https://pbs.twimg.com/media/AbCdEfGhIjk.jpg"></body></html>`,
        });
        const result = await (0, image_helpers_1.getTweetImage)("https://xcancel.com/user/status/123");
        (0, vitest_1.expect)(result).toBe("https://pbs.twimg.com/media/AbCdEfGhIjk.jpg");
    });
    (0, vitest_1.it)("extrait la premiere image quand plusieurs pbs.twimg.com sont presentes", async () => {
        vitest_1.vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            text: async () => `<html><body><img src="https://pbs.twimg.com/media/first.jpg"><img src="https://pbs.twimg.com/media/second.jpg"></body></html>`,
        });
        const result = await (0, image_helpers_1.getTweetImage)("https://xcancel.com/user/status/456");
        (0, vitest_1.expect)(result).toBe("https://pbs.twimg.com/media/first.jpg");
    });
    (0, vitest_1.it)("fallback video.twimg.com si aucune image pbs.twimg.com", async () => {
        vitest_1.vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            text: async () => `<html><body><img src="https://video.twimg.com/tweet_video/thumb.jpg"></body></html>`,
        });
        const result = await (0, image_helpers_1.getTweetImage)("https://xcancel.com/user/status/789");
        (0, vitest_1.expect)(result).toBe("https://video.twimg.com/tweet_video/thumb.jpg");
    });
    (0, vitest_1.it)("priorise pbs.twimg.com sur video.twimg.com quand les deux sont presents", async () => {
        vitest_1.vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            text: async () => `<html><body><img src="https://video.twimg.com/thumb.jpg"><img src="https://pbs.twimg.com/media/real.jpg"></body></html>`,
        });
        const result = await (0, image_helpers_1.getTweetImage)("https://xcancel.com/user/status/101");
        (0, vitest_1.expect)(result).toBe("https://pbs.twimg.com/media/real.jpg");
    });
    (0, vitest_1.it)("retourne null si aucune image twimg.com dans la page", async () => {
        vitest_1.vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            text: async () => `<html><body><img src="https://example.com/photo.jpg"></body></html>`,
        });
        const result = await (0, image_helpers_1.getTweetImage)("https://xcancel.com/user/status/noimg");
        (0, vitest_1.expect)(result).toBeNull();
    });
    (0, vitest_1.it)("retourne null si la reponse fetch nest pas ok", async () => {
        vitest_1.vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: false,
            status: 404,
        });
        const result = await (0, image_helpers_1.getTweetImage)("https://xcancel.com/user/status/deleted");
        (0, vitest_1.expect)(result).toBeNull();
    });
    (0, vitest_1.it)("retourne null si le fetch leve une erreur reseau", async () => {
        vitest_1.vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));
        const result = await (0, image_helpers_1.getTweetImage)("https://xcancel.com/user/status/offline");
        (0, vitest_1.expect)(result).toBeNull();
    });
});
// ============================================================
// Integration — Pipeline complet : flux Twitter reel → parseRssItems → getTweetImage
// ============================================================
// Test qui verifie la chaine dextraction sur un vrai flux RSS xcancel.com.
// Soft-skip si le reseau est indisponible ou si le bot nest pas whiteliste.
(0, vitest_1.describe)("Pipeline complet flux Twitter (integration live)", () => {
    const TWITTER_HANDLE = "discord"; // Compte stable et public
    const FEED_URL = `https://xcancel.com/${TWITTER_HANDLE}/rss`;
    (0, vitest_1.it)("fetch un vrai flux Twitter → parseRssItems → getTweetImage sur le 1er tweet", async () => {
        let response;
        try {
            response = await fetch(FEED_URL, {
                headers: { "User-Agent": "DiscordSurveillanceBot/1.0" },
                signal: AbortSignal.timeout(10_000),
            });
        }
        catch {
            return; // Reseau indisponible → skip
        }
        if (!response.ok)
            return; // Flux inaccessible → skip
        const xml = await response.text();
        (0, vitest_1.expect)(xml.length).toBeGreaterThan(50);
        // Whitelist non activee → skip silencieux
        if (xml.includes("RSS reader not yet whitelisted")) {
            return;
        }
        // Etape 1 : parseRssItems (parse XML, extrait title/url)
        const items = (0, feeds_1.parseRssItems)(xml);
        (0, vitest_1.expect)(items.length).toBeGreaterThan(0);
        for (const item of items) {
            (0, vitest_1.expect)(item.title).toBeTruthy();
            (0, vitest_1.expect)(item.url).toBeTruthy();
        }
        // Etape 2 : getTweetImage sur le 1er tweet pour extraire une image
        const firstTweet = items[0];
        const tweetImg = await (0, image_helpers_1.getTweetImage)(firstTweet.url);
        // Peut etre null si le tweet na pas dimage, ou une URL twimg
        if (tweetImg) {
            (0, vitest_1.expect)(tweetImg).toMatch(/pbs\.twimg\.com|video\.twimg\.com/);
        }
    }, 20_000);
});
//# sourceMappingURL=image-helpers.test.js.map