"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLATFORM_LABELS = exports.PLATFORM_ICONS = exports.PLATFORM_COLORS = void 0;
exports.parseRssItems = parseRssItems;
exports.sendToChannel = sendToChannel;
exports.logError = logError;
exports.runGamingFeeds = runGamingFeeds;
exports.runStartupRetrospective = runStartupRetrospective;
const logger_1 = __importDefault(require("../utils/logger"));
const discord_js_1 = require("discord.js");
const image_helpers_1 = require("../utils/image-helpers");
const prisma_1 = __importDefault(require("../prisma"));
const url_cleaner_1 = require("../utils/url-cleaner");
const config_1 = require("../config");
const youtube_1 = require("./youtube");
const epicgames_1 = require("./epicgames");
const gaming_embeds_1 = require("../utils/gaming-embeds");
const rss_parser_1 = require("../utils/rss-parser");
Object.defineProperty(exports, "PLATFORM_COLORS", { enumerable: true, get: function () { return rss_parser_1.PLATFORM_COLORS; } });
Object.defineProperty(exports, "PLATFORM_ICONS", { enumerable: true, get: function () { return rss_parser_1.PLATFORM_ICONS; } });
Object.defineProperty(exports, "PLATFORM_LABELS", { enumerable: true, get: function () { return rss_parser_1.PLATFORM_LABELS; } });
const FEEDS = [
    {
        channelId: config_1.config.fortniteChannel,
        channelName: "Fortnite",
        sources: [
            { platform: "twitter", handle: "FortniteFR" },
            { platform: "twitter", handle: "FortniteGame" },
            { platform: "youtube", handle: "Fortnite" },
            { platform: "twitter", handle: "HYPEX" },
            { platform: "twitter", handle: "ShiinaBR" },
            { platform: "youtube", handle: "ShiinaBR" },
        ],
    },
    {
        channelId: config_1.config.nintendoChannel,
        channelName: "Nintendo",
        sources: [
            { platform: "twitter", handle: "NintendoFrance" },
            { platform: "youtube", handle: "NintendoFR" },
        ],
    },
    {
        channelId: config_1.config.playstationChannel,
        channelName: "PlayStation",
        sources: [
            { platform: "twitter", handle: "PlayStationFR" },
            { platform: "youtube", handle: "PlayStationFrance" },
            { platform: "blog", handle: "PlayStationBlog", blogUrl: "https://blog.fr.playstation.com/feed/" },
        ],
    },
    {
        channelId: config_1.config.xboxChannel,
        channelName: "Xbox",
        sources: [
            { platform: "twitter", handle: "XboxFR" },
            { platform: "youtube", handle: "XboxFR" },
        ],
    },
    {
        channelId: config_1.config.robloxChannel,
        channelName: "Roblox",
        sources: [
            { platform: "twitter", handle: "Roblox" },
            { platform: "youtube", handle: "Roblox" },
            { platform: "blog", handle: "RobloxBlog", blogUrl: "https://blog.roblox.com/feed/" },
        ],
    },
];
const FETCH_RSS_TTL_MS = config_1.config.rssCacheTtlMs;
const rssCache = new Map();
let rssLastSweep = 0;
const RSS_SWEEP_COOLDOWN_MS = 60_000;
function sweepRssCache() {
    const now = Date.now();
    if (now - rssLastSweep < RSS_SWEEP_COOLDOWN_MS)
        return;
    rssLastSweep = now;
    for (const [key, { ts }] of rssCache) {
        if (now - ts >= FETCH_RSS_TTL_MS)
            rssCache.delete(key);
    }
}
async function cachedFetchRss(url, needHeaders) {
    const key = (needHeaders ? "h:" : "") + url;
    const cached = rssCache.get(key);
    if (cached && Date.now() - cached.ts < FETCH_RSS_TTL_MS) {
        return Promise.resolve(cached.data);
    }
    try {
        const response = await fetch(url, needHeaders ? { headers: rss_parser_1.RSS_HEADERS } : undefined);
        if (!response.ok) {
            rssCache.set(key, { data: null, ts: Date.now() });
            return null;
        }
        const data = await response.text();
        sweepRssCache();
        rssCache.set(key, { data, ts: Date.now() });
        return data;
    }
    catch {
        sweepRssCache();
        rssCache.set(key, { data: null, ts: Date.now() });
        return null;
    }
}
async function fetchRss(url, needHeaders = false) {
    return cachedFetchRss(url, needHeaders);
}
function parseRssItems(xml) {
    try {
        const parsed = rss_parser_1.xmlParser.parse(xml);
        const rawItems = parsed.rss?.channel?.item || parsed.feed?.entry;
        if (!rawItems)
            return [];
        const list = Array.isArray(rawItems) ? rawItems : [rawItems];
        return list.map((item) => ({
            title: (0, rss_parser_1.textOf)(item.title).trim(),
            url: (0, rss_parser_1.extractLink)(item.link).trim(),
            thumbnail: (0, image_helpers_1.extractMediaThumbnail)(item),
        })).filter(i => i.title && i.url);
    }
    catch (error) {
        logger_1.default.error('[Feeds] Erreur lors du parsing RSS:', error);
        return [];
    }
}
async function checkTwitterSource(handle) {
    const url = `https://${new URL(config_1.config.xcancelBaseUrl).hostname}/` + handle + "/rss";
    const xml = await fetchRss(url, true);
    if (!xml || xml.includes("RSS reader not yet whitelisted"))
        return null;
    const items = parseRssItems(xml);
    return items[0] || null;
}
async function checkYouTubeSource(handle) {
    const rssUrl = await (0, youtube_1.getYouTubeRssUrl)(handle);
    if (!rssUrl) {
        const fallbackXml = await fetchRss("https://www.youtube.com/feeds/videos.xml?user=" + handle);
        if (fallbackXml) {
            const items = parseRssItems(fallbackXml);
            return items[0] || null;
        }
        return null;
    }
    const xml = await fetchRss(rssUrl);
    if (!xml)
        return null;
    const items = parseRssItems(xml);
    return items[0] || null;
}
async function checkBlogSource(blogUrl) {
    const xml = await fetchRss(blogUrl);
    if (!xml)
        return null;
    const items = parseRssItems(xml);
    return items[0] || null;
}
async function checkTwitterSourceMulti(handle, limit = 3) {
    const url = `https://${new URL(config_1.config.xcancelBaseUrl).hostname}/` + handle + "/rss";
    const xml = await fetchRss(url, true);
    if (!xml || xml.includes("RSS reader not yet whitelisted"))
        return [];
    const items = parseRssItems(xml);
    return items.slice(0, limit);
}
async function checkYouTubeSourceMulti(handle, limit = 3) {
    const rssUrl = await (0, youtube_1.getYouTubeRssUrl)(handle);
    let xml = null;
    if (rssUrl) {
        xml = await fetchRss(rssUrl);
    }
    if (!xml) {
        xml = await fetchRss("https://www.youtube.com/feeds/videos.xml?user=" + handle);
    }
    if (!xml)
        return [];
    const items = parseRssItems(xml);
    return items.slice(0, limit);
}
async function checkBlogSourceMulti(blogUrl, limit = 3) {
    const xml = await fetchRss(blogUrl);
    if (!xml)
        return [];
    const items = parseRssItems(xml);
    return items.slice(0, limit);
}
/**
 * Tente d'insérer une notification en base.
 * Utilise la contrainte d'unicité sur l'URL comme bouclier anti-doublon.
 *
 * @returns true si la notification est nouvelle (insérée avec succès)
 * @returns false si l'URL existe déjà (doublon, erreur P2002)
 */
