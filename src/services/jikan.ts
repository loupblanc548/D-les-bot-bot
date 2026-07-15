/**
 * jikan.ts — Service anime/manga via Jikan API (MyAnimeList, sans clé)
 *
 * Docs: https://docs.api.jikan.moe/
 * Rate limit: 3 req/s, 60 req/min
 */

import { rateLimitedFetch } from "./apiRateLimiter.js";
import logger from "../utils/logger.js";

export interface AnimeResult {
  mal_id: number;
  title: string;
  title_french?: string;
  synopsis: string;
  episodes: number | null;
  score: number | null;
  ranked: number | null;
  popularity: number | null;
  members: number;
  status: string;
  aired: { string: string };
  genres: { name: string }[];
  studios: { name: string }[];
  image_url?: string;
  trailer_url?: string;
}

export interface MangaResult {
  mal_id: number;
  title: string;
  title_french?: string;
  synopsis: string;
  chapters: number | null;
  volumes: number | null;
  score: number | null;
  ranked: number | null;
  popularity: number | null;
  members: number;
  status: string;
  published: { string: string };
  genres: { name: string }[];
  authors: { name: string }[];
  image_url?: string;
}

const BASE = "https://api.jikan.moe/v4";

export async function searchAnime(query: string, limit = 5): Promise<AnimeResult[]> {
  try {
    const url = `${BASE}/anime?q=${encodeURIComponent(query)}&limit=${limit}&order_by=score&sort=desc`;
    const res = await rateLimitedFetch("jikan", url);
    if (!res.ok) return [];
    const data = (await res.json()) as { data: AnimeResult[] };
    return data.data ?? [];
  } catch (err) {
    logger.error("[Jikan] searchAnime error:", err);
    return [];
  }
}

export async function getAnimeById(id: number): Promise<AnimeResult | null> {
  try {
    const url = `${BASE}/anime/${id}/full`;
    const res = await rateLimitedFetch("jikan", url);
    if (!res.ok) return null;
    const data = (await res.json()) as { data: AnimeResult };
    return data.data;
  } catch (err) {
    logger.error("[Jikan] getAnimeById error:", err);
    return null;
  }
}

export async function getTopAnime(page = 1): Promise<AnimeResult[]> {
  try {
    const url = `${BASE}/top/anime?page=${page}&limit=10`;
    const res = await rateLimitedFetch("jikan", url);
    if (!res.ok) return [];
    const data = (await res.json()) as { data: AnimeResult[] };
    return data.data ?? [];
  } catch (err) {
    logger.error("[Jikan] getTopAnime error:", err);
    return [];
  }
}

export async function searchManga(query: string, limit = 5): Promise<MangaResult[]> {
  try {
    const url = `${BASE}/manga?q=${encodeURIComponent(query)}&limit=${limit}&order_by=score&sort=desc`;
    const res = await rateLimitedFetch("jikan", url);
    if (!res.ok) return [];
    const data = (await res.json()) as { data: MangaResult[] };
    return data.data ?? [];
  } catch (err) {
    logger.error("[Jikan] searchManga error:", err);
    return [];
  }
}

export async function getAnimeSeason(): Promise<AnimeResult[]> {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const season = month <= 2 ? "winter" : month <= 5 ? "spring" : month <= 8 ? "summer" : "fall";
    const url = `${BASE}/seasons/${year}/${season}?limit=10`;
    const res = await rateLimitedFetch("jikan", url);
    if (!res.ok) return [];
    const data = (await res.json()) as { data: AnimeResult[] };
    return data.data ?? [];
  } catch (err) {
    logger.error("[Jikan] getAnimeSeason error:", err);
    return [];
  }
}
