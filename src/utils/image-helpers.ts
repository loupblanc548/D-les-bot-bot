// Helpers centralisés pour les images dans les embeds Discord
// Utilisés par feeds.ts, monitor.ts, patchNotes.ts

import * as cheerio from "cheerio";

// Cache simple (Map) avec TTL de 10 minutes pour éviter de refetch la même URL
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const urlCache = new Map<string, { data: string | null; ts: number }>();

// Éviction au moment de l'écriture (pas de timer permanent)
let lastSweep = 0;
const SWEEP_COOLDOWN_MS = 60_000;

function sweepExpired() {
  const now = Date.now();
  if (now - lastSweep < SWEEP_COOLDOWN_MS) return;
  lastSweep = now;
  for (const [key, { ts }] of urlCache) {
    if (now - ts >= CACHE_TTL_MS) urlCache.delete(key);
  }
}

function withCache(key: string, fetcher: () => Promise<string | null>): Promise<string | null> {
  const cached = urlCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return Promise.resolve(cached.data);
  }
  return fetcher().then((data) => {
    sweepExpired();
    urlCache.set(key, { data, ts: Date.now() });
    return data;
  });
}

/**
 * Extrait la miniature YouTube depuis les métadonnées RSS/Atom d'un item de flux.
 * Formats supportés :
 *   - RSS  : <media:thumbnail url="..." />
 *   - Atom : <media:group><media:thumbnail url="..." /></media:group>
 * Dans le flux Atom YouTube, les miniatures sont triées par taille ;
 * la dernière est maxresdefault (la plus grande).
 */
export function extractMediaThumbnail(item: Record<string, unknown>): string | undefined {
  // Format RSS standard : <media:thumbnail url="..." />
  const directThumb = (item as any)["media:thumbnail"];
  if (directThumb?.["@_url"]) return directThumb["@_url"];

  // Format Atom YouTube : <media:group><media:thumbnail url="..." /></media:group>
  const mediaGroup = (item as any)["media:group"];
  if (mediaGroup) {
    const thumb = mediaGroup["media:thumbnail"];
    if (thumb) {
      if (Array.isArray(thumb)) {
        return thumb[thumb.length - 1]?.["@_url"] || thumb[0]?.["@_url"];
      }
      return thumb["@_url"];
    }
  }
  return undefined;
}

export async function getYouTubeThumbnail(url: string): Promise<string | null> {
  return withCache("yt:" + url, async () => {
    try {
      const match = url.match(
        /(?:youtube\.com\/watch\?(?:.*[?&])?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      );
      if (!match) return null;
      const videoId = match[1];
      const maxresUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      // Vérifier si maxresdefault existe, sinon fallback hqdefault
      try {
        const head = await fetch(maxresUrl, { method: "HEAD", signal: AbortSignal.timeout(3000) });
        if (head.ok) return maxresUrl;
      } catch {}
      return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    } catch {
      return null;
    }
  });
}

export async function getOgImage(url: string): Promise<string | null> {
  return withCache("og:" + url, async () => {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "DiscordSurveillanceBot/1.0" },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      const html = await res.text();
      const $ = cheerio.load(html);
      // og:image
      const ogImage = $('meta[property="og:image"]').attr("content");
      if (ogImage) return ogImage;
      // twitter:image fallback
      const twitterImage = $('meta[name="twitter:image"]').attr("content");
      if (twitterImage) return twitterImage;
      return null;
    } catch {
      return null;
    }
  });
}

// Extraction d'images pour les articles de blog :
// 1. Fetch la page une seule fois
// 2. Tente d'abord l'Open Graph (og:image) dans le HTML
// 3. Fallback : scrape les balises <img> du corps de l'article
// Filtre les images trop petites, icônes, pixels de tracking, etc.
export async function getBlogImage(url: string): Promise<string | null> {
  return withCache("blog:" + url, async () => {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "DiscordSurveillanceBot/1.0" },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      const html = await res.text();
      const $ = cheerio.load(html);

      // Étape 1 : og:image
      const ogImage = $('meta[property="og:image"]').attr("content");
      if (ogImage) return ogImage;

      // Étape 2 : twitter:image
      const twitterImage = $('meta[name="twitter:image"]').attr("content");
      if (twitterImage) return twitterImage;

      // Étape 3 : fallback <img> scraping avec filtres
      const excludePatterns = ["data:image", "avatar", "/icon", "gravatar.com", "pixel", "1x1"];
      let found: string | null = null;

      $("img").each((_, el) => {
        if (found) return;
        const src = $(el).attr("src");
        if (!src) return;
        if (excludePatterns.some((p) => src.includes(p))) return;
        if (/\d+x\d+\.(png|jpg|gif|webp)$/i.test(src)) return;
        if (src.match(/\.(png|jpg|jpeg|webp|gif)(\?|$)/i)) {
          found = src;
        }
      });

      if (found) {
        try {
          return new URL(found, url).href;
        } catch {
          return found;
        }
      }

      return null;
    } catch {
      return null;
    }
  });
}

// Extraction d'images Twitter : scrape les <img> du contenu du tweet sur xcancel
// Les images de tweets sont hébergées sur pbs.twimg.com
export async function getTweetImage(url: string): Promise<string | null> {
  return withCache("tweet:" + url, async () => {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "DiscordSurveillanceBot/1.0" },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      const html = await res.text();
      const $ = cheerio.load(html);

      // Chercher les images pbs.twimg.com (images de tweets)
      let tweetImage: string | null = null;
      $('img[src*="pbs.twimg.com"]').each((_, el) => {
        if (tweetImage) return;
        tweetImage = $(el).attr("src") || null;
      });
      if (tweetImage) return tweetImage;

      // Fallback : miniature vidéo Twitter (video.twimg.com)
      let videoThumb: string | null = null;
      $('img[src*="video.twimg.com"]').each((_, el) => {
        if (videoThumb) return;
        videoThumb = $(el).attr("src") || null;
      });
      if (videoThumb) return videoThumb;

      return null;
    } catch {
      return null;
    }
  });
}
