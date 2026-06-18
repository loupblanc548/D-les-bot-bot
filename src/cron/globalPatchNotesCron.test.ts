import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock logger ───────────────────────────────────────────────────────────

vi.mock('../utils/logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// ─── Imports ───────────────────────────────────────────────────────────────
vi.mock("../utils/deduplicationCache", () => ({
  dedupCache: {
    reloadFromDisk: vi.fn(),
    isAlreadyProcessed: vi.fn().mockReturnValue(false),
    markAsProcessed: vi.fn().mockResolvedValue(undefined),
  },
}));


import { parseRssXmlItems } from '../utils/rss.js';

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

describe('parseRssXmlItems — RSS 2.0 Multi-item', () => {
  it('parse correctement 2 items RSS 2.0', () => {
    const items = parseRssXmlItems(RSS_2_0_MULTI_ITEM);

    expect(items).toHaveLength(2);

    // Item 1
    expect(items[0].title).toBe('Patch 1.2.3 Released - Major Bug Fixes');
    expect(items[0].link).toBe('https://reddit.com/r/patchNotes/comments/abc123');
    expect(items[0].pubDate).toBe('2024-06-15T14:30:00Z');
    expect(items[0].content).toBe('Fixed crash on startup, improved performance, added new features');
    expect(items[0].author).toBe('u/gamedev123');
    expect(items[0].guid).toBe('abc123');

    // Item 2
    expect(items[1].title).toBe('Hotfix 1.2.4 - Server Stability');
    expect(items[1].link).toBe('https://reddit.com/r/patchNotes/comments/def456');
    expect(items[1].pubDate).toBe('2024-06-16T10:00:00Z');
    expect(items[1].author).toBe('u/serverteam');
    expect(items[1].guid).toBe('def456');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 2: RSS 2.0 — Single item
// ═══════════════════════════════════════════════════════════════════════════════

describe('parseRssXmlItems — RSS 2.0 Single item', () => {
  it('parse un flux RSS avec un seul item', () => {
    const items = parseRssXmlItems(RSS_2_0_SINGLE_ITEM);

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Solo Patch Note');
    expect(items[0].link).toBe('https://example.com/solo');
    expect(items[0].pubDate).toBe('2024-01-01T00:00:00Z');
    expect(items[0].guid).toBe('solo-guid');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 3: RSS 2.0 — Empty feed
// ═══════════════════════════════════════════════════════════════════════════════

describe('parseRssXmlItems — RSS 2.0 Empty feed', () => {
  it('retourne un tableau vide pour un flux sans items', () => {
    const items = parseRssXmlItems(RSS_2_0_NO_ITEMS);
    expect(items).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 4: RSS 2.0 — dc:creator → author
// ═══════════════════════════════════════════════════════════════════════════════

describe('parseRssXmlItems — dc:creator → author', () => {
  it('extrait dc:creator comme author (fallback Dublin Core)', () => {
    const items = parseRssXmlItems(RSS_2_0_DC_CREATOR);
    expect(items).toHaveLength(1);
    expect(items[0].author).toBe('u/dc_author');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 5: RSS 2.0 — HTML stripping (contentSnippet)
// ═══════════════════════════════════════════════════════════════════════════════

describe('parseRssXmlItems — HTML stripping', () => {
  it('strips HTML tags from contentSnippet', () => {
    const items = parseRssXmlItems(RSS_2_0_HTML_DESCRIPTION);
    expect(items).toHaveLength(1);

    // content garde le HTML brut
    expect(items[0].content).toContain('<p>');
    expect(items[0].content).toContain('<strong>');

    // contentSnippet est nettoyé
    expect(items[0].contentSnippet).not.toContain('<p>');
    expect(items[0].contentSnippet).not.toContain('<strong>');
    expect(items[0].contentSnippet).toContain('This is a bold paragraph');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 6: RSS 2.0 — Minimal fields
// ═══════════════════════════════════════════════════════════════════════════════

describe('parseRssXmlItems — Minimal fields', () => {
  it('gère un item avec seulement un title (tous les autres champs vides)', () => {
    const items = parseRssXmlItems(RSS_2_0_MINIMAL);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Minimal Item');
    expect(items[0].link).toBe('');
    expect(items[0].pubDate).toBe('');
    expect(items[0].content).toBe('');
    expect(items[0].contentSnippet).toBe('');
    expect(items[0].author).toBe('');
    expect(items[0].guid).toBe('');
    expect(items[0].thumbnail).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 7: RSS 2.0 — guid fallback to link
// ═══════════════════════════════════════════════════════════════════════════════

describe('parseRssXmlItems — guid fallback', () => {
  it('utilise link comme guid quand guid est absent', () => {
    const items = parseRssXmlItems(RSS_2_0_GUID_FALLBACK);
    expect(items).toHaveLength(1);
    expect(items[0].guid).toBe('https://example.com/no-guid-article');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 8: RSS 2.0 — Thumbnail
// ═══════════════════════════════════════════════════════════════════════════════

describe('parseRssXmlItems — Thumbnail', () => {
  it('extrait le champ thumbnail', () => {
    const items = parseRssXmlItems(RSS_2_0_THUMBNAIL);
    expect(items).toHaveLength(1);
    expect(items[0].thumbnail).toBe('https://i.redd.it/thumbnail123.jpg');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 9: Atom — Single entry
// ═══════════════════════════════════════════════════════════════════════════════

describe('parseRssXmlItems — Atom Single entry', () => {
  it('parse un flux Atom avec un seul entry', () => {
    const items = parseRssXmlItems(ATOM_SINGLE_ENTRY);

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Atom Patch Note');
    expect(items[0].link).toBe('https://blog.example.com/atom-post');
    expect(items[0].pubDate).toBe('2024-06-15T14:30:00Z');
    expect(items[0].content).toBe('Full content of the atom entry');
    expect(items[0].author).toBe('atom_author');
    expect(items[0].guid).toBe('atom-guid-123');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 10: Atom — Multi-entry
// ═══════════════════════════════════════════════════════════════════════════════

describe('parseRssXmlItems — Atom Multi-entry', () => {
  it('parse un flux Atom avec plusieurs entries', () => {
    const items = parseRssXmlItems(ATOM_MULTI_ENTRY);

    expect(items).toHaveLength(2);
    expect(items[0].title).toBe('Entry One');
    expect(items[0].guid).toBe('entry-1');
    expect(items[1].title).toBe('Entry Two');
    expect(items[1].guid).toBe('entry-2');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 11: Invalid / Malformed XML
// ═══════════════════════════════════════════════════════════════════════════════

describe('parseRssXmlItems — Invalid XML', () => {
  it('retourne un tableau vide pour du texte non-XML', () => {
    const items = parseRssXmlItems(INVALID_XML);
    expect(items).toHaveLength(0);
  });

  it('retourne un tableau vide pour du XML vraiment invalide', () => {
    const items = parseRssXmlItems(TRULY_INVALID_XML);
    expect(items).toHaveLength(0);
  });

  it('ne crash pas sur du XML malformé (tags non fermés)', () => {
    // fast-xml-parser peut auto-fermer les tags ou rejeter
    // => le comportement exact dépend du parser
    // L'important: ne pas crasher, retourner un tableau (vide ou avec items)
    const items = parseRssXmlItems(MALFORMED_XML);
    expect(Array.isArray(items)).toBe(true);
  });

  it("retourne un tableau vide pour une string vide", () => {
    const items = parseRssXmlItems('');
    expect(items).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 12: content vs description (Atom vs RSS)
// ═══════════════════════════════════════════════════════════════════════════════

describe('parseRssXmlItems — content vs description', () => {
  it("RSS 2.0: utilise description comme content", () => {
    const items = parseRssXmlItems(RSS_2_0_SINGLE_ITEM);
    expect(items[0].content).toBe('Just one item');
  });

  it('Atom: utilise content comme content (pas de description)', () => {
    const items = parseRssXmlItems(ATOM_SINGLE_ENTRY);
    expect(items[0].content).toBe('Full content of the atom entry');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// INTEGRATION TESTS — Pipeline complet (mock tous les modules)
// À ajouter à la fin de globalPatchNotesCron.test.ts
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Mocks pour les modules du pipeline (vi.hoisted obligatoire pour Vitest) ─

const mockIsNewItem = vi.hoisted(() => vi.fn());
const mockMarkAsProcessed = vi.hoisted(() => vi.fn());
const mockIsWithinTemporalBarrier = vi.hoisted(() => vi.fn());
const mockTranslateAutoToFrench = vi.hoisted(() => vi.fn());
const mockRouteArticle = vi.hoisted(() => vi.fn());
const mockScrapeRssFeed = vi.hoisted(() => vi.fn());
const mockAxiosGet = vi.hoisted(() => vi.fn());

vi.mock('../managers/ScraperManager', () => ({
  isNewItem: mockIsNewItem,
  markAsProcessed: mockMarkAsProcessed,
  isWithinTemporalBarrier: mockIsWithinTemporalBarrier,
  scrapeRssFeed: mockScrapeRssFeed,
  scrapeWithScrapling: mockScrapeRssFeed,
  ContentType: { PATCH_NOTE: 'patch_note', FREE_GAME: 'free_game', TWEET: 'tweet', DEAL: 'deal', VIDEO: 'video', GAME_UPDATE: 'game_update', PRICE_ALERT: 'price_alert' },
}));

vi.mock('../utils/translator', () => ({
  translateAutoToFrench: mockTranslateAutoToFrench,
}));

vi.mock('../managers/ChannelRouter', () => ({
  routeArticle: mockRouteArticle,
}));
// Pas de logger mock — déjà fait par le fichier existant

vi.mock('axios', () => ({
  default: {
    get: mockAxiosGet,
    isAxiosError: vi.fn().mockReturnValue(false),
  },
}));

vi.mock('../config', () => ({
  config: {
    redditPatchNotesRss: 'https://www.reddit.com/r/patchnotes/.rss',
    rss2jsonBaseUrl: 'https://api.rss2json.com/v1/api.json',
  },
}));

// ─── Import dynamique de la fonction sous test ─────────────────────────────

import { checkPatchNotes } from "../cron/globalPatchNotesCron.js";

// ─── Helpers ───────────────────────────────────────────────────────────────

function createMockClient(): import('discord.js').Client {
  return { channels: { fetch: vi.fn() } } as unknown as import('discord.js').Client;
}

const RECENT_DATE = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();

/** RSS 2.0 valide avec 1 item */
const VALID_RSS_XML = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>Patch 1.0 Released</title><link>https://reddit.com/r/patchnotes/comments/abc123/patch_1_0</link><pubDate>${RECENT_DATE}</pubDate><description>Major update with bug fixes</description><author>u/dev123</author><guid isPermaLink="false">abc123</guid></item>
</channel></rss>`;

// ═══════════════════════════════════════════════════════════════════════════════
// Suite: Pipeline integration
// ═══════════════════════════════════════════════════════════════════════════════

describe('checkPatchNotes — Pipeline complet (intégration mockée)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Defaults: tout passe
    mockScrapeRssFeed.mockResolvedValue({ raw: VALID_RSS_XML });
    mockIsWithinTemporalBarrier.mockReturnValue(true);
    mockIsNewItem.mockResolvedValue(true);
    mockTranslateAutoToFrench.mockResolvedValue({ translatedText: 'Traduit', detectedLanguage: 'en' });
    mockRouteArticle.mockResolvedValue({ routed: true, sentTo: ['channel-1'], errors: [] });
    mockMarkAsProcessed.mockResolvedValue(undefined);
    mockAxiosGet.mockRejectedValue(new Error('axios fallback not expected'));
  });

  it('pipeline complet: scraping → dédup → traduction → routage → marqué traité', async () => {
    const client = createMockClient();
    await checkPatchNotes(client);

    expect(mockScrapeRssFeed).toHaveBeenCalled();
    expect(mockIsWithinTemporalBarrier).toHaveBeenCalled();
    expect(mockIsNewItem).toHaveBeenCalledWith('patch_note', 'abc123');
    expect(mockTranslateAutoToFrench).toHaveBeenCalled();
    expect(mockRouteArticle).toHaveBeenCalled();
    expect(mockMarkAsProcessed).toHaveBeenCalledWith('patch_note', 'abc123');
  });

  it("ne marque PAS comme traité si le routage échoue (routed=false)", async () => {
    mockRouteArticle.mockResolvedValue({ routed: false, sentTo: [], errors: ['Aucun channel'] });

    await checkPatchNotes(createMockClient());

    expect(mockRouteArticle).toHaveBeenCalled();
    expect(mockMarkAsProcessed).not.toHaveBeenCalled();
  });

  it("court-circuite si la barrière 48h rejette l'item", async () => {
    mockIsWithinTemporalBarrier.mockReturnValue(false);

    await checkPatchNotes(createMockClient());

    expect(mockIsWithinTemporalBarrier).toHaveBeenCalled();
    expect(mockIsNewItem).not.toHaveBeenCalled();
    expect(mockTranslateAutoToFrench).not.toHaveBeenCalled();
    expect(mockRouteArticle).not.toHaveBeenCalled();
    expect(mockMarkAsProcessed).not.toHaveBeenCalled();
  });

  it("court-circuite si l'item est un doublon", async () => {
    mockIsNewItem.mockResolvedValue(false);

    await checkPatchNotes(createMockClient());

    expect(mockIsNewItem).toHaveBeenCalled();
    expect(mockTranslateAutoToFrench).not.toHaveBeenCalled();
    expect(mockRouteArticle).not.toHaveBeenCalled();
    expect(mockMarkAsProcessed).not.toHaveBeenCalled();
  });

  it('utilise le texte original si la traduction échoue', async () => {
    mockTranslateAutoToFrench.mockRejectedValue(new Error('Translation down'));

    await checkPatchNotes(createMockClient());

    expect(mockRouteArticle).toHaveBeenCalled();
    expect(mockRouteArticle.mock.calls[0][1]).toContain('Patch 1.0 Released');
  });

  it('passe le contenu traduit au ChannelRouter', async () => {
    mockTranslateAutoToFrench
      .mockResolvedValueOnce({ translatedText: 'Patch 1.0 Publié', detectedLanguage: 'en' })
      .mockResolvedValueOnce({ translatedText: 'Mise à jour majeure', detectedLanguage: 'en' });

    await checkPatchNotes(createMockClient());

    const call = mockRouteArticle.mock.calls[0];
    expect(call[1]).toBe('Patch 1.0 Publié');
    expect(call[2]).toBe('Mise à jour majeure');
  });

  it('gère le fallback rss2json si Scrapling échoue', async () => {
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

    await checkPatchNotes(createMockClient());

    expect(mockScrapeRssFeed).toHaveBeenCalled();
    expect(mockAxiosGet).toHaveBeenCalled();
    expect(mockIsNewItem).toHaveBeenCalledWith('patch_note', 'fallback-guid');
  });

  it('ne crashe pas si tous les fallbacks échouent', async () => {
    mockScrapeRssFeed.mockRejectedValue(new Error('Scrapling failed'));
    mockAxiosGet.mockRejectedValue(new Error('All networks down'));

    await expect(checkPatchNotes(createMockClient())).resolves.toBeUndefined();
  });

  it('traite plusieurs items RSS', async () => {
    const multiXml = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>A</title><link>https://reddit.com/comments/111</link><pubDate>${RECENT_DATE}</pubDate><guid>111</guid></item>
<item><title>B</title><link>https://reddit.com/comments/222</link><pubDate>${RECENT_DATE}</pubDate><guid>222</guid></item>
</channel></rss>`;

    mockScrapeRssFeed.mockResolvedValue({ raw: multiXml });

    await checkPatchNotes(createMockClient());

    expect(mockIsNewItem).toHaveBeenCalledTimes(2);
    expect(mockRouteArticle).toHaveBeenCalledTimes(2);
    expect(mockMarkAsProcessed).toHaveBeenCalledTimes(2);
  });

  it("n'appelle pas isNewItem si le flux RSS est vide", async () => {
    mockScrapeRssFeed.mockResolvedValue({
      raw: '<?xml version="1.0"?><rss version="2.0"><channel><title>Empty</title></channel></rss>',
    });

    await checkPatchNotes(createMockClient());

    expect(mockIsNewItem).not.toHaveBeenCalled();
    expect(mockRouteArticle).not.toHaveBeenCalled();
  });

  it('respecte la limite de 10 items par exécution', async () => {
    const items = Array.from({ length: 15 }, (_, i) =>
      `<item><title>Item ${i}</title><link>https://reddit.com/comments/${i}</link><pubDate>${RECENT_DATE}</pubDate><guid>guid-${i}</guid></item>`
    ).join('');
    mockScrapeRssFeed.mockResolvedValue({
      raw: `<?xml version="1.0"?><rss version="2.0"><channel>${items}</channel></rss>`,
    });

    await checkPatchNotes(createMockClient());

    expect(mockIsNewItem.mock.calls.length).toBeLessThanOrEqual(10);
    expect(mockRouteArticle.mock.calls.length).toBeLessThanOrEqual(10);
  });
});
