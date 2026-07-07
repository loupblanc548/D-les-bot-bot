/**
 * igdb.ts — IGDB (Internet Game Database) API integration.
 *
 * IGDB is owned by Twitch and uses Twitch OAuth tokens for auth.
 * Provides comprehensive game data: ratings, screenshots, storylines, genres, platforms.
 *
 * Free tier: 4 requests/sec, unlimited monthly.
 */

import logger from "../utils/logger.js";
import { config } from "../config.js";

const IGDB_API_URL = "https://api.igdb.com/v4";
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";

let cachedToken: { value: string; expiresAt: number } | null = null;

export function isIgdbAvailable(): boolean {
  return !!config.igdbClientId && !!config.igdbClientSecret;
}

async function getAccessToken(): Promise<string | null> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value;
  }

  try {
    const params = new URLSearchParams({
      client_id: config.igdbClientId,
      client_secret: config.igdbClientSecret,
      grant_type: "client_credentials",
    });

    const res = await fetch(TWITCH_TOKEN_URL, {
      method: "POST",
      body: params,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      logger.warn(`[IGDB] Token HTTP ${res.status}`);
      return null;
    }

    const data = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };

    cachedToken = {
      value: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    };
    return data.access_token;
  } catch (error) {
    logger.warn(`[IGDB] Token error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export interface IgdbGame {
  id: number;
  name: string;
  summary: string | null;
  rating: number | null;
  releaseDate: string | null;
  genres: string[];
  platforms: string[];
  coverUrl: string | null;
  screenshotUrls: string[];
  url: string;
}

export async function searchGame(query: string, limit = 5): Promise<IgdbGame[]> {
  if (!isIgdbAvailable()) return [];

  const token = await getAccessToken();
  if (!token) return [];

  try {
    const res = await fetch(`${IGDB_API_URL}/games`, {
      method: "POST",
      headers: {
        "Client-ID": config.igdbClientId,
        Authorization: `Bearer ${token}`,
        "Content-Type": "text/plain",
      },
      body: `search "${query.replace(/"/g, "")}"; fields name,summary,rating,first_release_date,genres.name,platforms.name,cover.image_id,screenshots.image_id,url; limit ${limit};`,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      logger.warn(`[IGDB] Search HTTP ${res.status}`);
      return [];
    }

    const data = (await res.json()) as Array<{
      id: number;
      name: string;
      summary?: string;
      rating?: number;
      first_release_date?: number;
      genres?: Array<{ name: string }>;
      platforms?: Array<{ name: string }>;
      cover?: { image_id: string };
      screenshots?: Array<{ image_id: string }>;
      url?: string;
    }>;

    return data.map((g) => ({
      id: g.id,
      name: g.name,
      summary: g.summary ?? null,
      rating: g.rating ? Math.round(g.rating) : null,
      releaseDate: g.first_release_date
        ? new Date(g.first_release_date * 1000).toISOString()
        : null,
      genres: g.genres?.map((x) => x.name) ?? [],
      platforms: g.platforms?.map((x) => x.name) ?? [],
      coverUrl: g.cover
        ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg`
        : null,
      screenshotUrls:
        g.screenshots?.map(
          (s) => `https://images.igdb.com/igdb/image/upload/t_screenshot_big/${s.image_id}.jpg`,
        ) ?? [],
      url: g.url ?? `https://www.igdb.com/games/${g.id}`,
    }));
  } catch (error) {
    logger.warn(`[IGDB] Search error: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

export async function getGameById(id: number): Promise<IgdbGame | null> {
  if (!isIgdbAvailable()) return null;

  const token = await getAccessToken();
  if (!token) return null;

  try {
    const res = await fetch(`${IGDB_API_URL}/games`, {
      method: "POST",
      headers: {
        "Client-ID": config.igdbClientId,
        Authorization: `Bearer ${token}`,
        "Content-Type": "text/plain",
      },
      body: `where id = ${id}; fields name,summary,rating,first_release_date,genres.name,platforms.name,cover.image_id,screenshots.image_id,url; limit 1;`,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as Array<Record<string, unknown>>;
    if (!data.length) return null;

    const games = await searchGame(String(data[0].name), 1);
    return games[0] ?? null;
  } catch {
    return null;
  }
}
