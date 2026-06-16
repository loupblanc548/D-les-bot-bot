"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDbSourcesRetrospective = runDbSourcesRetrospective;
exports.startMonitoring = startMonitoring;
exports.stopMonitoring = stopMonitoring;
const logger_1 = __importDefault(require("../utils/logger"));
const prisma_1 = __importDefault(require("../prisma"));
const url_cleaner_1 = require("../utils/url-cleaner");
const discord_js_1 = require("discord.js");
const feeds_1 = require("./feeds");
const image_helpers_1 = require("../utils/image-helpers");
const epicgames_1 = require("./epicgames");
const gaming_embeds_1 = require("../utils/gaming-embeds");
const config_1 = require("../config");
const rss_parser_1 = require("../utils/rss-parser");
const CHECK_INTERVAL_MS = config_1.config.monitoringIntervalMs;
let intervalId = null;
let isChecking = false;
let whitelistWarningShown = false;
// ============================================================
// FONCTIONS RSS (sources DB)
// ============================================================
async function checkYouTubeChannel(handle) {
    const urls = [
        `https://www.youtube.com/feeds/videos.xml?user=${handle}`,
        `https://www.youtube.com/feeds/videos.xml?channel_id=${handle}`,
    ];
    for (const url of urls) {
        try {
            const response = await fetch(url);
            if (!response.ok)
                continue;
            const text = await response.text();
            const parsed = rss_parser_1.xmlParser.parse(text);
            const entries = parsed.feed?.entry;
            if (!entries)
                return { status: "none" };
            const firstEntry = Array.isArray(entries) ? entries[0] : entries;
            const title = (0, rss_parser_1.textOf)(firstEntry.title).trim();
            const link = (0, rss_parser_1.extractLink)(firstEntry.link);
            const thumbnail = (0, image_helpers_1.extractMediaThumbnail)(firstEntry);
            if (title && link) {
                return { status: "new", content: { title, url: link, thumbnail } };
            }
            return { status: "none" };
        }
        catch { }
    }
    return { status: "error" };
}
async function checkTwitterUser(handle) {
    const url = `https://xcancel.com/${handle}/rss`;
    try {
        const response = await fetch(url, { headers: rss_parser_1.RSS_HEADERS });
        if (!response.ok) {
            logger_1.default.warn(`[Monitor] Twitter RSS: HTTP ${response.status} pour @${handle}`);
            return { status: "error" };
        }
        const text = await response.text();
        if (text.includes("RSS reader not yet whitelisted")) {
            if (!whitelistWarningShown) {
                whitelistWarningShown = true;
                logger_1.default.warn(`[Monitor] ⚠️  xcancel.com exige une whitelist. ` +
                    `Envoyez un email à rss@xcancel.com avec votre User-Agent (DiscordSurveillanceBot/1.0)`);
            }
            return { status: "error" };
        }
        const parsed = rss_parser_1.xmlParser.parse(text);
        const items = parsed.rss?.channel?.item;
        if (!items)
            return { status: "none" };
        const firstItem = Array.isArray(items) ? items[0] : items;
        const content = (0, rss_parser_1.textOf)(firstItem.title).trim();
        const link = (0, rss_parser_1.extractLink)(firstItem.link).trim();
        if (content && link) {
            return { status: "new", content: { text: content, url: link } };
        }
        return { status: "none" };
    }
    catch (error) {
        logger_1.default.error(`[Monitor] Erreur lors du check Twitter pour @${handle}:`, error);
        return { status: "error" };
    }
}
async function checkBlueskyUser(handle) {
    const url = `https://bsky.app/profile/${handle}/rss`;
    try {
        const response = await fetch(url);
        if (!response.ok)
            return { status: "error" };
        const text = await response.text();
        const parsed = rss_parser_1.xmlParser.parse(text);
        const items = parsed.rss?.channel?.item;
        if (!items)
            return { status: "none" };
        const firstItem = Array.isArray(items) ? items[0] : items;
        const title = (0, rss_parser_1.textOf)(firstItem.title).trim();
        const link = (0, rss_parser_1.extractLink)(firstItem.link).trim();
        if (title && link) {
            return { status: "new", content: { title, url: link } };
        }
        return { status: "none" };
    }
    catch {
        return { status: "error" };
    }
}
// === Fonctions multi-items pour la retrospective de demarrage ===
async function checkYouTubeChannelMulti(handle, limit = 3) {
    const urls = [
        `https://www.youtube.com/feeds/videos.xml?user=${handle}`,
        `https://www.youtube.com/feeds/videos.xml?channel_id=${handle}`,
    ];
    for (const url of urls) {
        try {
            const response = await fetch(url);
            if (!response.ok)
                continue;
            const text = await response.text();
            const parsed = rss_parser_1.xmlParser.parse(text);
            const entries = parsed.feed?.entry;
            if (!entries)
                return [];
            const list = Array.isArray(entries) ? entries : [entries];
            const results = [];
            for (const entry of list) {
                const title = (0, rss_parser_1.textOf)(entry.title).trim();
                const link = (0, rss_parser_1.extractLink)(entry.link);
                const thumbnail = (0, image_helpers_1.extractMediaThumbnail)(entry);
                if (title && link)
                    results.push({ title, url: link, thumbnail });
            }
            return results.slice(0, limit);
        }
        catch (error) {
            logger_1.default.error(`[Monitor] Erreur lors du check YouTube multi pour @${handle}:`, error);
        }
    }
    return [];
}
async function checkTwitterUserMulti(handle, limit = 3) {
    const url = `https://xcancel.com/${handle}/rss`;
    try {
        const response = await fetch(url, { headers: rss_parser_1.RSS_HEADERS });
        if (!response.ok)
            return [];
        const text = await response.text();
        if (text.includes("RSS reader not yet whitelisted"))
            return [];
        const parsed = rss_parser_1.xmlParser.parse(text);
        const items = parsed.rss?.channel?.item;
        if (!items)
            return [];
        const list = Array.isArray(items) ? items : [items];
        const results = [];
        for (const item of list) {
            const content = (0, rss_parser_1.textOf)(item.title).trim();
            const link = (0, rss_parser_1.extractLink)(item.link).trim();
            if (content && link)
                results.push({ text: content, url: link });
        }
        return results.slice(0, limit);
    }
    catch (error) {
        logger_1.default.error(`[Monitor] Erreur lors du check:`, error);
        return [];
    }
}
async function checkBlueskyUserMulti(handle, limit = 3) {
    const url = `https://bsky.app/profile/${handle}/rss`;
    try {
        const response = await fetch(url);
        if (!response.ok)
            return [];
        const text = await response.text();
        const parsed = rss_parser_1.xmlParser.parse(text);
        const items = parsed.rss?.channel?.item;
        if (!items)
            return [];
        const list = Array.isArray(items) ? items : [items];
        const results = [];
        for (const item of list) {
            const title = (0, rss_parser_1.textOf)(item.title).trim();
            const link = (0, rss_parser_1.extractLink)(item.link).trim();
            if (title && link)
                results.push({ title, url: link });
        }
        return results.slice(0, limit);
    }
    catch (error) {
        logger_1.default.error(`[Monitor] Erreur lors du check:`, error);
        return [];
    }
}
// ============================================================
// EPIC GAMES - Jeux gratuits
// ============================================================
async function checkEpicGames(client) {
    try {
        const games = await (0, epicgames_1.fetchFreeGames)(client);
        for (const game of games) {
            const embed = (0, gaming_embeds_1.embedEpicGames)({
                name: game.title,
                originalPrice: game.originalPrice || "Gratuit",
                endDate: game.freeEndDate
                    ? new Date(game.freeEndDate).toLocaleDateString("fr-FR")
                    : "Limitée",
                description: game.description || undefined,
                imageUrl: game.imageUrl || undefined,
            });
            embed.setURL(game.url);
            const steamEpicChannel = config_1.config.steamEpicChannel;
            if (steamEpicChannel) {
                await (0, feeds_1.sendToChannel)(client, steamEpicChannel, embed);
                logger_1.default.info(`[EpicGames] Notification: ${game.title}`);
            }
        }
    }
    catch (err) {
        const errMsg = String(err);
        logger_1.default.error("[EpicGames] Erreur:", errMsg);
        await (0, feeds_1.logError)(client, "EpicGames", errMsg);
    }
}
// ============================================================
// BOUCLE PRINCIPALE
// ============================================================
async function checkAndNotify(client) {
    if (isChecking)
        return;
    isChecking = true;
    try {
        logger_1.default.info("[Monitor] Vérification des sources...");
        // 1. Sources de la DB (utilisateur)
        const sources = await prisma_1.default.source.findMany();
        for (const source of sources) {
            try {
                let result = null;
                if (source.type === "YOUTUBE") {
                    result = await checkYouTubeChannel(source.urlOrHandle);
                }
                else if (source.type === "TWITTER") {
                    result = await checkTwitterUser(source.urlOrHandle);
                }
                else if (source.type === "BLUESKY") {
                    result = await checkBlueskyUser(source.urlOrHandle);
                }
                if (result?.status === "new" && result.content) {
                    // Insert-first : la contrainte @unique sur l'URL fait office de bouclier
                    const notifUrl = result.content.url || "";
                    const contentText = "title" in result.content ? result.content.title : result.content.text;
                    let isNewNotification = false;
                    try {
                        await prisma_1.default.notification.create({
                            data: {
                                sourceId: String(source.id),
                                platform: source.type,
                                content: contentText,
                                url: (0, url_cleaner_1.cleanUrl)(notifUrl) || null,
                            },
                        });
                        isNewNotification = true;
                    }
                    catch (err) {
                        // P2002 = contenu déjà notifié, on ignore silencieusement
                        if (err?.code !== "P2002") {
                            logger_1.default.error(`[Monitor] Erreur insertion notification pour @${source.urlOrHandle}:`, String(err));
                        }
                    }
                    if (!isNewNotification)
                        continue;
                    const channel = client.channels.cache.get(source.channelId);
                    if (channel?.isTextBased()) {
                        // Titre enrichi par plateforme
                        const icon = feeds_1.PLATFORM_ICONS[source.type.toLowerCase()] || "📢";
                        const label = feeds_1.PLATFORM_LABELS[source.type.toLowerCase()] || "";
                        const contentText = "title" in result.content ? result.content.title : result.content.text;
                        const embedTitle = label
                            ? icon + " " + contentText + " — " + label
                            : icon + " " + contentText;
                        const embed = new discord_js_1.EmbedBuilder()
                            .setTitle(embedTitle)
                            .setDescription("title" in result.content ? result.content.title : result.content.text)
                            .setColor(feeds_1.PLATFORM_COLORS[source.type.toLowerCase()] || 0x5865f2)
                            .addFields({ name: "Plateforme", value: rss_parser_1.PLATFORM_NAMES[source.type.toLowerCase()] || source.type, inline: true })
                            .setTimestamp();
                        if (result.content.url)
                            embed.setURL(result.content.url);
                        try {
                            if (source.type === "YOUTUBE" && result.content.url) {
                                const ytContent = result.content;
                                const thumb = ytContent.thumbnail || await (0, image_helpers_1.getYouTubeThumbnail)(ytContent.url);
                                if (thumb)
                                    embed.setImage(thumb);
                            }
                            else if (source.type === "TWITTER" && result.content.url) {
                                const og = await (0, image_helpers_1.getTweetImage)(result.content.url);
                                if (og)
                                    embed.setImage(og);
                            }
                            else if (source.type === "BLUESKY" && result.content.url) {
                                const og = await (0, image_helpers_1.getOgImage)(result.content.url);
                                if (og)
                                    embed.setImage(og);
                            }
                        }
                        catch { }
                        await channel.send({ embeds: [embed] });
                        logger_1.default.info(`[Monitor] Notification envoyée pour @${source.urlOrHandle}`);
                    }
                }
            }
            catch (err) {
                const errMsg = String(err);
                logger_1.default.error(`[Monitor] Erreur source ${source.urlOrHandle}:`, errMsg);
                await (0, feeds_1.logError)(client, `Monitor/DB/${source.urlOrHandle}`, errMsg);
            }
        }
        // 2. Comptes gaming pré-configurés (feeds.ts)
        try {
            await (0, feeds_1.runGamingFeeds)(client);
        }
        catch (err) {
            const errMsg = String(err);
            logger_1.default.error("[Monitor] Erreur gaming feeds:", errMsg);
            await (0, feeds_1.logError)(client, "Monitor/GamingFeeds", errMsg);
        }
        // 3. Epic Games gratuits
        try {
            await checkEpicGames(client);
        }
        catch (err) {
            const errMsg = String(err);
            logger_1.default.error("[Monitor] Erreur Epic Games:", errMsg);
            await (0, feeds_1.logError)(client, "Monitor/EpicGames", errMsg);
        }
        logger_1.default.info(`[Monitor] Vérification terminée (${sources.length} sources DB)`);
    }
    catch (err) {
        const errMsg = String(err);
        logger_1.default.error("[Monitor] Erreur globale:", errMsg);
        try {
            await (0, feeds_1.logError)(client, "Monitor/Global", errMsg);
        }
        catch { }
    }
    finally {
        isChecking = false;
    }
}
// ============================================================
// RETROSPECTIVE DE DEMARRAGE - Rattrapage sources DB
// ============================================================
async function runDbSourcesRetrospective(client) {
    logger_1.default.info("");
    logger_1.default.info("=".repeat(50));
    logger_1.default.info("  RETROSPECTIVE DB - Rattrapage sources personnalisées");
    logger_1.default.info("=".repeat(50));
    const sources = await prisma_1.default.source.findMany();
    let totalPublished = 0;
    const MAX_RETRO_POSTS = config_1.config.maxRetroPosts;
    dbRetroLoop: for (const source of sources) {
        try {
            let items = [];
            if (source.type === "YOUTUBE") {
                items = await checkYouTubeChannelMulti(source.urlOrHandle, 3);
            }
            else if (source.type === "TWITTER") {
                const twItems = await checkTwitterUserMulti(source.urlOrHandle, 3);
                items = twItems.map(i => ({ title: i.text, url: i.url }));
            }
            else if (source.type === "BLUESKY") {
                items = await checkBlueskyUserMulti(source.urlOrHandle, 3);
            }
            let publishedForSource = 0;
            for (const item of items) {
                // Insert-first anti-doublon
                let isNewRetroNotif = false;
                try {
                    await prisma_1.default.notification.create({
                        data: {
                            sourceId: String(source.id),
                            platform: source.type,
                            content: item.title,
                            url: (0, url_cleaner_1.cleanUrl)(item.url) || null,
                        },
                    });
                    isNewRetroNotif = true;
                }
                catch (err) {
                    if (err?.code !== "P2002") {
                        logger_1.default.error(`[RetroDB] Erreur insertion notification @${source.urlOrHandle}:`, String(err));
                    }
                }
                if (!isNewRetroNotif)
                    continue;
                const channel = client.channels.cache.get(source.channelId);
                if (channel?.isTextBased()) {
                    // Titre enrichi par plateforme
                    const icon = feeds_1.PLATFORM_ICONS[source.type.toLowerCase()] || "📢";
                    const label = feeds_1.PLATFORM_LABELS[source.type.toLowerCase()] || "";
                    const embedTitle = label
                        ? icon + " " + item.title + " — " + label
                        : icon + " " + item.title;
                    const embed = new discord_js_1.EmbedBuilder()
                        .setTitle(embedTitle)
                        .setDescription(item.title)
                        .setColor(feeds_1.PLATFORM_COLORS[source.type.toLowerCase()] || 0x5865f2)
                        .addFields({ name: "Plateforme", value: rss_parser_1.PLATFORM_NAMES[source.type.toLowerCase()] || source.type, inline: true }, { name: "Note", value: "📌 Rattrapage (publié pendant l'arrêt du bot)", inline: true })
                        .setURL(item.url)
                        .setTimestamp();
                    try {
                        if (source.type === "YOUTUBE") {
                            const thumb = item.thumbnail || await (0, image_helpers_1.getYouTubeThumbnail)(item.url);
                            if (thumb)
                                embed.setImage(thumb);
                        }
                        else if (source.type === "TWITTER") {
                            const og = await (0, image_helpers_1.getTweetImage)(item.url);
                            if (og)
                                embed.setImage(og);
                        }
                        else if (source.type === "BLUESKY") {
                            const og = await (0, image_helpers_1.getOgImage)(item.url);
                            if (og)
                                embed.setImage(og);
                        }
                    }
                    catch { }
                    await channel.send({ embeds: [embed] });
                    publishedForSource++;
                    totalPublished++;
                    if (totalPublished >= MAX_RETRO_POSTS) {
                        logger_1.default.info("[RetroDB] Cap global atteint (" + MAX_RETRO_POSTS + " publications)");
                        break dbRetroLoop;
                    }
                }
            }
            if (publishedForSource > 0) {
                logger_1.default.info(`[RetroDB] @${source.urlOrHandle}: ${publishedForSource} rattrapage(s)`);
            }
        }
        catch (err) {
            const errMsg = String(err);
            logger_1.default.error(`[RetroDB] Erreur source ${source.urlOrHandle}:`, errMsg);
            await (0, feeds_1.logError)(client, "RetroDB/" + source.urlOrHandle, errMsg);
        }
    }
    logger_1.default.info("=".repeat(50));
    logger_1.default.info(`  Rattrapage DB terminé : ${totalPublished} publication(s)${totalPublished >= MAX_RETRO_POSTS ? " (cap atteint)" : ""}`);
    logger_1.default.info("=".repeat(50));
    logger_1.default.info("");
}
function startMonitoring(client) {
    if (intervalId)
        return;
    logger_1.default.info("[Monitor] Surveillance activée (intervalle: " + (CHECK_INTERVAL_MS / 60000) + " min)");
    try {
        checkAndNotify(client);
    }
    catch (err) {
        logger_1.default.error("[Monitor] Crash au premier check:", String(err));
    }
    intervalId = setInterval(function () {
        try {
            checkAndNotify(client);
        }
        catch (err) {
            logger_1.default.error("[Monitor] Crash dans le setInterval:", String(err));
        }
    }, CHECK_INTERVAL_MS);
}
function stopMonitoring() {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        logger_1.default.info("[Monitor] Surveillance arrêtée");
    }
}
//# sourceMappingURL=monitor.js.map