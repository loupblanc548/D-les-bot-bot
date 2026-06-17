/**
 * Enhanced Image Fallback System
 * Provides multi-tier image extraction with caching and configurable fallbacks
 */

import logger from "./logger.js";

interface ImageFallbackConfig {
  enabled: boolean;
  cacheEnabled: boolean;
  cacheTtlMs: number;
  fallbackOptions: {
    enclosure: boolean;
    mediaContent: boolean;
    htmlImages: boolean;
    steamBanner: boolean;
    rawgSearch: boolean;
    genericPlaceholder: boolean;
    discordCdn: boolean;
  };
  genericPlaceholderUrl?: string;
}

interface ImageExtractionContext {
  rawgClient?: any;
  signal?: AbortSignal;
  rule?: { channelEnv?: string; name?: string };
}

interface CacheEntry {
  url: string;
  timestamp: number;
}

// Cache for extracted images
const imageCache = new Map<string, CacheEntry>();

// Default configuration
const defaultConfig: ImageFallbackConfig = {
  enabled: true,
  cacheEnabled: true,
  cacheTtlMs: 30 * 60 * 1000, // 30 minutes
  fallbackOptions: {
    enclosure: true,
    mediaContent: true,
    htmlImages: true,
    steamBanner: true,
    rawgSearch: true,
    genericPlaceholder: true,
    discordCdn: false,
  },
  genericPlaceholderUrl:
    "https://via.placeholder.com/1200x630/1b2838/FFFFFF?text=No+Image+Available",
};

let currentConfig = { ...defaultConfig };

/**
 * Configure the image fallback system
 */
export function configureImageFallback(config: Partial<ImageFallbackConfig>): void {
  currentConfig = { ...currentConfig, ...config };
  logger.info("[ImageFallback] Configuration updated");
}

/**
 * Get current configuration
 */
export function getImageFallbackConfig(): ImageFallbackConfig {
  return { ...currentConfig };
}

/**
 * Extract image with multi-tier fallback system
 */
export async function extractImageWithFallback(
  item: Record<string, unknown>,
  context: ImageExtractionContext = {},
): Promise<string | null> {
  if (!currentConfig.enabled || !item) {
    return null;
  }

  // Generate cache key
  const cacheKey = generateCacheKey(item, context);

  // Check cache first
  if (currentConfig.cacheEnabled) {
    const cached = imageCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < currentConfig.cacheTtlMs) {
      return cached.url;
    }
  }

  // Try each fallback tier in order
  const result = await tryFallbackTiers(item, context);

  // Cache the result
  if (result && currentConfig.cacheEnabled) {
    imageCache.set(cacheKey, { url: result, timestamp: Date.now() });
  }

  return result;
}

/**
 * Try each fallback tier in sequence
 */
