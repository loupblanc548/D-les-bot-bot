import { SteamApiResponse, SteamPlayerSummaries, SteamOwnedGames, SteamVanityResponse } from "../types/api";
import logger from "../utils/logger";
// Service Steam — récupération des profils et jeux
import { config } from "../config";

const STEAM_API_BASE = config.steamApiBaseUrl;

// Récupère les résumés de profils Steam
export async function getPlayerSummaries(steamIds: string[]): Promise<any[]> {
  if (!config.steamApiKey) return [];

  const ids = steamIds.join(",");
  const url = `${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v2/?key=${config.steamApiKey}&steamids=${ids}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      logger.error("[STEAM] API GetPlayerSummaries error:", res.status);
      return [];
    }
    const data = await res.json() as SteamApiResponse<SteamPlayerSummaries>;
    return data.response?.players || [];
  } catch (err) {
    logger.error("[STEAM] Fetch error:", err);
    return [];
  }
}

// Récupère les jeux possédés par un utilisateur
export async function getOwnedGames(steamId: string): Promise<any[]> {
  if (!config.steamApiKey) return [];

  const url = `${STEAM_API_BASE}/IPlayerService/GetOwnedGames/v1/?key=${config.steamApiKey}&steamid=${steamId}&include_appinfo=true&include_played_free_games=true`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      logger.error("[STEAM] API GetOwnedGames error:", res.status);
      return [];
    }
    const data = await res.json() as SteamApiResponse<SteamOwnedGames>;
    return data.response?.games || [];
  } catch (err) {
    logger.error("[STEAM] Fetch error:", err);
    return [];
  }
}

// Récupère le jeu en cours (via GetPlayerSummaries)
export async function getCurrentlyPlaying(steamId: string): Promise<{ gameName: string; gameId: string } | null> {
  const players = await getPlayerSummaries([steamId]);
  const player = players[0];
  if (!player || !player.gameextrainfo) return null;
  return {
    gameName: player.gameextrainfo,
    gameId: player.gameid || "",
  };
}

// Résout un Steam ID custom (vanity URL) en SteamID64
export async function resolveVanityUrl(vanity: string): Promise<string | null> {
  if (!config.steamApiKey) return null;

  const url = `${STEAM_API_BASE}/ISteamUser/ResolveVanityURL/v1/?key=${config.steamApiKey}&vanityurl=${vanity}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json() as SteamApiResponse<SteamVanityResponse>;
    if (data.response?.success === 1) {
      return data.response.steamid || null;
    }
    return null;
  } catch {
    return null;
  }
}

// Vérifie si un Steam ID est valide (numérique ou vanity résolu)
export function isValidSteamId(id: string): boolean {
  return /^\d{17}$/.test(id);
}
