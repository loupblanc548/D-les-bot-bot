import logger from "../utils/logger.js";
import { EmbedBuilder } from "discord.js";
import { getYouTubeThumbnail, getTweetImage, getBlogImage, extractMediaThumbnail } from "../utils/image-helpers.js";
import prisma from "../prisma.js";
import { cleanUrl } from "../utils/url-cleaner.js";
import { config } from "../config.js";
import { getYouTubeRssUrl } from "./youtube.js";
import { fetchFreeGames } from "./epicgames.js";
import { embedEpicGames } from "../utils/gaming-embeds.js";
import { RSS_HEADERS, PLATFORM_COLORS, PLATFORM_ICONS, PLATFORM_LABELS, xmlParser, textOf, extractLink } from "../utils/rss-parser.js";
const FEEDS = [
    {
        channelId: config.fortniteChannel,
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
        channelId: config.nintendoChannel,
        channelName: "Nintendo",
        sources: [
            { platform: "twitter", handle: "NintendoFrance" },
            { platform: "youtube", handle: "NintendoFR" },
        ],
    },
    {
        channelId: config.playstationChannel,
        channelName: "PlayStation",
        sources: [
            { platform: "twitter", handle: "PlayStationFR" },
            { platform: "youtube", handle: "PlayStationFrance" },
            { platform: "blogs", handle: "PlayStationBlog", blogUrl: "https://blog.fr.playstation.com/feed/" },
        ],
    },
    {
        channelId: config.xboxChannel,
        channelName: "Xbox",
        sources: [
            { platform: "twitter", handle: "XboxFR" },
            { platform: "youtube", handle: "XboxFR" },
        ],
    },
    {
        channelId: config.robloxChannel,
        channelName: "Roblox",
        sources: [
            { platform: "twitter", handle: "Roblox" },
            { platform: "youtube", handle: "Roblox" },
            { platform: "blogs", handle: "RobloxBlog", blogUrl: "https://blog.roblox.com/feed/" },
        ],
    },
];
const FETCH_RSS_TTL_MS = config.rssCacheTtlMs;
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
        const response = await fetch(url, needHeaders ? { headers: RSS_HEADERS } : undefined);
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
export function parseRssItems(xml) {
    try {
        const parsed = xmlParser.parse(xml);
        const rawItems = parsed.rss?.channel?.item || parsed.feed?.entry;
        if (!rawItems)
            return [];
        const list = Array.isArray(rawItems) ? rawItems : [rawItems];
        return list.map((item) => ({
            title: textOf(item.title).trim(),
            url: extractLink(item.link).trim(),
            thumbnail: extractMediaThumbnail(item),
        })).filter(i => i.title && i.url);
    }
    catch (error) {
        logger.error('[Feeds] Erreur lors du parsing RSS:', error);
        return [];
    }
}
async function checkTwitterSource(handle) {
    const url = `https://${new URL(config.xcancelBaseUrl).hostname}/` + handle + "/rss";
    const xml = await fetchRss(url, true);
    if (!xml || xml.includes("RSS reader not yet whitelisted"))
        return null;
    const items = parseRssItems(xml);
    return items[0] || null;
}
async function checkYouTubeSource(handle) {
    const rssUrl = await getYouTubeRssUrl(handle);
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
    const url = `https://${new URL(config.xcancelBaseUrl).hostname}/` + handle + "/rss";
    const xml = await fetchRss(url, true);
    if (!xml || xml.includes("RSS reader not yet whitelisted"))
        return [];
    const items = parseRssItems(xml);
    return items.slice(0, limit);
}
async function checkYouTubeSourceMulti(handle, limit = 3) {
    const rssUrl = await getYouTubeRssUrl(handle);
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
    const cleanedUrl = cleanUrl(url);
    if (!cleanedUrl)
        return false;
    try {
        await prisma.notification.upsert({
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
        logger.error(`[Feeds] Erreur insertion notification: ${err instanceof Error ? err.message : String(err)}`, { stack: err instanceof Error ? err.stack : undefined });
        return false;
    }
}
export async function sendToChannel(client, channelId, embed) {
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
export async function logError(client, module, error) {
    if (!config.logChannel)
        return;
    try {
        const embed = new EmbedBuilder()
            .setTitle("⚠️ Erreur système")
            .setColor(0xff3344)
            .addFields({ name: "Module", value: module, inline: true }, { name: "Timestamp", value: new Date().toISOString(), inline: true }, { name: "Message", value: error.slice(0, 1024) })
            .setTimestamp();
        await sendToChannel(client, config.logChannel, embed);
    }
    catch {
        logger.error("[LogError] Impossible d'écrire dans le salon de logs");
    }
}
export async function runGamingFeeds(client) {
    logger.info("[Feeds] Vérification des comptes gaming...");
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
                else if (source.platform === "blogs" && source.blogUrl) {
                    result = await checkBlogSource(source.blogUrl);
                }
                if (!result || !result.url)
                    continue;
                const isNewNotif = await tryInsertNotification("gaming-feed", source.platform, result.title, result.url);
                if (!isNewNotif)
                    continue;
                const icon = PLATFORM_ICONS[source.platform] || "📡";
                const label = PLATFORM_LABELS[source.platform] || "";
                const embedTitle = label
                    ? icon + " " + result.title + " — " + label
                    : icon + " " + result.title;
                const embed = new EmbedBuilder()
                    .setTitle(embedTitle)
                    .setURL(result.url)
                    .setColor(PLATFORM_COLORS[source.platform] || 0x5865f2)
                    .addFields({ name: "Source", value: "@" + source.handle + " (" + source.platform + ")", inline: true }, { name: "Salon", value: feed.channelName, inline: true })
                    .setTimestamp();
                try {
                    if (source.platform === "youtube") {
                        const thumb = result.thumbnail || await getYouTubeThumbnail(result.url);
                        if (thumb)
                            embed.setImage(thumb);
                    }
                    else if (source.platform === "twitter") {
                        const og = await getTweetImage(result.url);
                        if (og)
                            embed.setImage(og);
                    }
                    else if (source.platform === "blogs") {
                        const img = await getBlogImage(result.url);
                        if (img)
                            embed.setImage(img);
                    }
                }
                catch { }
                const sent = await sendToChannel(client, feed.channelId, embed);
                if (sent) {
                    logger.info("[Feeds] OK " + feed.channelName + " <- @" + source.handle);
                }
            }
            catch (err) {
                const errMsg = String(err);
                logger.error("[Feeds] ERR " + feed.channelName + "/" + source.handle + ": " + errMsg);
                await logError(client, "Feeds/" + feed.channelName + "/" + source.handle, errMsg);
            }
        }
    }
    logger.info("[Feeds] Vérification terminée");
}
export async function runStartupRetrospective(client) {
    logger.info("");
    logger.info("=".repeat(50));
    logger.info("  RETROSPECTIVE DE DEMARRAGE - Rattrapage");
    logger.info("=".repeat(50));
    let totalPublished = 0;
    const MAX_RETRO_POSTS = config.maxRetroPosts;
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
                else if (source.platform === "blogs" && source.blogUrl) {
                    items = await checkBlogSourceMulti(source.blogUrl, 3);
                }
                let publishedForSource = 0;
                for (const item of items) {
                    if (!item.url)
                        continue;
                    const isNewRetroNotif = await tryInsertNotification("gaming-feed", source.platform, item.title, item.url);
                    if (!isNewRetroNotif)
                        continue;
                    const icon = PLATFORM_ICONS[source.platform] || "📡";
                    const label = PLATFORM_LABELS[source.platform] || "";
                    const embedTitle = label
                        ? icon + " " + item.title + " — " + label
                        : icon + " " + item.title;
                    const embed = new EmbedBuilder()
                        .setTitle(embedTitle)
                        .setURL(item.url)
                        .setColor(PLATFORM_COLORS[source.platform] || 0x5865f2)
                        .addFields({ name: "Source", value: "@" + source.handle + " (" + source.platform + ")", inline: true }, { name: "Salon", value: feed.channelName, inline: true }, { name: "Note", value: "📌 Rattrapage (publié pendant l'arrêt du bot)", inline: false })
                        .setTimestamp();
                    try {
                        if (source.platform === "youtube") {
                            const thumb = item.thumbnail || await getYouTubeThumbnail(item.url);
                            if (thumb)
                                embed.setImage(thumb);
                        }
                        else if (source.platform === "twitter") {
                            const og = await getTweetImage(item.url);
                            if (og)
                                embed.setImage(og);
                        }
                        else if (source.platform === "blogs") {
                            const img = await getBlogImage(item.url);
                            if (img)
                                embed.setImage(img);
                        }
                    }
                    catch (error) {
                        logger.error('[Feeds] Erreur lors de la récupération de l\'image:', error);
                    }
                    const sent = await sendToChannel(client, feed.channelId, embed);
                    if (sent) {
                        publishedForSource++;
                        totalPublished++;
                        if (totalPublished >= MAX_RETRO_POSTS) {
                            logger.info("[Retro] Cap global atteint (" + MAX_RETRO_POSTS + " publications)");
                            break feedLoop;
                        }
                    }
                }
                if (publishedForSource > 0) {
                    logger.info(`[Retro] ${feed.channelName}/@${source.handle}: ${publishedForSource} rattrapage(s)`);
                }
            }
            catch (err) {
                const errMsg = String(err);
                logger.error(`[Retro] Erreur ${feed.channelName}/@${source.handle}: ${errMsg}`);
                await logError(client, "Retro/" + feed.channelName + "/" + source.handle, errMsg);
            }
        }
    }
    try {
        const epicGames = await fetchFreeGames(client);
        if (epicGames.length > 0) {
            logger.info(`[Retro] ${epicGames.length} jeu(x) Epic Games gratuit(s) à rattraper`);
            for (const game of epicGames) {
                const epicEmbed = embedEpicGames({
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
                if (config.steamEpicChannel) {
                    await sendToChannel(client, config.steamEpicChannel, epicEmbed);
                }
            }
        }
    }
    catch (err) {
        logger.error("[Retro] Erreur Epic Games:", String(err));
    }
    logger.info("=".repeat(50));
    logger.info(`  Rattrapage terminé : ${totalPublished} publication(s)${totalPublished >= MAX_RETRO_POSTS ? " (cap atteint)" : ""}`);
    logger.info("=".repeat(50));
    logger.info("");
}
export { PLATFORM_COLORS, PLATFORM_ICONS, PLATFORM_LABELS };
//# sourceMappingURL=feeds.js.map