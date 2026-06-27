/**
 * igdb.ts — Integration IGDB (Internet Game Database) API.
 *
 * Base de donnees jeux video gratuite (proposee par Twitch).
 * Plus complete que RAWG: dates de sortie, genres, screenshots, notes.
 *
 * Prerequis:
 *   1. Creer une app Twitch sur https://dev.twitch.tv/console
 *   2. Definir TWITCH_CLIENT_ID et TWITCH_CLIENT_SECRET dans .env
 *   3. Le token est gere automatiquement (refresh toutes les 24h)
 *
 * Si les credentials ne sont pas configures, no-op.
 */

import logger from "./logger.js";

const CLIENT_ID = process.env.TWITCH_CLIENT_ID || "";
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || "";
const IGDB_BASE = "https://api.igdb.com/v4";

let accessToken: string | null = null;
let tokenExpiresAt = 0;

interface IGDBGame {
  id: number;
  name: string;
  summary?: string;
  first_release_date?: number;
  rating?: number;
  genres?: { name: string }[];
  cover?: { image_id: string };
  screenshots?: { image_id: string }[];
  platforms?: { name: string }[];
}

export interface GameInfo {
  name: string;
  summary: string;
  releaseDate: string | null;
  rating: number | null;
  genres: string[];
  coverUrl: string | null;
  platforms: string[];
}

async function getAccessToken(): Promise<string | null> {
  if (accessToken && Date.now() < tokenExpiresAt) return accessToken;
  if (!CLIENT_ID || !CLIENT_SECRET) return null;

  try {
    const res = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=client_credentials`,
      { method: "POST" },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token: string; expires_in: number };
    accessToken = data.access_token;
    tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
    logger.info("[IGDB] Token obtenu");
    return accessToken;
  } catch (err) {
    logger.error(`[IGDB] Erreur token: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Recherche un jeu par nom sur IGDB.
 * Retourne null si l'API n'est pas configuree ou si aucun resultat.
 */
export async function searchGame(query: string): Promise<GameInfo | null> {
  const token = await getAccessToken();
  if (!token) return null;

  try {
    const res = await fetch(`${IGDB_BASE}/games`, {
      method: "POST",
      headers: {
        "Client-ID": CLIENT_ID,
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      body: `search "${query.replace(/"/g, "")}"; fields name,summary,first_release_date,rating,genres.name,cover.image_id,screenshots.image_id,platforms.name; limit 1;`,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return null;
    const games = (await res.json()) as IGDBGame[];
    if (!games || games.length === 0) return null;

    const g = games[0];
    return {
      name: g.name,
      summary: g.summary || "Aucun description disponible.",
      releaseDate: g.first_release_date
        ? new Date(g.first_release_date * 1000).toLocaleDateString("fr-FR")
        : null,
      rating: g.rating ? Math.round(g.rating) : null,
      genres: g.genres?.map((x) => x.name) || [],
      coverUrl: g.cover?.image_id
        ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg`
        : null,
      platforms: g.platforms?.map((x) => x.name) || [],
    };
  } catch (err) {
    logger.debug(`[IGDB] Erreur recherche: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
