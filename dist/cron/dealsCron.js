"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLATFORM_CONFIGS = void 0;
exports.startDealsMonitoring = startDealsMonitoring;
exports.stopDealsMonitoring = stopDealsMonitoring;
exports.checkDeals = checkDeals;
exports.detectPlatforms = detectPlatforms;
const discord_js_1 = require("discord.js");
const logger_1 = __importDefault(require("../utils/logger"));
const prisma_1 = __importDefault(require("../prisma"));
const node_cron_1 = __importDefault(require("node-cron"));
const axios_1 = __importDefault(require("axios"));
const config_1 = require("../config");
const retry_1 = require("../utils/retry");
const cache_1 = require("../utils/cache");
const validation_1 = require("../utils/validation");
const metrics_1 = require("../utils/metrics");
const translator_1 = require("../utils/translator");
const RSS_FEEDS = [
    `${config_1.config.rss2jsonBaseUrl}?rss_url=${encodeURIComponent("https://www.reddit.com/r/FreeGameFindings/new.rss")}`,
    `${config_1.config.rss2jsonBaseUrl}?rss_url=${encodeURIComponent("https://www.reddit.com/r/GameDeals/new.rss")}`,
];
const PLATFORM_CONFIGS = [
    {
        keywords: ["[Epic Games]", "Epic", "[Epic Games Store]"],
        channelId: config_1.config.steamEpicChannel,
        color: 0x2a2a2a,
        name: "Epic Games",
        defaultImage: "https://store.epicgames.com/favicon.ico",
    },
    {
        keywords: ["[Steam]", "Steam", "[GOG]"],
        channelId: config_1.config.steamEpicChannel,
        color: 0x000080,
        name: "Steam",
        defaultImage: "https://store.steampowered.com/favicon.ico",
    },
    {
        keywords: ["[PlayStation]", "PS4", "PS5", "PSN"],
        channelId: config_1.config.playstationChannel,
        color: 0x003791,
        name: "PlayStation",
        defaultImage: "https://www.playstation.com/favicon.ico",
    },
    {
        keywords: ["[Xbox]", "XBL", "Xbox Series", "Xbox One", "Microsoft"],
        channelId: config_1.config.xboxChannel,
        color: 0x107c10,
        name: "Xbox",
        defaultImage: "https://www.xbox.com/favicon.ico",
    },
    {
        keywords: ["[Nintendo]", "Switch", "eShop"],
        channelId: config_1.config.nintendoChannel,
        color: 0xe60012,
        name: "Nintendo",
        defaultImage: "https://www.nintendo.com/favicon.ico",
    },
];
exports.PLATFORM_CONFIGS = PLATFORM_CONFIGS;
let dealsCronJob = null;
function detectPlatforms(title) {
    const lowerTitle = title.toLowerCase();
    const detectedPlatforms = [];
    for (const platform of PLATFORM_CONFIGS) {
        for (const keyword of platform.keywords) {
            const kw = keyword.toLowerCase();
            // Use word boundary for short non-bracket keywords (like "Epic", "Steam")
            const isTaggedKeyword = kw.startsWith("[");
            const matches = isTaggedKeyword
                ? lowerTitle.includes(kw)
                : new RegExp("\\b" + kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(lowerTitle);
            if (matches) {
                detectedPlatforms.push(platform);
                break;
            }
        }
    }
    return detectedPlatforms;
}
/**
 * Vérifie si un deal a déjà été traité
 * @param guid - Identifiant unique du deal
 * @returns true si le deal a déjà été traité, false sinon
 */
async function isDealProcessed(guid) {
    // Check cache first
    const cached = cache_1.dbCache.get(guid);
    if (cached !== undefined) {
        return cached;
    }
    try {
        const existing = await prisma_1.default.processedDeal.findUnique({
            where: { guid },
        });
        const result = !!existing;
        cache_1.dbCache.set(guid, result);
        return result;
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger_1.default.warn(`[DealsCron] Erreur verification ProcessedDeal: ${msg}`);
        return false;
    }
}
/**
 * Marque un deal comme traité dans la base de données
 * @param guid - Identifiant unique du deal
 */
async function markDealProcessed(guid) {
    try {
        await prisma_1.default.processedDeal.upsert({
            where: { guid },
            update: { guid },
            create: { guid },
        });
        // Update cache
        cache_1.dbCache.set(guid, true);
    }
    catch (error) {
        logger_1.default.debug("[DealsCron] Deal deja persiste, ignore");
    }
}
/**
 * Génère un GUID unique pour un deal RSS
 * @param item - Item RSS du deal
 * @returns GUID unique généré
 */
function generateDealGuid(item) {
    return item.guid || Buffer.from(item.link).toString("base64").substring(0, 50);
}
async function sendDealEmbed(client, item, platform) {
    if (!platform.channelId) {
        logger_1.default.warn(`[DealsCron] Salon non configure pour ${platform.name}`);
        return;
    }
    try {
        const channel = await client.channels.fetch(platform.channelId);
        if (!channel?.isTextBased()) {
            logger_1.default.warn(`[DealsCron] Channel ${platform.channelId} non disponible pour ${platform.name}`);
            return;
        }
        // Nettoyer le HTML de la description avant traduction
        const cleanHtmlContent = (item.contentSnippet || item.content || "")
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/\s+/g, ' ')
            .trim();
        // Traduire le titre si nécessaire
        let translatedTitle = item.title;
        let translatedDescription = cleanHtmlContent;
        try {
            const titleResult = await (0, translator_1.translateAutoToFrench)(item.title);
            if (titleResult && titleResult.detectedLanguage !== "fr") {
                translatedTitle = titleResult.translatedText;
            }
            const descResult = await (0, translator_1.translateAutoToFrench)(cleanHtmlContent);
            if (descResult && descResult.detectedLanguage !== "fr") {
                translatedDescription = descResult.translatedText;
            }
        }
        catch (error) {
            logger_1.default.debug(`[DealsCron] Erreur traduction, utilisation texte original: ${error instanceof Error ? error.message : String(error)}`);
        }
        const finalDescription = translatedDescription.substring(0, 1000);
        // Extract image from item or use default platform image
        const imageUrl = item.thumbnail || item.enclosure?.url || platform.defaultImage;
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(translatedTitle)
            .setDescription(finalDescription || "Aucune description disponible")
            .setColor(platform.color)
            .setURL(item.link)
            .setImage(imageUrl)
            .addFields({ name: "Plateforme", value: platform.name, inline: true }, { name: "Publie le", value: new Date(item.pubDate).toLocaleString("fr-FR"), inline: true })
            .setTimestamp()
            .setFooter({ text: "🎮 Surveillance des offres • " + platform.name });
        await channel.send({ embeds: [embed] });
        logger_1.default.info(`[DealsCron] Deal envoye dans ${platform.name}: ${translatedTitle}`);
    }
    catch (error) {
        logger_1.default.error(`[DealsCron] Erreur envoi deal ${platform.name}: ${error instanceof Error ? error.message : String(error)}`, { stack: error instanceof Error ? error.stack : undefined });
    }
}
async function processDealItem(client, item) {
    // ⏱️ Barrière temporelle 48h : ignorer les articles trop anciens (évite le re-post massif après reset BDD)
    const articleDate = new Date(item.pubDate);
    const limitDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
    if (isNaN(articleDate.getTime()) || articleDate < limitDate) {
        return;
    }
    try {
        // Validate RSS item
        if (!(0, validation_1.validateRssItem)(item)) {
            logger_1.default.warn(`[DealsCron] Item RSS invalide ignore: ${item.title || 'sans titre'}`);
            return;
        }
        // Sanitize title
        const sanitizedTitle = (0, validation_1.sanitizeString)(item.title);
        if (!sanitizedTitle) {
            logger_1.default.warn(`[DealsCron] Titre vide apres sanitization: ${item.title}`);
            return;
        }
        const guid = generateDealGuid(item);
        if (await isDealProcessed(guid)) {
            logger_1.default.debug(`[DealsCron] Deal deja traite: ${sanitizedTitle}`);
            return;
        }
        const platforms = detectPlatforms(sanitizedTitle);
        if (platforms.length === 0) {
            logger_1.default.warn(`[DealsCron] Plateforme non detectee pour: ${sanitizedTitle}`);
            const defaultPlatform = PLATFORM_CONFIGS[0];
            if (defaultPlatform.channelId) {
                await sendDealEmbed(client, item, defaultPlatform);
            }
            await markDealProcessed(guid);
            return;
        }
        // Send to all detected platforms (multi-platform routing)
        for (const platform of platforms) {
            if (!platform.channelId) {
                logger_1.default.warn(`[DealsCron] Salon non configure pour ${platform.name}, deal ignore: ${item.title}`);
                continue;
            }
            await sendDealEmbed(client, item, platform);
        }
        await markDealProcessed(guid);
    }
    catch (error) {
        logger_1.default.error(`[DealsCron] Erreur traitement deal "${item.title}": ${error instanceof Error ? error.message : String(error)}`, { stack: error instanceof Error ? error.stack : undefined });
    }
}
async function checkDeals(client) {
    const startTime = Date.now();
    const jobName = "dealsCron";
    // Securite anti-crash : verification stricte des variables d'environnement
    const hasAnyChannel = PLATFORM_CONFIGS.some((p) => p.channelId);
    if (!hasAnyChannel) {
        logger_1.default.warn("[DealsCron] Aucun CHANNEL_ID configure (STEAM_EPIC_CHANNEL_ID, PLAYSTATION_CHANNEL_ID, XBOX_CHANNEL_ID, NINTENDO_CHANNEL_ID) — cron desactive");
        metrics_1.metricsCollector.recordProcessing(jobName, false, Date.now() - startTime);
        return;
    }
    logger_1.default.info("[DealsCron] Verification des flux RSS pour les nouveaux deals...");
    try {
        for (const feedUrl of RSS_FEEDS) {
            try {
                logger_1.default.debug(`[DealsCron] Analyse du flux: ${feedUrl}`);
                // Fetch via rss2json API (JSON direct, pas besoin de parser XML) with retry logic
                const response = await (0, retry_1.retry)(() => axios_1.default.get(feedUrl, { timeout: 10000 }), 3, 1000);
                const feed = response.data;
                const items = feed.items || [];
                if (!items || items.length === 0) {
                    logger_1.default.debug(`[DealsCron] Aucun item trouve dans: ${feedUrl}`);
                    continue;
                }
                const recentItems = items.slice(0, 10);
                // Process items in parallel for better performance
                await Promise.all(recentItems.map(item => processDealItem(client, item)));
                logger_1.default.info(`[DealsCron] ${recentItems.length} item(s) traite(s) depuis ${feedUrl}`);
            }
            catch (error) {
                logger_1.default.error(`[DealsCron] Erreur analyse du flux ${feedUrl}: ${error instanceof Error ? error.message : String(error)}`, { stack: error instanceof Error ? error.stack : undefined });
            }
        }
        metrics_1.metricsCollector.recordProcessing(jobName, true, Date.now() - startTime);
    }
    catch (error) {
        logger_1.default.error(`[DealsCron] Erreur globale du cron: ${error instanceof Error ? error.message : String(error)}`, { stack: error instanceof Error ? error.stack : undefined });
        metrics_1.metricsCollector.recordProcessing(jobName, false, Date.now() - startTime);
    }
}
function startDealsMonitoring(client) {
    if (dealsCronJob) {
        logger_1.default.warn("[DealsCron] Surveillance deja active");
        return;
    }
    // Securite anti-crash : garde au demarrage
    const hasAnyChannel = PLATFORM_CONFIGS.some((p) => p.channelId);
    if (!hasAnyChannel) {
        logger_1.default.warn("[DealsCron] Aucun CHANNEL_ID configure — surveillance desactivee");
        return;
    }
    logger_1.default.info("[DealsCron] Demarrage de la surveillance des deals (toutes les 30 minutes)");
    checkDeals(client).catch((err) => logger_1.default.error(`[DealsCron] Erreur check initial: ${err instanceof Error ? err.message : String(err)}`, { stack: err instanceof Error ? err.stack : undefined }));
    dealsCronJob = node_cron_1.default.schedule("*/30 * * * *", () => {
        checkDeals(client).catch((err) => logger_1.default.error(`[DealsCron] Erreur check periodique: ${err instanceof Error ? err.message : String(err)}`, { stack: err instanceof Error ? err.stack : undefined }));
    });
}
function stopDealsMonitoring() {
    if (dealsCronJob) {
        dealsCronJob.stop();
        dealsCronJob = null;
        logger_1.default.info("[DealsCron] Surveillance arretee");
    }
}
//# sourceMappingURL=dealsCron.js.map