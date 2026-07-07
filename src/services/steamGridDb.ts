/**
 * steamGridDb.ts — SteamGridDB API integration for game covers and banners.
 *
 * Provides high-quality game art: grid covers, heroes, logos, icons.
 * Used to enhance Discord embeds with professional game artwork.
 *
 * Free tier: unlimited requests with API key.
 */

import logger from "../utils/logger.js";
import { config } from "../config.js";

const BASE_URL = "https://www.steamgriddb.com/api/v2";

export function isSteamGridDbAvailable(): boolean {
  return !!config.steamgriddbApiKey;
}

export interface GameArt {
  id: number;
  url: string;
  type: "grid" | "hero" | "logo" | "icon";
  width: number | null;
  height: number | null;
  score: number;
}

export async function searchGameByName(name: string): Promise<number | null> {
  if (!isSteamGridDbAvailable()) return null;

  try {
    const res = await fetch(
      `${BASE_URL}/search/autocomplete/${encodeURIComponent(name)}`,
      {
        headers: { Authorization: `Bearer ${config.steamgriddbApiKey}` },
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!res.ok) {
      logger.warn(`[SteamGridDB] Search HTTP ${res.status}`);
      return null;
    }

    const data = (await res.json()) as {
      success: boolean;
      data: Array<{ id: number; name: string }>;
    };

    return data.data?.[0]?.id ?? null;
  } catch (error) {
    logger.warn(`[SteamGridDB] Search error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export async function getGameGrids(gameId: number): Promise<GameArt[]> {
  if (!isSteamGridDbAvailable()) return [];

  try {
    const res = await fetch(`${BASE_URL}/grids/game/${gameId}`, {
      headers: { Authorization: `Bearer ${config.steamgriddbApiKey}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return [];

    const data = (await res.json()) as {
      success: boolean;
      data: Array<{
        id: number;
        url: string;
        width: number;
        height: number;
        score: number;
      }>;
    };

    return (data.data ?? []).map((g) => ({
      id: g.id,
      url: g.url,
      type: "grid" as const,
      width: g.width,
      height: g.height,
      score: g.score,
    }));
  } catch {
    return [];
  }
}

export async function getGameHeroes(gameId: number): Promise<GameArt[]> {
  if (!isSteamGridDbAvailable()) return [];

  try {
    const res = await fetch(`${BASE_URL}/heroes/game/${gameId}`, {
      headers: { Authorization: `Bearer ${config.steamgriddbApiKey}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return [];

    const data = (await res.json()) as {
      success: boolean;
      data: Array<{
        id: number;
        url: string;
        width: number;
        height: number;
        score: number;
      }>;
    };

    return (data.data ?? []).map((g) => ({
      id: g.id,
      url: g.url,
      type: "hero" as const,
      width: g.width,
      height: g.height,
      score: g.score,
    }));
  } catch {
    return [];
  }
}

export async function getGameLogos(gameId: number): Promise<GameArt[]> {
  if (!isSteamGridDbAvailable()) return [];

  try {
    const res = await fetch(`${BASE_URL}/logos/game/${gameId}`, {
      headers: { Authorization: `Bearer ${config.steamgriddbApiKey}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return [];

    const data = (await res.json()) as {
      success: boolean;
      data: Array<{ id: number; url: string; score: number }>;
    };

    return (data.data ?? []).map((g) => ({
      id: g.id,
      url: g.url,
      type: "logo" as const,
      width: null,
      height: null,
      score: g.score,
    }));
  } catch {
    return [];
  }
}

export async function getBestArt(
  gameName: string,
  type: "grid" | "hero" | "logo" = "grid",
): Promise<string | null> {
  const gameId = await searchGameByName(gameName);
  if (!gameId) return null;

  let arts: GameArt[];
  if (type === "hero") arts = await getGameHeroes(gameId);
  else if (type === "logo") arts = await getGameLogos(gameId);
  else arts = await getGameGrids(gameId);

  if (arts.length === 0) return null;

  arts.sort((a, b) => b.score - a.score);
  return arts[0].url;
}
