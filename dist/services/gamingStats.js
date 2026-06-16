"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPSNProfile = getPSNProfile;
exports.getXboxProfile = getXboxProfile;
exports.getPSNGameStats = getPSNGameStats;
exports.getXboxGameStats = getXboxGameStats;
exports.formatPSNStats = formatPSNStats;
exports.formatXboxStats = formatXboxStats;
exports.clearProfileCache = clearProfileCache;
const logger_1 = __importDefault(require("../utils/logger"));
const psnCache = new Map();
const xboxCache = new Map();
/**
 * Récupère le profil PSN d'un joueur
 */
async function getPSNProfile(onlineId) {
    try {
        const cached = psnCache.get(onlineId);
        if (cached && Date.now() - cached.lastChecked < 30 * 60 * 1000) {
            return cached;
        }
        // PlayStation Network API nécessite authentification
        // Pour l'instant, retourner null (nécessiterait API tierce comme psn-api)
        logger_1.default.warn(`[GamingStats] PSN API non disponible pour ${onlineId}`);
        return null;
    }
    catch (error) {
        logger_1.default.error(`[GamingStats] Erreur récupération PSN ${onlineId}: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}
/**
 * Récupère le profil Xbox d'un joueur
 */
async function getXboxProfile(gamertag) {
    try {
        const cached = xboxCache.get(gamertag);
        if (cached && Date.now() - cached.lastChecked < 30 * 60 * 1000) {
            return cached;
        }
        // Xbox Live API nécessite authentification
        // Pour l'instant, retourner null (nécessiterait API tierce comme xbox-web-api)
        logger_1.default.warn(`[GamingStats] Xbox API non disponible pour ${gamertag}`);
        return null;
    }
    catch (error) {
        logger_1.default.error(`[GamingStats] Erreur récupération Xbox ${gamertag}: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}
/**
 * Récupère les stats d'un jeu spécifique sur PSN
 */
async function getPSNGameStats(onlineId, gameId) {
    try {
        // PlayStation Network API nécessite authentification
        logger_1.default.warn(`[GamingStats] PSN Game Stats API non disponible pour ${onlineId}/${gameId}`);
        return null;
    }
    catch (error) {
        logger_1.default.error(`[GamingStats] Erreur récupération stats PSN ${onlineId}/${gameId}: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}
/**
 * Récupère les stats d'un jeu spécifique sur Xbox
 */
async function getXboxGameStats(gamertag, gameId) {
    try {
        // Xbox Live API nécessite authentification
        logger_1.default.warn(`[GamingStats] Xbox Game Stats API non disponible pour ${gamertag}/${gameId}`);
        return null;
    }
    catch (error) {
        logger_1.default.error(`[GamingStats] Erreur récupération stats Xbox ${gamertag}/${gameId}: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}
/**
 * Formate les stats PSN pour affichage Discord
 */
function formatPSNStats(profile) {
    const totalTrophies = profile.trophyCount.bronze + profile.trophyCount.silver + profile.trophyCount.gold + profile.trophyCount.platinum;
    return `🎮 **Profil PSN: ${profile.onlineId}**
${profile.isOnline ? "🟢 En ligne" : "🔴 Hors ligne"}
⭐ Niveau: ${profile.level} (${profile.progress}%)
🏆 Trophées: ${totalTrophies}
  🥉 Bronze: ${profile.trophyCount.bronze}
  🥈 Argent: ${profile.trophyCount.silver}
  🥇 Or: ${profile.trophyCount.gold}
  💎 Platine: ${profile.trophyCount.platinum}`;
}
/**
 * Formate les stats Xbox pour affichage Discord
 */
function formatXboxStats(profile) {
    return `🎮 **Profil Xbox: ${profile.gamertag}**
${profile.isOnline ? "🟢 En ligne" : "🔴 Hors ligne"}
🏆 Gamerscore: ${profile.gamerscore}
⭐ Tier: ${profile.tier}`;
}
/**
 * Nettoie le cache des profils
 */
function clearProfileCache() {
    psnCache.clear();
    xboxCache.clear();
    logger_1.default.info("[GamingStats] Cache des profils nettoyé");
}
// Nettoyage automatique toutes les heures
setInterval(clearProfileCache, 60 * 60 * 1000);
//# sourceMappingURL=gamingStats.js.map