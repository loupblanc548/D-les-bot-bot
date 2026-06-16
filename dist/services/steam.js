"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPlayerSummaries = getPlayerSummaries;
exports.getOwnedGames = getOwnedGames;
exports.getCurrentlyPlaying = getCurrentlyPlaying;
exports.resolveVanityUrl = resolveVanityUrl;
exports.isValidSteamId = isValidSteamId;
const logger_1 = __importDefault(require("../utils/logger"));
// Service Steam — récupération des profils et jeux
const config_1 = require("../config");
const STEAM_API_BASE = config_1.config.steamApiBaseUrl;
// Récupère les résumés de profils Steam
async function getPlayerSummaries(steamIds) {
    if (!config_1.config.steamApiKey)
        return [];
    const ids = steamIds.join(",");
    const url = `${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v2/?key=${config_1.config.steamApiKey}&steamids=${ids}`;
    try {
        const res = await fetch(url);
        if (!res.ok) {
            logger_1.default.error("[STEAM] API GetPlayerSummaries error:", res.status);
            return [];
        }
        const data = await res.json();
        return data.response?.players || [];
    }
    catch (err) {
        logger_1.default.error("[STEAM] Fetch error:", err);
        return [];
    }
}
// Récupère les jeux possédés par un utilisateur
async function getOwnedGames(steamId) {
    if (!config_1.config.steamApiKey)
        return [];
    const url = `${STEAM_API_BASE}/IPlayerService/GetOwnedGames/v1/?key=${config_1.config.steamApiKey}&steamid=${steamId}&include_appinfo=true&include_played_free_games=true`;
    try {
        const res = await fetch(url);
        if (!res.ok) {
            logger_1.default.error("[STEAM] API GetOwnedGames error:", res.status);
            return [];
        }
        const data = await res.json();
        return data.response?.games || [];
    }
    catch (err) {
        logger_1.default.error("[STEAM] Fetch error:", err);
        return [];
    }
}
// Récupère le jeu en cours (via GetPlayerSummaries)
async function getCurrentlyPlaying(steamId) {
    const players = await getPlayerSummaries([steamId]);
    const player = players[0];
    if (!player || !player.gameextrainfo)
        return null;
    return {
        gameName: player.gameextrainfo,
        gameId: player.gameid || "",
    };
}
// Résout un Steam ID custom (vanity URL) en SteamID64
async function resolveVanityUrl(vanity) {
    if (!config_1.config.steamApiKey)
        return null;
    const url = `${STEAM_API_BASE}/ISteamUser/ResolveVanityURL/v1/?key=${config_1.config.steamApiKey}&vanityurl=${vanity}`;
    try {
        const res = await fetch(url);
        if (!res.ok)
            return null;
        const data = await res.json();
        if (data.response?.success === 1) {
            return data.response.steamid;
        }
        return null;
    }
    catch {
        return null;
    }
}
// Vérifie si un Steam ID est valide (numérique ou vanity résolu)
function isValidSteamId(id) {
    return /^\d{17}$/.test(id);
}
//# sourceMappingURL=steam.js.map