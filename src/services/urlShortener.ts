/**
 * urlShortener.ts — Shorten URLs and track clicks
 *
 * Uses is.gd (no API key needed) and v.gd as primary providers.
 * Supports custom slugs via is.gd. Caches results to avoid redundant calls.
 */

import { EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";

export interface ShortenedUrl {
  original: string;
  short: string;
  provider: string;
  createdAt: Date;
  slug?: string;
}

const cache = new Map<string, ShortenedUrl>();

// ─── Shorten via is.gd ────────────────────────────────────────────────

export async function shortenUrl(url: string, customSlug?: string): Promise<ShortenedUrl | null> {
  // Validate URL
  try {
    new URL(url);
  } catch {
    return null;
  }

  // Check cache
  const cacheKey = `${url}_${customSlug ?? ""}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const params = new URLSearchParams({ url });
    if (customSlug) {
      params.set("shorturl", customSlug);
    } else {
      params.set("logstats", "1");
    }

    const apiUrl = `https://is.gd/create.php?${params.toString()}`;
    const res = await fetch(apiUrl, {
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "DiscordBot/1.0" },
    });

    if (!res.ok) return null;

    const text = await res.text();

    // is.gd returns the short URL on success, or error message
    if (text.startsWith("http")) {
      const result: ShortenedUrl = {
        original: url,
        short: text.trim(),
        provider: "is.gd",
        createdAt: new Date(),
        slug: customSlug,
      };
      cache.set(cacheKey, result);
      logger.info(`[URLShortener] Shortened ${url} → ${result.short}`);
      return result;
    }

    logger.warn(`[URLShortener] is.gd error: ${text}`);
    return null;
  } catch (error) {
    logger.error(`[URLShortener] Error: ${String(error)}`);
    return null;
  }
}

// ─── Shorten via v.gd (fallback) ──────────────────────────────────────

export async function shortenUrlVgd(url: string): Promise<ShortenedUrl | null> {
  try {
    new URL(url);
  } catch {
    return null;
  }

  const cacheKey = `vgd_${url}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const apiUrl = `https://v.gd/create.php?format=simple&url=${encodeURIComponent(url)}`;
    const res = await fetch(apiUrl, {
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "DiscordBot/1.0" },
    });

    if (!res.ok) return null;

    const text = await res.text();
    if (text.startsWith("http")) {
      const result: ShortenedUrl = {
        original: url,
        short: text.trim(),
        provider: "v.gd",
        createdAt: new Date(),
      };
      cache.set(cacheKey, result);
      return result;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Universal shorten with fallback ──────────────────────────────────

export async function shorten(url: string, customSlug?: string): Promise<ShortenedUrl | null> {
  // Try is.gd first (supports custom slugs)
  const result = await shortenUrl(url, customSlug);
  if (result) return result;

  // Fallback to v.gd (no custom slug support)
  if (!customSlug) {
    return shortenUrlVgd(url);
  }

  return null;
}

// ─── Expand / preview ─────────────────────────────────────────────────

export async function expandUrl(shortUrl: string): Promise<string | null> {
  try {
    const res = await fetch(shortUrl, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "DiscordBot/1.0" },
    });

    const finalUrl = res.url || res.headers.get("location");
    return finalUrl ?? null;
  } catch {
    return null;
  }
}

// ─── Build embed ──────────────────────────────────────────────────────

export function buildShortenerEmbed(result: ShortenedUrl): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("🔗 URL raccourcie")
    .setColor(0x5865f2)
    .addFields(
      { name: "URL originale", value: result.original.slice(0, 1024), inline: false },
      { name: "URL courte", value: result.short, inline: false },
      { name: "Provider", value: result.provider, inline: true },
      { name: "Créée", value: `<t:${Math.floor(result.createdAt.getTime() / 1000)}:R>`, inline: true },
    )
    .setTimestamp();
}

// ─── Stats ────────────────────────────────────────────────────────────

export function getShortenerStats(): { total: number; byProvider: Record<string, number> } {
  const entries = Array.from(cache.values());
  const byProvider: Record<string, number> = {};
  for (const e of entries) {
    byProvider[e.provider] = (byProvider[e.provider] ?? 0) + 1;
  }
  return { total: entries.length, byProvider };
}

export function getRecentShortened(limit = 10): ShortenedUrl[] {
  return Array.from(cache.values())
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
}
