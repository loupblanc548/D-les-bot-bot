// Helpers centralisés pour les images dans les embeds Discord
// Utilisés par feeds.ts, monitor.ts, patchNotes.ts

import * as cheerio from "cheerio";
import type { EmbedBuilder } from "discord.js";
import { AttachmentBuilder } from "discord.js";
import logger from "./logger.js";

// Fallback universel : image générique gaming (PNG valide, hébergée sur CDN)
export const FALLBACK_EMBED_IMAGE =
  "https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/72x72/1f3ae.png";

const VALID_IMAGE_EXT = /\.(png|jpe?g|gif|webp)(\?|#|$)/i;

/**
 * Résout une URL d'image potentiellement relative en URL absolue.
 * Si l'URL commence par "/", on la préfixe avec baseUrl.
 * Si elle est déjà absolue (http/https), on la retourne telle quelle.
 */
export function resolveImageUrl(imageUrl: string, baseUrl: string): string {
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  if (imageUrl.startsWith("/")) {
    try {
      return new URL(imageUrl, baseUrl).href;
    } catch {
      return imageUrl;
    }
  }
  // Relative without leading slash
  try {
    return new URL(imageUrl, baseUrl).href;
  } catch {
    return imageUrl;
  }
}

/**
 * Tente de télécharger une image en buffer (anti-hotlinking fallback).
 * Si l'URL est bloquée par Cloudflare/403 quand Discord essaie de l'afficher,
 * on peut télécharger l'image côté bot et l'envoyer en pièce jointe locale.
 *
 * @returns Buffer + filename si succès, null sinon
 */
export async function downloadImageAsBuffer(
  imageUrl: string,
): Promise<{ buffer: Buffer; filename: string } | null> {
  try {
    const res = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      logger.debug(`[ImageHelpers] Download failed (${res.status}) for: ${imageUrl}`);
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 100) return null; // Too small, probably an error page

    // Extract filename from URL or generate one
    const urlPath = new URL(imageUrl).pathname;
    const ext = urlPath.match(/\.(png|jpe?g|gif|webp)$/i)?.[0] || ".jpg";
    const filename = `image_${Date.now()}${ext}`;

    return { buffer, filename };
  } catch (err) {
    logger.debug(`[ImageHelpers] Download error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Crée un AttachmentBuilder à partir d'une URL d'image (anti-hotlinking).
 * Télécharge l'image en buffer et retourne l'attachment + le filename local.
 * Retourne null si le téléchargement échoue.
 */
export async function createImageAttachment(
  imageUrl: string,
): Promise<{ attachment: AttachmentBuilder; filename: string } | null> {
  const result = await downloadImageAsBuffer(imageUrl);
  if (!result) return null;
  return {
    attachment: new AttachmentBuilder(result.buffer, { name: result.filename }),
    filename: result.filename,
  };
}

/**
 * Valide qu'une URL est utilisable comme setImage() dans un embed Discord.
 * - Doit être http(s)://
 * - Doit avoir une extension d'image valide (png/jpg/jpeg/gif/webp)
 * - Exclut les favicons .ico (non supportées par Discord embeds)
 */
export function isValidEmbedImageUrl(url: unknown): url is string {
  if (typeof url !== "string" || url.length === 0) return false;
  if (!/^https?:\/\//i.test(url)) return false;
  if (/\.ico(\?|#|$)/i.test(url)) return false;
  return VALID_IMAGE_EXT.test(url);
}

/**
 * Définit l'image d'un embed de manière sécurisée.
 * Si l'URL est invalide/absente, utilise le fallback universel.
 * Évite le glyphe "5 barres noires" de Discord quand setImage("") est appelé.
 */
export function safeSetImage(embed: EmbedBuilder, url: string | null | undefined): EmbedBuilder {
  if (isValidEmbedImageUrl(url)) {
    return embed.setImage(url);
  }
  return embed.setImage(FALLBACK_EMBED_IMAGE);
}

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

export function clearAllCaches(): void {
  urlCache.clear();
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
      if (ogImage) {
        try { return new URL(ogImage, url).href; } catch { return ogImage; }
      }

      // Étape 2 : twitter:image
      const twitterImage = $('meta[name="twitter:image"]').attr("content");
      if (twitterImage) {
        try { return new URL(twitterImage, url).href; } catch { return twitterImage; }
      }

      // Étape 3 : fallback <img> scraping with lazy-loading support + filters
      const excludePatterns = ["data:image", "avatar", "/icon", "gravatar.com", "pixel", "1x1"];
      let found: string | null = null;

      $("img").each((_, el) => {
        if (found) return;
        // Check lazy-loading attributes first: data-src, data-lazy-src, srcset, then src
        const src =
          $(el).attr("data-src") ||
          $(el).attr("data-lazy-src") ||
          $(el).attr("data-original") ||
          (() => {
            const srcset = $(el).attr("srcset");
            if (srcset) {
              // Extract first URL from srcset (highest priority)
              const firstUrl = srcset.split(",")[0]?.trim().split(/\s+/)[0];
              return firstUrl || null;
            }
            return null;
          })() ||
          $(el).attr("src");
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
// Fallback : og:image meta tag
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

      // Étape 1 : og:image (plus fiable pour Discord)
      const ogImage = $('meta[property="og:image"]').attr("content");
      if (ogImage && isValidEmbedImageUrl(ogImage)) {
        try { return new URL(ogImage, url).href; } catch { return ogImage; }
      }

      // Étape 2 : images pbs.twimg.com (images de tweets)
      let tweetImage: string | null = null;
      $('img[src*="pbs.twimg.com"]').each((_, el) => {
        if (tweetImage) return;
        const src = $(el).attr("src");
        if (src && isValidEmbedImageUrl(src)) tweetImage = src;
      });
      if (tweetImage) return tweetImage;

      // Étape 3 : miniature vidéo Twitter (video.twimg.com)
      let videoThumb: string | null = null;
      $('img[src*="video.twimg.com"]').each((_, el) => {
        if (videoThumb) return;
        const src = $(el).attr("src");
        if (src && isValidEmbedImageUrl(src)) videoThumb = src;
      });
      if (videoThumb) return videoThumb;

      // Étape 4 : twitter:image meta
      const twitterImage = $('meta[name="twitter:image"]').attr("content");
      if (twitterImage && isValidEmbedImageUrl(twitterImage)) {
        try { return new URL(twitterImage, url).href; } catch { return twitterImage; }
      }

      return null;
    } catch {
      return null;
    }
  });
}
