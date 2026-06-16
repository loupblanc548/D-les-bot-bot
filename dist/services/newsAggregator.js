"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchAllNews = fetchAllNews;
exports.fetchNewsByCategory = fetchNewsByCategory;
exports.fetchRecentNews = fetchRecentNews;
exports.searchNews = searchNews;
exports.clearNewsCache = clearNewsCache;
const logger_1 = __importDefault(require("../utils/logger"));
const rss_parser_1 = __importDefault(require("rss-parser"));
const NEWS_SOURCES = [
    {
        name: "IGN",
        url: "https://feeds.ign.com/ign/all",
        category: "General"
    },
    {
        name: "GameSpot",
        url: "https://www.gamespot.com/feeds/news/",
        category: "General"
    },
    {
        name: "Kotaku",
        url: "https://kotaku.com/rss",
        category: "General"
    },
    {
        name: "Polygon",
        url: "https://www.polygon.com/rss/index.xml",
        category: "General"
    },
    {
        name: "Eurogamer",
        url: "https://www.eurogamer.net/?format=rss",
        category: "Europe"
    },
    {
        name: "Rock Paper Shotgun",
        url: "https://rockpapershotgun.com/feed",
        category: "PC"
    }
];
const newsCache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const parser = new rss_parser_1.default({
    timeout: 10000,
    customFields: {
        item: ['media:content', 'enclosure']
    }
});
/**
 * Récupère les news d'une source spécifique
 */
async function fetchNewsFromSource(source) {
    try {
        const feed = await parser.parseURL(source.url);
        const items = feed.items.map(item => ({
            title: item.title || "Sans titre",
            description: item.contentSnippet || item.content || "",
            link: item.link || "",
            pubDate: item.pubDate ? new Date(item.pubDate) : new Date(),
            source: source.name,
            category: source.category,
            imageUrl: extractImageUrl(item)
        }));
        logger_1.default.debug(`[NewsAggregator] ${items.length} news récupérées de ${source.name}`);
        return items;
    }
    catch (error) {
        logger_1.default.error(`[NewsAggregator] Erreur récupération ${source.name}: ${error instanceof Error ? error.message : String(error)}`);
        return [];
    }
}
/**
 * Extrait l'URL de l'image d'un item RSS
 */
function extractImageUrl(item) {
    // Essayer media:content
    if (item['media:content'] && item['media:content'].$ && item['media:content'].$.url) {
        return item['media:content'].$.url;
    }
    // Essayer enclosure
    if (item.enclosure && item.enclosure.url) {
        return item.enclosure.url;
    }
    // Essayer de trouver une image dans le content
    if (item.content) {
        const imgMatch = item.content.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (imgMatch && imgMatch[1]) {
            return imgMatch[1];
        }
    }
    return undefined;
}
/**
 * Récupère les news de toutes les sources
 */
async function fetchAllNews() {
    const now = Date.now();
    const cacheKey = "all_news";
    // Vérifier le cache
    const cached = newsCache.get(cacheKey);
    if (cached && now - (cached[0]?.pubDate.getTime() || 0) < CACHE_TTL_MS) {
        logger_1.default.debug("[NewsAggregator] Utilisation du cache");
        return cached;
    }
    // Récupérer les news de toutes les sources en parallèle
    const allNewsPromises = NEWS_SOURCES.map(source => fetchNewsFromSource(source));
    const allNewsArrays = await Promise.all(allNewsPromises);
    // Fusionner et trier par date
    const allNews = allNewsArrays.flat().sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
    // Mettre en cache
    newsCache.set(cacheKey, allNews);
    logger_1.default.info(`[NewsAggregator] ${allNews.length} news agrégées de ${NEWS_SOURCES.length} sources`);
    return allNews;
}
/**
 * Récupère les news par catégorie
 */
async function fetchNewsByCategory(category) {
    const allNews = await fetchAllNews();
    return allNews.filter(news => news.category === category);
}
/**
 * Récupère les news récentes (dernières 24h)
 */
async function fetchRecentNews(hours = 24) {
    const allNews = await fetchAllNews();
    const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000);
    return allNews.filter(news => news.pubDate >= cutoffDate);
}
/**
 * Recherche des news par mot-clé
 */
async function searchNews(keyword) {
    const allNews = await fetchAllNews();
    const lowerKeyword = keyword.toLowerCase();
    return allNews.filter(news => news.title.toLowerCase().includes(lowerKeyword) ||
        news.description.toLowerCase().includes(lowerKeyword));
}
/**
 * Nettoie le cache des news
 */
function clearNewsCache() {
    newsCache.clear();
    logger_1.default.info("[NewsAggregator] Cache nettoyé");
}
/**
 * Nettoie automatiquement le cache toutes les heures
 */
setInterval(() => {
    clearNewsCache();
}, 60 * 60 * 1000);
//# sourceMappingURL=newsAggregator.js.map