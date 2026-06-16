"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
// ─── Mock logger ───────────────────────────────────────────────────────────
vitest_1.vi.mock('../utils/logger', () => ({
    default: {
        error: vitest_1.vi.fn(),
        warn: vitest_1.vi.fn(),
        info: vitest_1.vi.fn(),
        debug: vitest_1.vi.fn(),
    },
}));
// ─── Imports ───────────────────────────────────────────────────────────────
const globalPatchNotesCron_1 = require("../cron/globalPatchNotesCron");
// ─── RSS 2.0 Fixtures ──────────────────────────────────────────────────────
const RSS_2_0_MULTI_ITEM = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Reddit - Patch Notes</title>
    <link>https://www.reddit.com/r/patchNotes/.rss</link>
    <description>Latest patch notes from Reddit</description>
    <item>
      <title>Patch 1.2.3 Released - Major Bug Fixes</title>
      <link>https://reddit.com/r/patchNotes/comments/abc123</link>
      <pubDate>2024-06-15T14:30:00Z</pubDate>
      <description>Fixed crash on startup, improved performance, added new features</description>
      <author>u/gamedev123</author>
      <guid isPermaLink="false">abc123</guid>
    </item>
    <item>
      <title>Hotfix 1.2.4 - Server Stability</title>
      <link>https://reddit.com/r/patchNotes/comments/def456</link>
      <pubDate>2024-06-16T10:00:00Z</pubDate>
      <description>Resolved server timeout issues affecting EU region</description>
      <author>u/serverteam</author>
      <guid isPermaLink="false">def456</guid>
    </item>
  </channel>
</rss>`;
const RSS_2_0_SINGLE_ITEM = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Single Feed</title>
    <item>
      <title>Solo Patch Note</title>
      <link>https://example.com/solo</link>
      <pubDate>2024-01-01T00:00:00Z</pubDate>
      <description>Just one item</description>
      <guid>solo-guid</guid>
    </item>
  </channel>
</rss>`;
const RSS_2_0_NO_ITEMS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Empty Feed</title>
    <link>https://example.com</link>
  </channel>
</rss>`;
const RSS_2_0_DC_CREATOR = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <item>
      <title>Dublin Core Test</title>
      <link>https://example.com/dc</link>
      <dc:creator>u/dc_author</dc:creator>
      <description>Testing dc:creator support</description>
    </item>
  </channel>
</rss>`;
const RSS_2_0_HTML_DESCRIPTION = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>HTML Description Test</title>
      <link>https://example.com/html</link>
      <description>&lt;p&gt;This is a &lt;strong&gt;bold&lt;/strong&gt; paragraph with a &lt;a href="https://link.com"&gt;link&lt;/a&gt;.&lt;/p&gt;</description>
      <guid>html-guid</guid>
    </item>
  </channel>
</rss>`;
const RSS_2_0_MINIMAL = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Minimal Item</title>
    </item>
  </channel>
</rss>`;
const RSS_2_0_GUID_FALLBACK = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>No GUID Item</title>
      <link>https://example.com/no-guid-article</link>
      <description>This item has no guid, falls back to link</description>
    </item>
  </channel>
</rss>`;
const RSS_2_0_THUMBNAIL = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Thumbnail Item</title>
      <link>https://example.com/thumb</link>
      <thumbnail>https://i.redd.it/thumbnail123.jpg</thumbnail>
      <description>Item with thumbnail</description>
    </item>
  </channel>
</rss>`;
// ─── Atom Fixtures ─────────────────────────────────────────────────────────
const ATOM_SINGLE_ENTRY = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Patch Notes Blog</title>
  <entry>
    <title>Atom Patch Note</title>
    <link href="https://blog.example.com/atom-post"/>
    <published>2024-06-15T14:30:00Z</published>
    <content>Full content of the atom entry</content>
    <author>
      <name>atom_author</name>
    </author>
    <id>atom-guid-123</id>
  </entry>
