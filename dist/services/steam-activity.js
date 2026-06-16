"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.steamActivityService = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
const prisma_1 = __importDefault(require("../prisma"));
class SteamActivityService {
    apiKey = null;
    userLinks;
    activityCache;
    constructor() {
        this.apiKey = process.env.STEAM_API_KEY || null;
        this.userLinks = new Map();
        this.activityCache = new Map();
        if (this.apiKey) {
            logger_1.default.info("[SteamActivity] Service initialisé avec clé API");
        }
        else {
            logger_1.default.warn("[SteamActivity] STEAM_API_KEY non configuré, service limité");
        }
    }
    /**
     * Lie un compte Discord à un compte Steam
     */
    async linkSteamAccount(discordId, steamId) {
        try {
            // Vérifier si le compte Steam est valide
            const profile = await this.getSteamProfile(steamId);
            if (!profile) {
                logger_1.default.warn(`[SteamActivity] Profil Steam invalide: ${steamId}`);
                return false;
            }
            // Sauvegarder le lien
            const link = {
                discordId,
                steamId,
                linkedAt: Date.now(),
            };
            this.userLinks.set(discordId, link);
            await prisma_1.default.steamLink.upsert({
                where: { discordId },
                create: link,
                update: link,
            });
            logger_1.default.info(`[SteamActivity] Compte lié: ${discordId} -> ${steamId}`);
            return true;
        }
        catch (error) {
            logger_1.default.error("[SteamActivity] Erreur lors du lien du compte:", error);
            return false;
        }
    }
    /**
     * Obtient le profil Steam d'un utilisateur
     */
    async getSteamProfile(steamId) {
        if (!this.apiKey) {
            logger_1.default.warn("[SteamActivity] Clé API non configurée");
            return null;
        }
        try {
            const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${this.apiKey}&steamids=${steamId}`;
            const response = await fetch(url);
            const data = await response.json();
            if (!data.response || !data.response.players || !data.response.players[0]) {
                return null;
            }
            const player = data.response.players[0];
            return {
                steamId: player.steamid,
                personaName: player.personaname,
                avatarUrl: player.avatarfull,
                profileUrl: player.profileurl,
                lastLogoff: player.lastlogoff || 0,
            };
        }
        catch (error) {
            logger_1.default.error("[SteamActivity] Erreur lors de la récupération du profil:", error);
            return null;
        }
    }
    /**
     * Obtient les jeux d'un utilisateur Steam
     */
    async getSteamGames(steamId) {
        if (!this.apiKey) {
            logger_1.default.warn("[SteamActivity] Clé API non configurée");
            return [];
        }
        try {
            const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${this.apiKey}&steamid=${steamId}&format=json`;
            const response = await fetch(url);
            const data = await response.json();
            if (!data.response || !data.response.games) {
                return [];
            }
            const games = data.response.games.map((game) => ({
                appId: game.appid,
                name: game.name,
                playtimeForever: game.playtime_forever,
                playtime2weeks: game.playtime_2weeks,
                lastPlayed: game.rtime_last_played || 0,
            }));
            // Mettre en cache
            this.activityCache.set(steamId, games);
            return games;
        }
        catch (error) {
            logger_1.default.error("[SteamActivity] Erreur lors de la récupération des jeux:", error);
            return [];
        }
    }
    /**
     * Obtient l'activité récente d'un utilisateur
     */
    async getRecentActivity(discordId) {
        const link = this.userLinks.get(discordId);
        if (!link) {
            logger_1.default.warn(`[SteamActivity] Aucun lien Steam trouvé pour ${discordId}`);
            return {
                profile: null,
                recentGames: [],
                totalPlaytime: 0,
            };
        }
        const profile = await this.getSteamProfile(link.steamId);
        const games = await this.getSteamGames(link.steamId);
        // Filtrer les jeux joués récemment (2 dernières semaines)
        const recentGames = games
            .filter(game => game.playtime2weeks > 0)
            .sort((a, b) => b.playtime2weeks - a.playtime2weeks)
            .slice(0, 10);
        const totalPlaytime = games.reduce((sum, game) => sum + game.playtimeForever, 0);
        return {
            profile,
            recentGames,
            totalPlaytime,
        };
    }
    /**
     * Corrèle l'activité Steam avec l'activité Discord
     */
    async correlateActivity(discordId, discordActivity) {
        const steamActivity = await this.getRecentActivity(discordId);
        if (!steamActivity.profile || steamActivity.recentGames.length === 0) {
            return {
                correlation: 0,
                insights: ["Pas d'activité Steam récente détectée"],
            };
        }
        const insights = [];
        let correlation = 0;
        // Vérifier si l'utilisateur est actif sur Discord quand il joue
        const timeSinceLastPlayed = Date.now() - steamActivity.recentGames[0].lastPlayed;
        const timeSinceLastDiscord = Date.now() - discordActivity.lastActive;
        if (timeSinceLastPlayed < 3600000 && timeSinceLastDiscord < 3600000) {
            correlation += 0.5;
            insights.push("Activité Discord et Steam simultanée détectée");
        }
        // Vérifier si les channels Discord correspondent aux jeux joués
        const gameNames = steamActivity.recentGames.map(g => g.name.toLowerCase());
        const channelNames = discordActivity.activeChannels.map(c => c.toLowerCase());
        const matchingChannels = channelNames.filter(channel => gameNames.some(game => channel.includes(game) || game.includes(channel)));
        if (matchingChannels.length > 0) {
            correlation += 0.3 * matchingChannels.length;
            insights.push(`Corrélation trouvée dans ${matchingChannels.length} channel(s)`);
        }
        // Vérifier l'intensité de l'activité
        if (discordActivity.messageCount > 50 && steamActivity.totalPlaytime > 100) {
            correlation += 0.2;
            insights.push("Utilisateur très actif sur Discord et Steam");
        }
        return {
            correlation: Math.min(correlation, 1),
            insights,
        };
    }
    /**
     * Charge les liens depuis Prisma
     */
    async loadLinksFromPrisma() {
        const links = await prisma_1.default.steamLink.findMany();
        for (const link of links) {
            this.userLinks.set(link.discordId, link);
        }
        logger_1.default.info(`[SteamActivity] ${links.length} lien(s) chargé(s) depuis Prisma`);
    }
    /**
     * Obtient tous les utilisateurs liés
     */
    getLinkedUsers() {
        return Array.from(this.userLinks.values());
    }
    /**
     * Supprime un lien
     */
    async unlinkSteamAccount(discordId) {
        try {
            this.userLinks.delete(discordId);
            await prisma_1.default.steamLink.delete({
                where: { discordId },
            });
            logger_1.default.info(`[SteamActivity] Lien supprimé pour ${discordId}`);
            return true;
        }
        catch (error) {
            logger_1.default.error("[SteamActivity] Erreur lors de la suppression du lien:", error);
            return false;
        }
    }
    /**
     * Obtient les statistiques globales
     */
    getGlobalStats() {
        const links = Array.from(this.userLinks.values());
        const allGames = Array.from(this.activityCache.values()).flat();
        const averagePlaytime = allGames.length > 0
            ? allGames.reduce((sum, game) => sum + game.playtimeForever, 0) / allGames.length
            : 0;
        return {
            totalLinks: links.length,
            totalGamesTracked: allGames.length,
            averagePlaytime,
        };
    }
}
exports.steamActivityService = new SteamActivityService();
//# sourceMappingURL=steam-activity.js.map