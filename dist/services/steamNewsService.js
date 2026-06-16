"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncSteamApps = syncSteamApps;
exports.findAppIdByName = findAppIdByName;
exports.getLatestNews = getLatestNews;
exports.getLatestNewsForApps = getLatestNewsForApps;
const axios_1 = __importDefault(require("axios"));
const config_1 = require("../config");
const logger_1 = __importDefault(require("../utils/logger"));
const redis_1 = require("../utils/redis");
// ─── Constantes ───────────────────────────────────────────────────────────────
const STEAM_APP_LIST_KEY = "steam:applist";
const STEAM_APP_LIST_TTL = 86400; // 24 heures
// ─── BBCode Cleaner ───────────────────────────────────────────────────────────
function cleanBBCode(text) {
    return text
        .replace(/\[\/?list\]/gi, "")
        .replace(/\[\/?olist\]/gi, "")
        .replace(/\[\/?table(?:=[^\]]*)?\]/gi, "")
        .replace(/\[\/?tr\]/gi, "")
        .replace(/\[\/?td\]/gi, "")
        .replace(/\[\/?th\]/gi, "")
        .replace(/\[\/?h[1-6]\]/gi, "")
        .replace(/\[\*\]/g, "• ")
        .replace(/\[b\](.*?)\[\/b\]/gi, "**$1**")
        .replace(/\[i\](.*?)\[\/i\]/gi, "*$1*")
        .replace(/\[u\](.*?)\[\/u\]/gi, "__$1__")
        .replace(/\[s\](.*?)\[\/s\]/gi, "~~$1~~")
        .replace(/\[url=([^\]]*)\](.*?)\[\/url\]/gi, "$2 ($1)")
        .replace(/\[url\](.*?)\[\/url\]/gi, "$1")
        .replace(/\[img\](.*?)\[\/img\]/gi, "[Image: $1]")
        .replace(/\[quote(?:=[^\]]*)?\](.*?)\[\/quote\]/gis, "> $1")
        .replace(/\[code\](.*?)\[\/code\]/gis, "```\n$1\n```")
        .replace(/\[spoiler\](.*?)\[\/spoiler\]/gi, "||$1||")
        .replace(/\[\/?\w+(?:=[^\]]*)?\]/gi, "") // Nettoyer les balises résiduelles
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}
// ─── Synchronisation de la liste des apps Steam ───────────────────────────────
async function syncSteamApps() {
    const cached = await (0, redis_1.getCache)(STEAM_APP_LIST_KEY);
    if (cached && cached.length > 0) {
        return cached;
    }
    try {
        logger_1.default.info("[SteamNews] Téléchargement de la liste des apps Steam...");
        const response = await axios_1.default.get("https://api.steampowered.com/ISteamApps/GetAppList/v2/", { timeout: 30000 });
        const apps = response.data?.applist?.apps ?? [];
        if (apps.length === 0) {
            logger_1.default.warn("[SteamNews] Liste des apps vide, conservation de l'ancien cache");
            return cached ?? [];
        }
        await (0, redis_1.setCache)(STEAM_APP_LIST_KEY, apps, STEAM_APP_LIST_TTL);
        logger_1.default.info(`[SteamNews] ✓ ${apps.length.toLocaleString()} apps Steam indexées en cache`);
        return apps;
    }
    catch (error) {
        logger_1.default.error("[SteamNews] Erreur synchronisation apps:", String(error));
        return cached ?? [];
    }
}
// ─── Recherche d'AppID par nom ────────────────────────────────────────────────
async function findAppIdByName(gameName) {
    const apps = await syncSteamApps();
    if (apps.length === 0)
        return null;
    const query = gameName.toLowerCase().trim();
    // Stratégie de matching en plusieurs passes
    const scored = apps
        .map((app) => {
        const name = app.name.toLowerCase();
        let score = 0;
        // Match exact (priorité maximale)
        if (name === query)
            score = 1000;
        // Commence par la requête
        else if (name.startsWith(query))
            score = 500;
        // Contient la requête comme mot complet
        else if (new RegExp(`\b${escapeRegex(query)}\b`).test(name))
            score = 300;
        // Contient la requête partiellement
        else if (name.includes(query))
            score = 100;
        // Match fuzzy : chaque mot de la requête présent dans le nom
        else {
            const queryWords = query.split(/\s+/);
            const matchCount = queryWords.filter((w) => name.includes(w)).length;
            if (matchCount === queryWords.length)
                score = 50;
            else if (matchCount > 0)
                score = matchCount * 10;
        }
        return { appid: app.appid, name: app.name, score };
    })
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score);
    return scored[0] ?? null;
}
function escapeRegex(str) {
    // Utilise le constructeur RegExp pour éviter les problèmes de parsing TypeScript avec ${} dans les regex
    const ESCAPE_REGEX = new RegExp('[.*+?^\${}()|[\]\]', 'g');
    return str.replace(ESCAPE_REGEX, '$&');
}
// ─── Récupération des dernières news ──────────────────────────────────────────
async function getLatestNews(appId) {
    try {
        const url = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=${appId}&count=1&maxlength=1500&format=json`;
        const response = await axios_1.default.get(url, {
            timeout: config_1.config.steamTimeoutMs,
        });
        const newsItems = response.data?.appnews?.newsitems ?? [];
        if (newsItems.length === 0)
            return null;
        const item = newsItems[0];
        return {
            title: item.title,
            url: item.url || `https://store.steampowered.com/news/app/${appId}`,
            content: cleanBBCode(item.contents),
            date: new Date(item.date * 1000),
            gid: item.gid,
            appId: item.appid,
            author: item.author,
            feedLabel: item.feedlabel,
        };
    }
    catch (error) {
        logger_1.default.warn(`[SteamNews] Erreur récupération news pour appId ${appId}:`, String(error));
        return null;
    }
}
// ─── Helper : Récupération multiple (pour le cron) ────────────────────────────
async function getLatestNewsForApps(appIds) {
    const results = new Map();
    for (const appId of appIds) {
        const news = await getLatestNews(appId);
        if (news)
            results.set(appId, news);
    }
    return results;
}
//# sourceMappingURL=steamNewsService.js.map