</feed>`;
const ATOM_MULTI_ENTRY = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Blog</title>
  <entry>
    <title>Entry One</title>
    <link href="https://blog.example.com/1"/>
    <published>2024-01-01T00:00:00Z</published>
    <content>First entry content</content>
    <id>entry-1</id>
  </entry>
  <entry>
    <title>Entry Two</title>
    <link href="https://blog.example.com/2"/>
    <published>2024-02-01T00:00:00Z</published>
    <content>Second entry content</content>
    <id>entry-2</id>
  </entry>
</feed>`;
// ─── Invalid XML ───────────────────────────────────────────────────────────
const INVALID_XML = 'This is not XML at all';
const MALFORMED_XML = '<rss><channel><item><title>Unclosed tag';
const TRULY_INVALID_XML = '<not><even><close>to xml';
// ═══════════════════════════════════════════════════════════════════════════════
// Suite 1: RSS 2.0 — Multi-item
// ═══════════════════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('parseRssXmlItems — RSS 2.0 Multi-item', () => {
    (0, vitest_1.it)('parse correctement 2 items RSS 2.0', () => {
        const items = (0, globalPatchNotesCron_1.parseRssXmlItems)(RSS_2_0_MULTI_ITEM);
        (0, vitest_1.expect)(items).toHaveLength(2);
        // Item 1
        (0, vitest_1.expect)(items[0].title).toBe('Patch 1.2.3 Released - Major Bug Fixes');
        (0, vitest_1.expect)(items[0].link).toBe('https://reddit.com/r/patchNotes/comments/abc123');
        (0, vitest_1.expect)(items[0].pubDate).toBe('2024-06-15T14:30:00Z');
        (0, vitest_1.expect)(items[0].content).toBe('Fixed crash on startup, improved performance, added new features');
        (0, vitest_1.expect)(items[0].author).toBe('u/gamedev123');
        (0, vitest_1.expect)(items[0].guid).toBe('abc123');
        // Item 2
        (0, vitest_1.expect)(items[1].title).toBe('Hotfix 1.2.4 - Server Stability');
        (0, vitest_1.expect)(items[1].link).toBe('https://reddit.com/r/patchNotes/comments/def456');
        (0, vitest_1.expect)(items[1].pubDate).toBe('2024-06-16T10:00:00Z');
        (0, vitest_1.expect)(items[1].author).toBe('u/serverteam');
        (0, vitest_1.expect)(items[1].guid).toBe('def456');
    });
});
// ═══════════════════════════════════════════════════════════════════════════════
// Suite 2: RSS 2.0 — Single item
// ═══════════════════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('parseRssXmlItems — RSS 2.0 Single item', () => {
    (0, vitest_1.it)('parse un flux RSS avec un seul item', () => {
        const items = (0, globalPatchNotesCron_1.parseRssXmlItems)(RSS_2_0_SINGLE_ITEM);
        (0, vitest_1.expect)(items).toHaveLength(1);
        (0, vitest_1.expect)(items[0].title).toBe('Solo Patch Note');
        (0, vitest_1.expect)(items[0].link).toBe('https://example.com/solo');
        (0, vitest_1.expect)(items[0].pubDate).toBe('2024-01-01T00:00:00Z');
        (0, vitest_1.expect)(items[0].guid).toBe('solo-guid');
    });
});
// ═══════════════════════════════════════════════════════════════════════════════
// Suite 3: RSS 2.0 — Empty feed
// ═══════════════════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('parseRssXmlItems — RSS 2.0 Empty feed', () => {
    (0, vitest_1.it)('retourne un tableau vide pour un flux sans items', () => {
        const items = (0, globalPatchNotesCron_1.parseRssXmlItems)(RSS_2_0_NO_ITEMS);
        (0, vitest_1.expect)(items).toHaveLength(0);
    });
});
// ═══════════════════════════════════════════════════════════════════════════════
// Suite 4: RSS 2.0 — dc:creator → author
// ═══════════════════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('parseRssXmlItems — dc:creator → author', () => {
    (0, vitest_1.it)('extrait dc:creator comme author (fallback Dublin Core)', () => {
        const items = (0, globalPatchNotesCron_1.parseRssXmlItems)(RSS_2_0_DC_CREATOR);
        (0, vitest_1.expect)(items).toHaveLength(1);
        (0, vitest_1.expect)(items[0].author).toBe('u/dc_author');
    });
});
// ═══════════════════════════════════════════════════════════════════════════════
// Suite 5: RSS 2.0 — HTML stripping (contentSnippet)
// ═══════════════════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('parseRssXmlItems — HTML stripping', () => {
    (0, vitest_1.it)('strips HTML tags from contentSnippet', () => {
        const items = (0, globalPatchNotesCron_1.parseRssXmlItems)(RSS_2_0_HTML_DESCRIPTION);
        (0, vitest_1.expect)(items).toHaveLength(1);
        // content garde le HTML brut
        (0, vitest_1.expect)(items[0].content).toContain('<p>');
        (0, vitest_1.expect)(items[0].content).toContain('<strong>');
        // contentSnippet est nettoyé
        (0, vitest_1.expect)(items[0].contentSnippet).not.toContain('<p>');
        (0, vitest_1.expect)(items[0].contentSnippet).not.toContain('<strong>');
        (0, vitest_1.expect)(items[0].contentSnippet).toContain('This is a bold paragraph');
    });
});
// ═══════════════════════════════════════════════════════════════════════════════
// Suite 6: RSS 2.0 — Minimal fields
// ═══════════════════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('parseRssXmlItems — Minimal fields', () => {
    (0, vitest_1.it)('gère un item avec seulement un title (tous les autres champs vides)', () => {
        const items = (0, globalPatchNotesCron_1.parseRssXmlItems)(RSS_2_0_MINIMAL);
        (0, vitest_1.expect)(items).toHaveLength(1);
        (0, vitest_1.expect)(items[0].title).toBe('Minimal Item');
        (0, vitest_1.expect)(items[0].link).toBe('');
        (0, vitest_1.expect)(items[0].pubDate).toBe('');
        (0, vitest_1.expect)(items[0].content).toBe('');
        (0, vitest_1.expect)(items[0].contentSnippet).toBe('');
        (0, vitest_1.expect)(items[0].author).toBe('');
        (0, vitest_1.expect)(items[0].guid).toBe('');
        (0, vitest_1.expect)(items[0].thumbnail).toBe('');
    });
});
// ═══════════════════════════════════════════════════════════════════════════════
// Suite 7: RSS 2.0 — guid fallback to link
// ═══════════════════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('parseRssXmlItems — guid fallback', () => {
    (0, vitest_1.it)('utilise link comme guid quand guid est absent', () => {
        const items = (0, globalPatchNotesCron_1.parseRssXmlItems)(RSS_2_0_GUID_FALLBACK);
        (0, vitest_1.expect)(items).toHaveLength(1);
        (0, vitest_1.expect)(items[0].guid).toBe('https://example.com/no-guid-article');
    });
});
// ═══════════════════════════════════════════════════════════════════════════════
// Suite 8: RSS 2.0 — Thumbnail
// ═══════════════════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('parseRssXmlItems — Thumbnail', () => {
    (0, vitest_1.it)('extrait le champ thumbnail', () => {
        const items = (0, globalPatchNotesCron_1.parseRssXmlItems)(RSS_2_0_THUMBNAIL);
        (0, vitest_1.expect)(items).toHaveLength(1);
        (0, vitest_1.expect)(items[0].thumbnail).toBe('https://i.redd.it/thumbnail123.jpg');
    });
});
// ═══════════════════════════════════════════════════════════════════════════════
// Suite 9: Atom — Single entry
// ═══════════════════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('parseRssXmlItems — Atom Single entry', () => {
    (0, vitest_1.it)('parse un flux Atom avec un seul entry', () => {
        const items = (0, globalPatchNotesCron_1.parseRssXmlItems)(ATOM_SINGLE_ENTRY);
        (0, vitest_1.expect)(items).toHaveLength(1);
        (0, vitest_1.expect)(items[0].title).toBe('Atom Patch Note');
        (0, vitest_1.expect)(items[0].link).toBe('https://blog.example.com/atom-post');
        (0, vitest_1.expect)(items[0].pubDate).toBe('2024-06-15T14:30:00Z');
        (0, vitest_1.expect)(items[0].content).toBe('Full content of the atom entry');
        (0, vitest_1.expect)(items[0].author).toBe('atom_author');
        (0, vitest_1.expect)(items[0].guid).toBe('atom-guid-123');
    });
});
// ═══════════════════════════════════════════════════════════════════════════════
// Suite 10: Atom — Multi-entry
// ═══════════════════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('parseRssXmlItems — Atom Multi-entry', () => {
    (0, vitest_1.it)('parse un flux Atom avec plusieurs entries', () => {
        const items = (0, globalPatchNotesCron_1.parseRssXmlItems)(ATOM_MULTI_ENTRY);
        (0, vitest_1.expect)(items).toHaveLength(2);
        (0, vitest_1.expect)(items[0].title).toBe('Entry One');
        (0, vitest_1.expect)(items[0].guid).toBe('entry-1');
        (0, vitest_1.expect)(items[1].title).toBe('Entry Two');
        (0, vitest_1.expect)(items[1].guid).toBe('entry-2');
    });
});
// ═══════════════════════════════════════════════════════════════════════════════
// Suite 11: Invalid / Malformed XML
// ═══════════════════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('parseRssXmlItems — Invalid XML', () => {
    (0, vitest_1.it)('retourne un tableau vide pour du texte non-XML', () => {
        const items = (0, globalPatchNotesCron_1.parseRssXmlItems)(INVALID_XML);
        (0, vitest_1.expect)(items).toHaveLength(0);
    });
    (0, vitest_1.it)('retourne un tableau vide pour du XML vraiment invalide', () => {
        const items = (0, globalPatchNotesCron_1.parseRssXmlItems)(TRULY_INVALID_XML);
        (0, vitest_1.expect)(items).toHaveLength(0);
    });
    (0, vitest_1.it)('ne crash pas sur du XML malformé (tags non fermés)', () => {
        // fast-xml-parser peut auto-fermer les tags ou rejeter
        // => le comportement exact dépend du parser
        // L'important: ne pas crasher, retourner un tableau (vide ou avec items)
        const items = (0, globalPatchNotesCron_1.parseRssXmlItems)(MALFORMED_XML);
        (0, vitest_1.expect)(Array.isArray(items)).toBe(true);
    });
    (0, vitest_1.it)("retourne un tableau vide pour une string vide", () => {
        const items = (0, globalPatchNotesCron_1.parseRssXmlItems)('');
        (0, vitest_1.expect)(items).toHaveLength(0);
    });
});
// ═══════════════════════════════════════════════════════════════════════════════
// Suite 12: content vs description (Atom vs RSS)
// ═══════════════════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('parseRssXmlItems — content vs description', () => {
    (0, vitest_1.it)("RSS 2.0: utilise description comme content", () => {
        const items = (0, globalPatchNotesCron_1.parseRssXmlItems)(RSS_2_0_SINGLE_ITEM);
        (0, vitest_1.expect)(items[0].content).toBe('Just one item');
    });
    (0, vitest_1.it)('Atom: utilise content comme content (pas de description)', () => {
        const items = (0, globalPatchNotesCron_1.parseRssXmlItems)(ATOM_SINGLE_ENTRY);
        (0, vitest_1.expect)(items[0].content).toBe('Full content of the atom entry');
    });
});
// ═══════════════════════════════════════════════════════════════════════════════
// INTEGRATION TESTS — Pipeline complet (mock tous les modules)
// À ajouter à la fin de globalPatchNotesCron.test.ts
// ═══════════════════════════════════════════════════════════════════════════════
// ─── Mocks pour les modules du pipeline (vi.hoisted obligatoire pour Vitest) ─
const mockIsNewItem = vitest_1.vi.hoisted(() => vitest_1.vi.fn());
const mockMarkAsProcessed = vitest_1.vi.hoisted(() => vitest_1.vi.fn());
const mockIsWithinTemporalBarrier = vitest_1.vi.hoisted(() => vitest_1.vi.fn());
const mockTranslateAutoToFrench = vitest_1.vi.hoisted(() => vitest_1.vi.fn());
const mockRouteArticle = vitest_1.vi.hoisted(() => vitest_1.vi.fn());
const mockScrapeRssFeed = vitest_1.vi.hoisted(() => vitest_1.vi.fn());
const mockAxiosGet = vitest_1.vi.hoisted(() => vitest_1.vi.fn());
vitest_1.vi.mock('../managers/ScraperManager', () => ({
    isNewItem: mockIsNewItem,
    markAsProcessed: mockMarkAsProcessed,
    isWithinTemporalBarrier: mockIsWithinTemporalBarrier,
    ContentType: { PATCH_NOTE: 'patch_note', FREE_GAME: 'free_game', TWEET: 'tweet', DEAL: 'deal', VIDEO: 'video', GAME_UPDATE: 'game_update', PRICE_ALERT: 'price_alert' },
}));
vitest_1.vi.mock('../utils/translator', () => ({
    translateAutoToFrench: mockTranslateAutoToFrench,
}));
vitest_1.vi.mock('../managers/ChannelRouter', () => ({
    routeArticle: mockRouteArticle,
}));
vitest_1.vi.mock('../scrapers/scraper-bridge', () => ({
    scrapeRssFeed: mockScrapeRssFeed,
}));
// Pas de logger mock — déjà fait par le fichier existant
vitest_1.vi.mock('axios', () => ({
    default: {
        get: mockAxiosGet,
        isAxiosError: vitest_1.vi.fn().mockReturnValue(false),
    },
}));
vitest_1.vi.mock('../config', () => ({
    config: {
        redditPatchNotesRss: 'https://www.reddit.com/r/patchnotes/.rss',
        rss2jsonBaseUrl: 'https://api.rss2json.com/v1/api.json',
    },
}));
// ─── Import dynamique de la fonction sous test ─────────────────────────────
const globalPatchNotesCron_2 = require("../cron/globalPatchNotesCron");
// ─── Helpers ───────────────────────────────────────────────────────────────
function createMockClient() {
    return { channels: { fetch: vitest_1.vi.fn() } };
}
const RECENT_DATE = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
/** RSS 2.0 valide avec 1 item */
const VALID_RSS_XML = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>Patch 1.0 Released</title><link>https://reddit.com/r/patchnotes/comments/abc123/patch_1_0</link><pubDate>${RECENT_DATE}</pubDate><description>Major update with bug fixes</description><author>u/dev123</author><guid isPermaLink="false">abc123</guid></item>
</channel></rss>`;
// ═══════════════════════════════════════════════════════════════════════════════
// Suite: Pipeline integration
// ═══════════════════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('checkPatchNotes — Pipeline complet (intégration mockée)', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        // Defaults: tout passe
        mockScrapeRssFeed.mockResolvedValue({ raw: VALID_RSS_XML });
        mockIsWithinTemporalBarrier.mockReturnValue(true);
        mockIsNewItem.mockResolvedValue(true);
        mockTranslateAutoToFrench.mockResolvedValue({ translatedText: 'Traduit', detectedLanguage: 'en' });
        mockRouteArticle.mockResolvedValue({ routed: true, sentTo: ['channel-1'], errors: [] });
        mockMarkAsProcessed.mockResolvedValue(undefined);
        mockAxiosGet.mockRejectedValue(new Error('axios fallback not expected'));
    });
    (0, vitest_1.it)('pipeline complet: scraping → dédup → traduction → routage → marqué traité', async () => {
        const client = createMockClient();
        await (0, globalPatchNotesCron_2.checkPatchNotes)(client);
        (0, vitest_1.expect)(mockScrapeRssFeed).toHaveBeenCalled();
        (0, vitest_1.expect)(mockIsWithinTemporalBarrier).toHaveBeenCalled();
        (0, vitest_1.expect)(mockIsNewItem).toHaveBeenCalledWith('patch_note', 'abc123');
        (0, vitest_1.expect)(mockTranslateAutoToFrench).toHaveBeenCalled();
        (0, vitest_1.expect)(mockRouteArticle).toHaveBeenCalled();
        (0, vitest_1.expect)(mockMarkAsProcessed).toHaveBeenCalledWith('patch_note', 'abc123');
    });
    (0, vitest_1.it)("ne marque PAS comme traité si le routage échoue (routed=false)", async () => {
        mockRouteArticle.mockResolvedValue({ routed: false, sentTo: [], errors: ['Aucun channel'] });
        await (0, globalPatchNotesCron_2.checkPatchNotes)(createMockClient());
        (0, vitest_1.expect)(mockRouteArticle).toHaveBeenCalled();
        (0, vitest_1.expect)(mockMarkAsProcessed).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)("court-circuite si la barrière 48h rejette l'item", async () => {
        mockIsWithinTemporalBarrier.mockReturnValue(false);
        await (0, globalPatchNotesCron_2.checkPatchNotes)(createMockClient());
        (0, vitest_1.expect)(mockIsWithinTemporalBarrier).toHaveBeenCalled();
        (0, vitest_1.expect)(mockIsNewItem).not.toHaveBeenCalled();
        (0, vitest_1.expect)(mockTranslateAutoToFrench).not.toHaveBeenCalled();
        (0, vitest_1.expect)(mockRouteArticle).not.toHaveBeenCalled();
        (0, vitest_1.expect)(mockMarkAsProcessed).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)("court-circuite si l'item est un doublon", async () => {
        mockIsNewItem.mockResolvedValue(false);
        await (0, globalPatchNotesCron_2.checkPatchNotes)(createMockClient());
        (0, vitest_1.expect)(mockIsNewItem).toHaveBeenCalled();
        (0, vitest_1.expect)(mockTranslateAutoToFrench).not.toHaveBeenCalled();
        (0, vitest_1.expect)(mockRouteArticle).not.toHaveBeenCalled();
        (0, vitest_1.expect)(mockMarkAsProcessed).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('utilise le texte original si la traduction échoue', async () => {
        mockTranslateAutoToFrench.mockRejectedValue(new Error('Translation down'));
        await (0, globalPatchNotesCron_2.checkPatchNotes)(createMockClient());
        (0, vitest_1.expect)(mockRouteArticle).toHaveBeenCalled();
        (0, vitest_1.expect)(mockRouteArticle.mock.calls[0][1]).toContain('Patch 1.0 Released');
    });
    (0, vitest_1.it)('passe le contenu traduit au ChannelRouter', async () => {
        mockTranslateAutoToFrench
            .mockResolvedValueOnce({ translatedText: 'Patch 1.0 Publié', detectedLanguage: 'en' })
            .mockResolvedValueOnce({ translatedText: 'Mise à jour majeure', detectedLanguage: 'en' });
        await (0, globalPatchNotesCron_2.checkPatchNotes)(createMockClient());
        const call = mockRouteArticle.mock.calls[0];
        (0, vitest_1.expect)(call[1]).toBe('Patch 1.0 Publié');
        (0, vitest_1.expect)(call[2]).toBe('Mise à jour majeure');
    });
    (0, vitest_1.it)('gère le fallback rss2json si Scrapling échoue', async () => {
        mockScrapeRssFeed.mockRejectedValue(new Error('Scrapling failed'));
        mockAxiosGet.mockResolvedValueOnce({
            data: {
                items: [{
                        title: 'Fallback Item',
                        link: 'https://reddit.com/r/patchnotes/comments/fallback',
                        pubDate: RECENT_DATE,
                        description: 'Fallback content',
                        guid: 'fallback-guid',
                    }],
            },
        });
        await (0, globalPatchNotesCron_2.checkPatchNotes)(createMockClient());
        (0, vitest_1.expect)(mockScrapeRssFeed).toHaveBeenCalled();
        (0, vitest_1.expect)(mockAxiosGet).toHaveBeenCalled();
        (0, vitest_1.expect)(mockIsNewItem).toHaveBeenCalledWith('patch_note', 'fallback-guid');
    });
    (0, vitest_1.it)('ne crashe pas si tous les fallbacks échouent', async () => {
        mockScrapeRssFeed.mockRejectedValue(new Error('Scrapling failed'));
        mockAxiosGet.mockRejectedValue(new Error('All networks down'));
        await (0, vitest_1.expect)((0, globalPatchNotesCron_2.checkPatchNotes)(createMockClient())).resolves.toBeUndefined();
    });
    (0, vitest_1.it)('traite plusieurs items RSS', async () => {
        const multiXml = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>A</title><link>https://reddit.com/comments/111</link><pubDate>${RECENT_DATE}</pubDate><guid>111</guid></item>
<item><title>B</title><link>https://reddit.com/comments/222</link><pubDate>${RECENT_DATE}</pubDate><guid>222</guid></item>
</channel></rss>`;
        mockScrapeRssFeed.mockResolvedValue({ raw: multiXml });
        await (0, globalPatchNotesCron_2.checkPatchNotes)(createMockClient());
        (0, vitest_1.expect)(mockIsNewItem).toHaveBeenCalledTimes(2);
        (0, vitest_1.expect)(mockRouteArticle).toHaveBeenCalledTimes(2);
        (0, vitest_1.expect)(mockMarkAsProcessed).toHaveBeenCalledTimes(2);
    });
    (0, vitest_1.it)("n'appelle pas isNewItem si le flux RSS est vide", async () => {
        mockScrapeRssFeed.mockResolvedValue({
            raw: '<?xml version="1.0"?><rss version="2.0"><channel><title>Empty</title></channel></rss>',
        });
        await (0, globalPatchNotesCron_2.checkPatchNotes)(createMockClient());
        (0, vitest_1.expect)(mockIsNewItem).not.toHaveBeenCalled();
        (0, vitest_1.expect)(mockRouteArticle).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('respecte la limite de 10 items par exécution', async () => {
        const items = Array.from({ length: 15 }, (_, i) => `<item><title>Item ${i}</title><link>https://reddit.com/comments/${i}</link><pubDate>${RECENT_DATE}</pubDate><guid>guid-${i}</guid></item>`).join('');
        mockScrapeRssFeed.mockResolvedValue({
            raw: `<?xml version="1.0"?><rss version="2.0"><channel>${items}</channel></rss>`,
        });
        await (0, globalPatchNotesCron_2.checkPatchNotes)(createMockClient());
        (0, vitest_1.expect)(mockIsNewItem.mock.calls.length).toBeLessThanOrEqual(10);
        (0, vitest_1.expect)(mockRouteArticle.mock.calls.length).toBeLessThanOrEqual(10);
    });
});
//# sourceMappingURL=globalPatchNotesCron.test.js.map