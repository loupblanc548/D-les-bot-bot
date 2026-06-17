// src/imageExtractor.test.ts
import { describe, it, expect, vi } from "vitest";
import { extractImage } from './imageExtractor.js';

const NOOP_LOG = { info: () => {}, warn: () => {}, error: () => {} };

function makeRawgClient(opts: any) {
  return {
    cacheSize: () => 0,
    isEnabled: () => true,
    logger: NOOP_LOG,
    searchByTitle: vi.fn(async (title) => {
      if (opts && opts.byTitle && Object.prototype.hasOwnProperty.call(opts.byTitle, title)) {
        return { id: 99, name: title, background_image: opts.byTitle[title] };
      }
      return null;
    }),
  };
}

describe('extractImage', () => {
  it('Tier 1: returns enclosure URL', async () => {
    const item = { enclosure: { url: 'https://cdn.example.com/banner.jpg' } };
    const r = await extractImage(item, undefined, {});
    expect(r).toBe('https://cdn.example.com/banner.jpg');
  });

  it('Tier 1: skips enclosure if not image-shaped', async () => {
    const item = { enclosure: { url: 'https://example.com/article' } };
    const rc = makeRawgClient(null);
    const r = await extractImage(item, undefined, { rawgClient: rc });
    expect(r).toBeNull();
  });

  it('Tier 2: returns media:content url (object $.url form)', async () => {
    const item = { 'media:content': { $: { url: 'https://cdn.example.com/media.jpg' } } };
    const r = await extractImage(item, undefined, {});
    expect(r).toBe('https://cdn.example.com/media.jpg');
  });

  it('Tier 2: returns media:content url (array form)', async () => {
    const item = { 'media:content': [{ $: { url: 'https://cdn.example.com/media2.jpg' } }] };
    const r = await extractImage(item, undefined, {});
    expect(r).toBe('https://cdn.example.com/media2.jpg');
  });

  it('Tier 3: extracts <img src="..."> regex from content', async () => {
    const html = '<p>News <img src="https://cdn.example.com/inline.png" alt="x"/></p>';
    const item = { content: html };
    const r = await extractImage(item, undefined, {});
    expect(r).toBe('https://cdn.example.com/inline.png');
  });

  it('Tier 4: builds Steam banner from AppID in link', async () => {
    const item = { link: 'https://store.steampowered.com/app/123456/Example/' };
    const r = await extractImage(item, undefined, {});
    expect(r).toBe('https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/123456/header.jpg');
  });

  it('Tier 5: uses RAWG fallback if ctx.rawgClient is provided', async () => {
    const item = { title: 'Rocket League' };
    const rc = makeRawgClient({ byTitle: { 'Rocket League': 'https://cdn.rawg.example/rl.jpg' } });
    const r = await extractImage(item, { name: 'Games', channelEnv: 'GENERIC' }, { rawgClient: rc });
    expect(r).toBe('https://cdn.rawg.example/rl.jpg');
  });

  it('Tier 5: skipped for deal aggregators (Instant Gaming)', async () => {
    const item = { title: 'Some Random Deal' };
    const rc = makeRawgClient({ byTitle: { 'Some Random Deal': 'https://cdn.rawg.example/x.jpg' } });
    const r = await extractImage(item, { name: 'Instant Gaming', channelEnv: 'INSTANT_GAMING_CHANNEL_ID' }, { rawgClient: rc });
    expect(r).toBeNull();
    expect(rc.searchByTitle).not.toHaveBeenCalled();
  });

  it('Tier 5: skipped when rawgClient disabled', async () => {
    const item = { title: 'Halo' };
    const rc = { isEnabled: () => false, logger: NOOP_LOG, searchByTitle: vi.fn() } as any;
    const r = await extractImage(item, undefined, { rawgClient: rc });
    expect(r).toBeNull();
  });

  it('returns null for non-object item', async () => {
    expect(await extractImage(null, undefined, {})).toBeNull();
    expect(await extractImage('string', undefined, {})).toBeNull();
  });

  it('first available tier wins (enclosure before media)', async () => {
    const item = {
      enclosure: { url: 'https://cdn.example.com/banner.jpg' },
      'media:content': { $: { url: 'https://cdn.example.com/media.jpg' } },
    };
    const r = await extractImage(item, undefined, {});
    expect(r).toBe('https://cdn.example.com/banner.jpg');
  });
});