async function tryFallbackTiers(
  item: Record<string, unknown>,
  context: ImageExtractionContext,
): Promise<string | null> {
  const tiers: Array<() => string | null | Promise<string | null>> = [];

  if (currentConfig.fallbackOptions.enclosure) {
    tiers.push(() => tryEnclosure(item));
  }

  if (currentConfig.fallbackOptions.mediaContent) {
    tiers.push(() => tryMediaContent(item));
  }

  if (currentConfig.fallbackOptions.htmlImages) {
    tiers.push(() => tryHtmlImages(item));
  }

  if (currentConfig.fallbackOptions.steamBanner) {
    tiers.push(() => trySteamBanner(item));
  }

  if (currentConfig.fallbackOptions.rawgSearch) {
    tiers.push(() => tryRawgSearch(item, context));
  }

  if (currentConfig.fallbackOptions.genericPlaceholder) {
    tiers.push(() => currentConfig.genericPlaceholderUrl || null);
  }

  if (currentConfig.fallbackOptions.discordCdn) {
    tiers.push(() => tryDiscordCdn(item));
  }

  for (const tier of tiers) {
    try {
      const result = await tier();
      if (result && isValidImageUrl(result)) {
        return result;
      }
    } catch (error) {
      logger.debug(
        `[ImageFallback] Tier failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return null;
}

/**
 * Try enclosure URL
 */
function tryEnclosure(item: Record<string, unknown>): string | null {
  const enclosure = item.enclosure as { url?: string } | undefined;
  const url = enclosure?.url;
  return url && isValidImageUrl(url) ? url : null;
}

/**
 * Try media:content URL
 */
function tryMediaContent(item: Record<string, unknown>): string | null {
  const mediaKeys = ["media:content", "media_content", "media:thumbnail", "media_thumbnail"];

  for (const key of mediaKeys) {
    const media = item[key];
    if (!media) continue;

    if (typeof media === "string" && isValidImageUrl(media)) {
      return media;
    }

    if (typeof media === "object" && media !== null) {
      const mediaObj = media as Record<string, unknown>;
      const dollar = mediaObj.$ as Record<string, unknown> | undefined;

      if (dollar && typeof dollar.url === "string" && isValidImageUrl(dollar.url)) {
        return dollar.url;
      }

      if (typeof mediaObj.url === "string" && isValidImageUrl(mediaObj.url)) {
        return mediaObj.url;
      }
    }

    if (Array.isArray(media) && media.length > 0) {
      const first = media[0];
      if (typeof first === "object" && first !== null) {
        const firstObj = first as Record<string, unknown>;
        const dollar = firstObj.$ as Record<string, unknown> | undefined;

        if (dollar && typeof dollar.url === "string" && isValidImageUrl(dollar.url)) {
          return dollar.url;
        }

        if (typeof firstObj.url === "string" && isValidImageUrl(firstObj.url)) {
          return firstObj.url;
        }
      }
    }
  }

  return null;
}

/**
 * Try HTML <img> tags
 */
function tryHtmlImages(item: Record<string, unknown>): string | null {
  const htmlKeys = ["content:encoded", "content", "contentSnippet", "summary"];
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/i;

  for (const key of htmlKeys) {
    const value = item[key];
    if (typeof value !== "string") continue;

    const match = imgRegex.exec(value);
    if (match && match[1] && isValidImageUrl(match[1])) {
      return match[1];
    }
  }

  return null;
}

/**
 * Try Steam banner from AppID
 */
function trySteamBanner(item: Record<string, unknown>): string | null {
  const steamRegex = /store\.steampowered\.com\/app\/(\d+)/i;
  const haystack = [item.link, item.title, item["content:encoded"], item.content]
    .filter((v): v is string => typeof v === "string")
    .join("\n");

  const match = steamRegex.exec(haystack);
  if (match && match[1]) {
    return `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${match[1]}/header.jpg`;
  }

  return null;
}

/**
 * Try RAWG search
 */
async function tryRawgSearch(
  item: Record<string, unknown>,
  context: ImageExtractionContext,
): Promise<string | null> {
  if (!context.rawgClient || !context.rawgClient.isEnabled?.()) {
    return null;
  }

  if (isDealAggregator(context.rule)) {
    return null;
  }

  const title = typeof item.title === "string" ? item.title.trim() : "";
  if (!title) return null;

  try {
    const game = await context.rawgClient.searchByTitle(title, {
      signal: context.signal,
    });
    if (game?.background_image && isValidImageUrl(game.background_image)) {
      return game.background_image;
    }
  } catch (error) {
    logger.debug(`[ImageFallback] RAWG search failed for ${title}`);
  }

  return null;
}

/**
 * Try Discord CDN placeholder
 */
function tryDiscordCdn(item: Record<string, unknown>): string | null {
  // Generate a deterministic placeholder based on item content
  const seed = generateSeed(item);
  return `https://cdn.discordapp.com/embed/avatars/${seed}.png`;
}

/**
 * Check if URL is a valid image URL
 */
function isValidImageUrl(url: string): boolean {
  if (typeof url !== "string" || !url.length) return false;

  const httpRegex = /^https?:\/\//i;
  if (!httpRegex.test(url)) return false;

  const imageExtensions = /\.(png|jpe?g|gif|webp|svg)(\?|#|$)/i;
  if (imageExtensions.test(url)) return true;

  const imageKeywords = /cdn|media|image|img|rawg|steamstatic|akamai|store|discord/i;
  return imageKeywords.test(url);
}

/**
 * Generate cache key from item and context
 */
function generateCacheKey(item: Record<string, unknown>, context: ImageExtractionContext): string {
  const keyParts = [
    item.link,
    item.title,
    item.guid,
    context.rule?.channelEnv,
    context.rule?.name,
  ].filter((v): v is string => typeof v === "string");

  return keyParts.join("|").slice(0, 200);
}

/**
 * Generate deterministic seed for Discord CDN
 */
function generateSeed(item: Record<string, unknown>): number {
  const str = [item.link, item.title, item.guid]
    .filter((v): v is string => typeof v === "string")
    .join("");

  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return Math.abs(hash) % 6; // Discord has 6 default avatars (0-5)
}

/**
 * Check if rule is a deal aggregator (skip RAWG for these)
 */
function isDealAggregator(rule?: { channelEnv?: string; name?: string }): boolean {
  if (!rule) return false;

  const env = (rule.channelEnv || "").toUpperCase();
  if (env === "INSTANT_GAMING_CHANNEL_ID") return true;

  const name = (rule.name || "").toLowerCase();
  return (
    name.includes("instant gaming") || name.includes("aggregator") || name.includes("agregator")
  );
}

/**
 * Clear expired cache entries
 */
export function clearExpiredImageCache(): number {
  const now = Date.now();
  let cleared = 0;

  for (const [key, entry] of imageCache.entries()) {
    if (now - entry.timestamp > currentConfig.cacheTtlMs) {
      imageCache.delete(key);
      cleared++;
    }
  }

  if (cleared > 0) {
    logger.debug(`[ImageFallback] Cleared ${cleared} expired cache entries`);
  }

  return cleared;
}

/**
 * Clear entire image cache
 */
export function clearImageCache(): void {
  const size = imageCache.size;
  imageCache.clear();
  logger.info(`[ImageFallback] Cleared entire cache (${size} entries)`);
}

/**
 * Get cache statistics
 */
export function getImageCacheStats(): {
  size: number;
  hitRate: number;
  entries: number;
} {
  return {
    size: imageCache.size,
    hitRate: 0, // Could be implemented with hit/miss counters
    entries: imageCache.size,
  };
}

// Auto-clear expired cache every 5 minutes
setInterval(clearExpiredImageCache, 5 * 60 * 1000);