async function tryInsertNotification(sourceId, platform, content, url) {
    const cleanedUrl = (0, url_cleaner_1.cleanUrl)(url);
    if (!cleanedUrl)
        return false;
    try {
        await prisma_1.default.notification.upsert({
            where: { url: cleanedUrl },
            update: {},
            create: {
                sourceId,
                platform,
                content,
                url: cleanedUrl,
            },
        });
        return true; // Nouveau contenu, insertion réussie
    }
    catch (err) {
        // Autre erreur : on laisse passer pour ne pas bloquer le flux
        logger_1.default.error(`[Feeds] Erreur insertion notification: ${err instanceof Error ? err.message : String(err)}`, { stack: err instanceof Error ? err.stack : undefined });
        return false;
    }
}
async function sendToChannel(client, channelId, embed) {
    try {
        const channel = client.channels.cache.get(channelId);
        if (channel?.isTextBased()) {
            await channel.send({ embeds: [embed] });
            return true;
        }
        return false;
    }
    catch {
        return false;
    }
}
async function logError(client, module, error) {
    if (!config_1.config.logChannel)
        return;
    try {
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle("⚠️ Erreur système")
            .setColor(0xff3344)
            .addFields({ name: "Module", value: module, inline: true }, { name: "Timestamp", value: new Date().toISOString(), inline: true }, { name: "Message", value: error.slice(0, 1024) })
            .setTimestamp();
        await sendToChannel(client, config_1.config.logChannel, embed);
    }
    catch {
        logger_1.default.error("[LogError] Impossible d'écrire dans le salon de logs");
    }
}
async function runGamingFeeds(client) {
    logger_1.default.info("[Feeds] Vérification des comptes gaming...");
    for (const feed of FEEDS) {
        if (!feed.channelId)
            continue;
        for (const source of feed.sources) {
            try {
                let result = null;
                if (source.platform === "twitter") {
                    result = await checkTwitterSource(source.handle);
                }
                else if (source.platform === "youtube") {
                    result = await checkYouTubeSource(source.handle);
                }
                else if (source.platform === "blog" && source.blogUrl) {
                    result = await checkBlogSource(source.blogUrl);
                }
                if (!result || !result.url)
                    continue;
                const isNewNotif = await tryInsertNotification("gaming-feed", source.platform, result.title, result.url);
                if (!isNewNotif)
                    continue;
                const icon = rss_parser_1.PLATFORM_ICONS[source.platform] || "📡";
                const label = rss_parser_1.PLATFORM_LABELS[source.platform] || "";
                const embedTitle = label
                    ? icon + " " + result.title + " — " + label
                    : icon + " " + result.title;
                const embed = new discord_js_1.EmbedBuilder()
                    .setTitle(embedTitle)
                    .setURL(result.url)
                    .setColor(rss_parser_1.PLATFORM_COLORS[source.platform] || 0x5865f2)
                    .addFields({ name: "Source", value: "@" + source.handle + " (" + source.platform + ")", inline: true }, { name: "Salon", value: feed.channelName, inline: true })
                    .setTimestamp();
                try {
                    if (source.platform === "youtube") {
                        const thumb = result.thumbnail || await (0, image_helpers_1.getYouTubeThumbnail)(result.url);
                        if (thumb)
                            embed.setImage(thumb);
                    }
                    else if (source.platform === "twitter") {
                        const og = await (0, image_helpers_1.getTweetImage)(result.url);
                        if (og)
                            embed.setImage(og);
                    }
                    else if (source.platform === "blog") {
                        const img = await (0, image_helpers_1.getBlogImage)(result.url);
                        if (img)
                            embed.setImage(img);
                    }
                }
                catch { }
                const sent = await sendToChannel(client, feed.channelId, embed);
                if (sent) {
                    logger_1.default.info("[Feeds] OK " + feed.channelName + " <- @" + source.handle);
                }
            }
            catch (err) {
                const errMsg = String(err);
                logger_1.default.error("[Feeds] ERR " + feed.channelName + "/" + source.handle + ": " + errMsg);
                await logError(client, "Feeds/" + feed.channelName + "/" + source.handle, errMsg);
            }
        }
    }
    logger_1.default.info("[Feeds] Vérification terminée");
}
async function runStartupRetrospective(client) {
    logger_1.default.info("");
    logger_1.default.info("=".repeat(50));
    logger_1.default.info("  RETROSPECTIVE DE DEMARRAGE - Rattrapage");
    logger_1.default.info("=".repeat(50));
    let totalPublished = 0;
    const MAX_RETRO_POSTS = config_1.config.maxRetroPosts;
    feedLoop: for (const feed of FEEDS) {
        if (!feed.channelId)
            continue;
        for (const source of feed.sources) {
            try {
                let items = [];
                if (source.platform === "twitter") {
                    items = await checkTwitterSourceMulti(source.handle, 3);
                }
                else if (source.platform === "youtube") {
                    items = await checkYouTubeSourceMulti(source.handle, 3);
                }
                else if (source.platform === "blog" && source.blogUrl) {
                    items = await checkBlogSourceMulti(source.blogUrl, 3);
                }
                let publishedForSource = 0;
                for (const item of items) {
                    if (!item.url)
                        continue;
                    const isNewRetroNotif = await tryInsertNotification("gaming-feed", source.platform, item.title, item.url);
                    if (!isNewRetroNotif)
                        continue;
                    const icon = rss_parser_1.PLATFORM_ICONS[source.platform] || "📡";
                    const label = rss_parser_1.PLATFORM_LABELS[source.platform] || "";
                    const embedTitle = label
                        ? icon + " " + item.title + " — " + label
                        : icon + " " + item.title;
                    const embed = new discord_js_1.EmbedBuilder()
                        .setTitle(embedTitle)
                        .setURL(item.url)
                        .setColor(rss_parser_1.PLATFORM_COLORS[source.platform] || 0x5865f2)
                        .addFields({ name: "Source", value: "@" + source.handle + " (" + source.platform + ")", inline: true }, { name: "Salon", value: feed.channelName, inline: true }, { name: "Note", value: "📌 Rattrapage (publié pendant l'arrêt du bot)", inline: false })
                        .setTimestamp();
                    try {
                        if (source.platform === "youtube") {
                            const thumb = item.thumbnail || await (0, image_helpers_1.getYouTubeThumbnail)(item.url);
                            if (thumb)
                                embed.setImage(thumb);
                        }
                        else if (source.platform === "twitter") {
                            const og = await (0, image_helpers_1.getTweetImage)(item.url);
                            if (og)
                                embed.setImage(og);
                        }
                        else if (source.platform === "blog") {
                            const img = await (0, image_helpers_1.getBlogImage)(item.url);
                            if (img)
                                embed.setImage(img);
                        }
                    }
                    catch (error) {
                        logger_1.default.error('[Feeds] Erreur lors de la récupération de l\'image:', error);
                    }
                    const sent = await sendToChannel(client, feed.channelId, embed);
                    if (sent) {
                        publishedForSource++;
                        totalPublished++;
                        if (totalPublished >= MAX_RETRO_POSTS) {
                            logger_1.default.info("[Retro] Cap global atteint (" + MAX_RETRO_POSTS + " publications)");
                            break feedLoop;
                        }
                    }
                }
                if (publishedForSource > 0) {
                    logger_1.default.info(`[Retro] ${feed.channelName}/@${source.handle}: ${publishedForSource} rattrapage(s)`);
                }
            }
            catch (err) {
                const errMsg = String(err);
                logger_1.default.error(`[Retro] Erreur ${feed.channelName}/@${source.handle}: ${errMsg}`);
                await logError(client, "Retro/" + feed.channelName + "/" + source.handle, errMsg);
            }
        }
    }
    try {
        const epicGames = await (0, epicgames_1.fetchFreeGames)(client);
        if (epicGames.length > 0) {
            logger_1.default.info(`[Retro] ${epicGames.length} jeu(x) Epic Games gratuit(s) à rattraper`);
            for (const game of epicGames) {
                const epicEmbed = (0, gaming_embeds_1.embedEpicGames)({
                    name: game.title,
                    originalPrice: game.originalPrice || "Gratuit",
                    endDate: game.freeEndDate
                        ? new Date(game.freeEndDate).toLocaleDateString("fr-FR")
                        : "Limitée",
                    description: game.description || undefined,
                    imageUrl: game.imageUrl || undefined,
                });
                epicEmbed.setURL(game.url);
                epicEmbed.addFields({
                    name: "📌 Note",
                    value: "Rattrapage (publié pendant l'arrêt du bot)",
                    inline: false,
                });
                if (config_1.config.steamEpicChannel) {
                    await sendToChannel(client, config_1.config.steamEpicChannel, epicEmbed);
                }
            }
        }
    }
    catch (err) {
        logger_1.default.error("[Retro] Erreur Epic Games:", String(err));
    }
    logger_1.default.info("=".repeat(50));
    logger_1.default.info(`  Rattrapage terminé : ${totalPublished} publication(s)${totalPublished >= MAX_RETRO_POSTS ? " (cap atteint)" : ""}`);
    logger_1.default.info("=".repeat(50));
    logger_1.default.info("");
}
//# sourceMappingURL=feeds.js.map