/**
 * lyricsService.ts — Fetch and display song lyrics
 *
 * Uses the lyrics API (lyrics.js.org / lyrics.ovh) and Genius as fallback.
 * Paginates long lyrics with the pagination utility.
 */

import { EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";

export interface LyricsResult {
  title: string;
  artist: string;
  lyrics: string;
  source: string;
  url?: string;
}

const LYRICS_OVH_BASE = "https://api.lyrics.ovh/v1";
const GENIUS_API_BASE = "https://api.genius.com";

// ─── Fetch lyrics ─────────────────────────────────────────────────────

export async function getLyrics(artist: string, title: string): Promise<LyricsResult | null> {
  // Try lyrics.ovh first (no API key needed)
  try {
    const url = `${LYRICS_OVH_BASE}/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
    const response = await fetch(url, {
      headers: { "User-Agent": "DiscordBot/1.0" },
      signal: AbortSignal.timeout(10_000),
    });

    if (response.ok) {
      const data = await response.json() as { lyrics?: string };
      if (data.lyrics && data.lyrics.trim().length > 0) {
        const cleaned = cleanLyrics(data.lyrics);
        if (cleaned.length > 0) {
          return {
            title: title.trim(),
            artist: artist.trim(),
            lyrics: cleaned,
            source: "lyrics.ovh",
          };
        }
      }
    }
  } catch (error) {
    logger.debug(`[Lyrics] lyrics.ovh failed: ${String(error)}`);
  }

  // Fallback: Genius API (if token available)
  const geniusToken = process.env.GENIUS_API_TOKEN;
  if (geniusToken) {
    try {
      const searchUrl = `${GENIUS_API_BASE}/search?q=${encodeURIComponent(`${artist} ${title}`)}`;
      const searchRes = await fetch(searchUrl, {
        headers: { Authorization: `Bearer ${geniusToken}` },
        signal: AbortSignal.timeout(10_000),
      });

      if (searchRes.ok) {
        const searchData = await searchRes.json() as {
          response?: { hits?: { result?: { id: number; url: string; full_title: string } }[] };
        };
        const hit = searchData.response?.hits?.[0]?.result;
        if (hit) {
          // Fetch song details for lyrics
          const songUrl = `${GENIUS_API_BASE}/songs/${hit.id}`;
          const songRes = await fetch(songUrl, {
            headers: { Authorization: `Bearer ${geniusToken}` },
            signal: AbortSignal.timeout(10_000),
          });

          if (songRes.ok) {
            const songData = await songRes.json() as {
              response?: { song?: { lyrics?: string; full_title?: string } };
            };
            const lyrics = songData.response?.song?.lyrics;
            if (lyrics && lyrics.trim().length > 0) {
              return {
                title: title.trim(),
                artist: artist.trim(),
                lyrics: cleanLyrics(lyrics),
                source: "Genius",
                url: hit.url,
              };
            }
          }
        }
      }
    } catch (error) {
      logger.debug(`[Lyrics] Genius failed: ${String(error)}`);
    }
  }

  return null;
}

// ─── Clean lyrics ─────────────────────────────────────────────────────

function cleanLyrics(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\[.*?\]/g, "") // Remove [Verse], [Chorus], etc.
    .replace(/Paroles de.*?\n/i, "")
    .replace(/\{.*?\}/g, "")
    .trim();
}

// ─── Build embed ──────────────────────────────────────────────────────

export function buildLyricsEmbed(result: LyricsResult): EmbedBuilder {
  const truncatedLyrics = result.lyrics.slice(0, 4096);
  const isTruncated = result.lyrics.length > 4096;

  const embed = new EmbedBuilder()
    .setTitle(`🎵 ${result.title} — ${result.artist}`)
    .setColor(0x1db954)
    .setDescription(truncatedLyrics || "Paroles non disponibles")
    .setFooter({ text: `Source: ${result.source}${isTruncated ? " (tronqué)" : ""}` })
    .setTimestamp();

  if (result.url) {
    embed.setURL(result.url);
  }

  return embed;
}

// ─── Search suggestions ───────────────────────────────────────────────

export async function searchLyrics(query: string): Promise<{ title: string; artist: string }[]> {
  const geniusToken = process.env.GENIUS_API_TOKEN;
  if (!geniusToken) return [];

  try {
    const url = `${GENIUS_API_BASE}/search?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${geniusToken}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return [];
    const data = await res.json() as {
      response?: { hits?: { result?: { title: string; primary_artist?: { name: string } } }[] };
    };

    return (data.response?.hits ?? [])
      .slice(0, 10)
      .map((hit) => ({
        title: hit.result?.title ?? "",
        artist: hit.result?.primary_artist?.name ?? "",
      }))
      .filter((r) => r.title && r.artist);
  } catch {
    return [];
  }
}

// ─── Paginated lyrics (for very long songs) ──────────────────────────

export function paginateLyrics(lyrics: string, chunkSize = 1900): string[] {
  if (lyrics.length <= chunkSize) return [lyrics];

  const chunks: string[] = [];
  const lines = lyrics.split("\n");
  let current = "";

  for (const line of lines) {
    if (current.length + line.length + 1 > chunkSize) {
      chunks.push(current.trim());
      current = "";
    }
    current += line + "\n";
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
