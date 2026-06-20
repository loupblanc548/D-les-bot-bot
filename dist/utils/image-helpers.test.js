import { describe, it, expect, vi, beforeEach } from "vitest";
import { XMLParser } from "fast-xml-parser";
import { extractMediaThumbnail, getYouTubeThumbnail, getBlogImage, getOgImage, getTweetImage } from "./image-helpers.js";
import { parseRssItems } from "../services/feeds.js";
// ============================================================
// extractMediaThumbnail — Tests unitaires (objets JS pré-construits)
// ============================================================
describe("extractMediaThumbnail", () => {
    it("extrait <media:thumbnail> au format RSS simple", () => {
        const item = {
            title: "Ma vidéo",
            "media:thumbnail": {
                "@_url": "https://i.ytimg.com/vi/abc123/default.jpg",
                "@_width": "120",
                "@_height": "90",
            },
        };
        expect(extractMediaThumbnail(item)).toBe("https://i.ytimg.com/vi/abc123/default.jpg");
    });
    it("extrait <media:group><media:thumbnail> au format Atom YouTube", () => {
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
        expect(extractMediaThumbnail(item)).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
    });
    it("retourne la dernière miniature (maxresdefault) quand plusieurs existent", () => {
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
        expect(extractMediaThumbnail(item)).toBe("https://i.ytimg.com/vi/xyz789/maxresdefault.jpg");
    });
    it("retourne undefined si aucun media:thumbnail ni media:group", () => {
        const item = { title: "Un post sans image", link: "https://example.com/post" };
        expect(extractMediaThumbnail(item)).toBeUndefined();
    });
    it("retourne undefined pour un objet vide", () => {
        expect(extractMediaThumbnail({})).toBeUndefined();
    });
    it("retourne undefined si media:group existe mais sans media:thumbnail", () => {
        const item = { "media:group": { "media:title": "Titre", "media:description": "Desc" } };
        expect(extractMediaThumbnail(item)).toBeUndefined();
    });
    it("retourne undefined si media:thumbnail existe mais sans url", () => {
        const item = { "media:thumbnail": { "@_width": "120", "@_height": "90" } };
        expect(extractMediaThumbnail(item)).toBeUndefined();
    });
    it("priorise <media:thumbnail> direct sur <media:group>", () => {
        const item = {
            "media:thumbnail": { "@_url": "https://i.ytimg.com/vi/direct.jpg" },
            "media:group": { "media:thumbnail": { "@_url": "https://i.ytimg.com/vi/grouped.jpg" } },
        };
        expect(extractMediaThumbnail(item)).toBe("https://i.ytimg.com/vi/direct.jpg");
    });
});
// ============================================================
// extractMediaThumbnail — Tests d'intégration avec du vrai XML
// ============================================================
// Parse du XML réel via fast-xml-parser, puis extraction de la miniature.
// Même config que feeds.ts/monitor.ts : ignoreAttributes=false, attributeNamePrefix="@_"
describe("extractMediaThumbnail (intégration XML réel)", () => {
    const xmlParser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
    });
    it("parse un flux Atom YouTube réel et extrait la miniature", () => {
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
        const thumb = extractMediaThumbnail(entry);
        expect(thumb).toBe("https://i.ytimg.com/vi/AbCdEfGhIjK/maxresdefault.jpg");
    });
    it("parse un flux RSS classique avec media:thumbnail", () => {
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
        const thumb = extractMediaThumbnail(item);
        expect(thumb).toBe("https://i.ytimg.com/vi/KlMnOpQrStU/hqdefault.jpg");
    });
    it("parse un flux Atom YouTube avec une seule miniature", () => {
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
        const thumb = extractMediaThumbnail(entry);
        expect(thumb).toBe("https://i.ytimg.com/vi/VwXyZ012345/hqdefault.jpg");
    });
    it("retourne undefined pour une entrée Atom sans média", () => {
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
        const thumb = extractMediaThumbnail(entry);
        expect(thumb).toBeUndefined();
    });
});
// ============================================================
// extractMediaThumbnail — Test d'intégration LIVE
// Récupère un vrai flux RSS YouTube, le parse, et vérifie
// que toutes les miniatures sont correctement extraites.
// ============================================================
// Si le réseau est indisponible, le test est ignoré (soft skip).
describe("extractMediaThumbnail (intégration live - flux YouTube réel)", () => {
    const xmlParser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
    });
    // Garantir que fetch est le vrai fetch (restaurer les mocks éventuels)
    beforeEach(() => {
        vi.restoreAllMocks();
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
        it(`fetch → parse → extrait les miniatures : ${label}`, async () => {
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
            expect(xml.length).toBeGreaterThan(200);
            const parsed = xmlParser.parse(xml);
            const entries = parsed.feed?.entry;
            expect(entries).toBeDefined();
            const items = Array.isArray(entries) ? entries : [entries];
            expect(items.length).toBeGreaterThan(0);
            let thumbnailsFound = 0;
            for (const item of items) {
                const thumb = extractMediaThumbnail(item);
                expect(thumb).toBeDefined();
                // YouTube sert les miniatures via i.ytimg.com ou iN.ytimg.com (CDN)
                expect(thumb).toMatch(/^https:\/\/i\d*\.ytimg\.com\/vi\/[A-Za-z0-9_-]+\/.+\.jpg$/);
                thumbnailsFound++;
            }
            expect(thumbnailsFound).toBe(items.length);
        }, 15_000);
    }
    it("vérifie que extractMediaThumbnail retourne la dernière miniature (la plus grande résolution)", async () => {
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
            const extracted = extractMediaThumbnail(item);
            if (extracted && thumbList.length > 0) {
                const lastUrl = thumbList[thumbList.length - 1]?.["@_url"];
                if (lastUrl) {
                    expect(extracted).toBe(lastUrl);
                    verified++;
                }
            }
        }
        // Au moins une entrée avec plusieurs miniatures doit être vérifiée
        expect(verified).toBeGreaterThan(0);
    }, 15_000);
});
// ============================================================
// getYouTubeThumbnail — Tests du fallback maxresdefault → hqdefault
// ============================================================
describe("getYouTubeThumbnail", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });
    it("retourne maxresdefault si la réponse HEAD est OK (200)", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
        });
        const url = "https://www.youtube.com/watch?v=test0000001";
        const result = await getYouTubeThumbnail(url);
        expect(result).toBe("https://img.youtube.com/vi/test0000001/maxresdefault.jpg");
        expect(fetch).toHaveBeenCalledWith("https://img.youtube.com/vi/test0000001/maxresdefault.jpg", expect.objectContaining({ method: "HEAD" }));
    });
    it("fallback hqdefault si maxresdefault renvoie 404", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: false,
            status: 404,
        });
        const url = "https://www.youtube.com/watch?v=test0000002";
        const result = await getYouTubeThumbnail(url);
        expect(result).toBe("https://img.youtube.com/vi/test0000002/hqdefault.jpg");
    });
    it("fallback hqdefault si le fetch de maxresdefault lève une erreur réseau", async () => {
        vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));
        const url = "https://www.youtube.com/watch?v=test0000003";
        const result = await getYouTubeThumbnail(url);
        expect(result).toBe("https://img.youtube.com/vi/test0000003/hqdefault.jpg");
    });
    it("retourne null si l'URL ne correspond pas au format YouTube", async () => {
        const spy = vi.spyOn(globalThis, "fetch");
        const url = "https://example.com/some-random-page";
        const result = await getYouTubeThumbnail(url);
        expect(result).toBeNull();
        expect(spy).not.toHaveBeenCalled();
    });
    it("supporte les URLs courtes youtu.be", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
        });
        const url = "https://youtu.be/shrt0000001";
        const result = await getYouTubeThumbnail(url);
        expect(result).toBe("https://img.youtube.com/vi/shrt0000001/maxresdefault.jpg");
    });
});
// ============================================================
// getBlogImage — Tests du scraping og:image et fallback <img>
// ============================================================
describe("getBlogImage", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });
    it("extrait og:image depuis une page HTML avec meta property og:image", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            text: async () => `<html><head><meta property="og:image" content="https://example.com/hero.jpg"></head><body></body></html>`,
        });
        const url = "https://example.com/article";
        const result = await getBlogImage(url);
        expect(result).toBe("https://example.com/hero.jpg");
    });
    it("extrait og:image avec lordre content puis property inverse", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            text: async () => `<html><head><meta content="https://example.com/hero2.png" property="og:image"></head><body></body></html>`,
        });
        const url = "https://example.com/article2";
        const result = await getBlogImage(url);
        expect(result).toBe("https://example.com/hero2.png");
    });
    it("fallback <img> quand aucun og:image nest present", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            text: async () => `<html><body><img src="https://example.com/content-image.jpg"></body></html>`,
        });
        const url = "https://example.com/no-og";
        const result = await getBlogImage(url);
        expect(result).toBe("https://example.com/content-image.jpg");
    });
    it("ignore les data:image, avatars, icones et pixels dans le fallback img", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            text: async () => `<html><body><img src="data:image/png;base64,abc123"><img src="https://example.com/avatar/user.png"><img src="https://example.com/pixel.gif"><img src="https://example.com/1x1.png"><img src="https://example.com/real-photo.webp"></body></html>`,
        });
        const url = "https://example.com/filtered";
        const result = await getBlogImage(url);
        expect(result).toBe("https://example.com/real-photo.webp");
    });
    it("resout les URLs relatives dimage par rapport a lURL de la page", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            text: async () => `<html><body><img src="/images/relative.jpg"></body></html>`,
        });
        const url = "https://example.com/blog/post";
        const result = await getBlogImage(url);
        expect(result).toBe("https://example.com/images/relative.jpg");
    });
    it("retourne null si la reponse fetch nest pas ok", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: false,
            status: 404,
        });
        const url = "https://example.com/not-found";
        const result = await getBlogImage(url);
        expect(result).toBeNull();
    });
    it("retourne null si le fetch leve une erreur reseau", async () => {
        vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));
        const url = "https://example.com/offline";
        const result = await getBlogImage(url);
        expect(result).toBeNull();
    });
    it("retourne null si la page na ni og:image ni <img> valide", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            text: async () => `<html><body><p>Pas dimage ici</p></body></html>`,
        });
        const url = "https://example.com/text-only";
        const result = await getBlogImage(url);
        expect(result).toBeNull();
    });
});
// ============================================================
// Integration — Pipeline complet : flux YouTube reel → parseRssItems → extractMediaThumbnail → getYouTubeThumbnail
// ============================================================
// Test qui verifie lensemble de la chaine dextraction sur un vrai flux RSS YouTube.
// Soft-skip si le reseau est indisponible.
describe("Pipeline complet flux YouTube (integration live)", () => {
    const LIVE_CHANNEL = "UCsLiV4WJfkTEHH0b9PmRklw"; // Fortnite — chaine stable
    const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${LIVE_CHANNEL}`;
    it("fetch un vrai flux → parseRssItems → extractMediaThumbnail integre → getYouTubeThumbnail sur la 1ere video", async () => {
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
        expect(xml.length).toBeGreaterThan(200);
        // Etape 1 : parseRssItems (parse XML + extractMediaThumbnail interne)
        const items = parseRssItems(xml);
        expect(items.length).toBeGreaterThan(0);
        for (const item of items) {
            expect(item.title).toBeTruthy();
            expect(item.url).toBeTruthy();
            // La miniature peut etre extraite par extractMediaThumbnail (integre dans parseRssItems)
            // mais ce n'est pas garanti pour tous les items
            if (item.thumbnail) {
                expect(item.thumbnail).toMatch(/^https:\/\/i\d*\.ytimg\.com\/vi\/[A-Za-z0-9_-]+\/.+\.jpg$/);
            }
        }
        // Etape 2 : getYouTubeThumbnail sur la 1ere video
        const firstVideo = items[0];
        const ytThumb = await getYouTubeThumbnail(firstVideo.url);
        expect(ytThumb).toBeTruthy();
        expect(ytThumb).toMatch(/^https:\/\/img\.youtube\.com\/vi\/[A-Za-z0-9_-]+\/(maxresdefault|hqdefault)\.jpg$/);
    }, 20_000);
});
// ============================================================
// getOgImage — Tests du scraping og:image (pas de fallback img)
// ============================================================
describe("getOgImage", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });
    it("extrait og:image depuis une page HTML avec meta property og:image", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            text: async () => `<html><head><meta property="og:image" content="https://example.com/hero.jpg"></head><body></body></html>`,
        });
        const result = await getOgImage("https://example.com/article");
        expect(result).toBe("https://example.com/hero.jpg");
    });
    it("extrait og:image avec lordre content puis property inverse", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            text: async () => `<html><head><meta content="https://example.com/hero2.png" property="og:image"></head><body></body></html>`,
        });
        const result = await getOgImage("https://example.com/article2");
        expect(result).toBe("https://example.com/hero2.png");
    });
    it("retourne null si aucun og:image dans la page", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            text: async () => `<html><head><meta property="og:title" content="Un article"></head><body></body></html>`,
        });
        const result = await getOgImage("https://example.com/no-og");
        expect(result).toBeNull();
    });
    it("retourne null si la reponse fetch nest pas ok", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: false,
            status: 404,
        });
        const result = await getOgImage("https://example.com/not-found");
        expect(result).toBeNull();
    });
    it("retourne null si le fetch leve une erreur reseau", async () => {
        vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));
        const result = await getOgImage("https://example.com/offline");
        expect(result).toBeNull();
    });
});
// ============================================================
// getTweetImage — Tests du scraping dimages de tweets (pbs.twimg.com)
// ============================================================
describe("getTweetImage", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });
    it("extrait une image pbs.twimg.com depuis le HTML", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            text: async () => `<html><body><img src="https://pbs.twimg.com/media/AbCdEfGhIjk.jpg"></body></html>`,
        });
        const result = await getTweetImage("https://xcancel.com/user/status/123");
        expect(result).toBe("https://pbs.twimg.com/media/AbCdEfGhIjk.jpg");
    });
    it("extrait la premiere image quand plusieurs pbs.twimg.com sont presentes", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            text: async () => `<html><body><img src="https://pbs.twimg.com/media/first.jpg"><img src="https://pbs.twimg.com/media/second.jpg"></body></html>`,
        });
        const result = await getTweetImage("https://xcancel.com/user/status/456");
        expect(result).toBe("https://pbs.twimg.com/media/first.jpg");
    });
    it("fallback video.twimg.com si aucune image pbs.twimg.com", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            text: async () => `<html><body><img src="https://video.twimg.com/tweet_video/thumb.jpg"></body></html>`,
        });
        const result = await getTweetImage("https://xcancel.com/user/status/789");
        expect(result).toBe("https://video.twimg.com/tweet_video/thumb.jpg");
    });
    it("priorise pbs.twimg.com sur video.twimg.com quand les deux sont presents", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            text: async () => `<html><body><img src="https://video.twimg.com/thumb.jpg"><img src="https://pbs.twimg.com/media/real.jpg"></body></html>`,
        });
        const result = await getTweetImage("https://xcancel.com/user/status/101");
        expect(result).toBe("https://pbs.twimg.com/media/real.jpg");
    });
    it("retourne null si aucune image twimg.com dans la page", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            text: async () => `<html><body><img src="https://example.com/photo.jpg"></body></html>`,
        });
        const result = await getTweetImage("https://xcancel.com/user/status/noimg");
        expect(result).toBeNull();
    });
    it("retourne null si la reponse fetch nest pas ok", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: false,
            status: 404,
        });
        const result = await getTweetImage("https://xcancel.com/user/status/deleted");
        expect(result).toBeNull();
    });
    it("retourne null si le fetch leve une erreur reseau", async () => {
        vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));
        const result = await getTweetImage("https://xcancel.com/user/status/offline");
        expect(result).toBeNull();
    });
});
// ============================================================
// Integration — Pipeline complet : flux Twitter reel → parseRssItems → getTweetImage
// ============================================================
// Test qui verifie la chaine dextraction sur un vrai flux RSS xcancel.com.
// Soft-skip si le reseau est indisponible ou si le bot nest pas whiteliste.
describe("Pipeline complet flux Twitter (integration live)", () => {
    const TWITTER_HANDLE = "discord"; // Compte stable et public
    const FEED_URL = `https://xcancel.com/${TWITTER_HANDLE}/rss`;
    it("fetch un vrai flux Twitter → parseRssItems → getTweetImage sur le 1er tweet", async () => {
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
        expect(xml.length).toBeGreaterThan(50);
        // Whitelist non activee → skip silencieux
        if (xml.includes("RSS reader not yet whitelisted")) {
            return;
        }
        // Etape 1 : parseRssItems (parse XML, extrait title/url)
        const items = parseRssItems(xml);
        expect(items.length).toBeGreaterThan(0);
        for (const item of items) {
            expect(item.title).toBeTruthy();
            expect(item.url).toBeTruthy();
        }
        // Etape 2 : getTweetImage sur le 1er tweet pour extraire une image
        const firstTweet = items[0];
        const tweetImg = await getTweetImage(firstTweet.url);
        // Peut etre null si le tweet na pas dimage, ou une URL twimg
        if (tweetImg) {
            expect(tweetImg).toMatch(/pbs\.twimg\.com|video\.twimg\.com/);
        }
    }, 20_000);
});
//# sourceMappingURL=image-helpers.test.js.map