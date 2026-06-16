"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startTwitterMonitoring = startTwitterMonitoring;
exports.stopTwitterMonitoring = stopTwitterMonitoring;
exports.checkTwitterAccounts = checkTwitterAccounts;
exports.fetchTweetsForAccount = fetchTweetsForAccount;
exports.extractTweetId = extractTweetId;
const discord_js_1 = require("discord.js");
const node_cron_1 = __importDefault(require("node-cron"));
const axios_1 = __importDefault(require("axios"));
const fast_xml_parser_1 = require("fast-xml-parser");
const prisma_1 = __importDefault(require("../prisma"));
const config_1 = require("../config");
const logger_1 = __importDefault(require("../utils/logger"));
const translator_1 = require("../utils/translator");
// Constantes
const TWITTER_BLUE = 0x1da1f2;
const RSSHUB_BASE = "https://rsshub.app/twitter/user";
const MAX_TWEETS_PER_ACCOUNT = 3;
const FOOTER = { text: "Twitter Monitor • Surveillance automatique" };
const TWITTER_ICON = "https://abs.twimg.com/responsive-web/client-web/icon-default.522d363a.png";
const rssParser = new fast_xml_parser_1.XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
});
// Configuration des plateformes (routage multi-console pour tweets gaming)
const PLATFORM_CONFIGS = [
    { id: "epic", channelId: config_1.config.steamEpicChannel, color: 0x2a2a2a, label: "Epic Games", iconUrl: "https://store.epicgames.com/favicon.ico" },
    { id: "steam", channelId: config_1.config.steamEpicChannel, color: 0x000080, label: "Steam", iconUrl: "https://store.steampowered.com/favicon.ico" },
    { id: "playstation", channelId: config_1.config.playstationChannel, color: 0x003791, label: "PlayStation", iconUrl: "https://www.playstation.com/favicon.ico" },
    { id: "xbox", channelId: config_1.config.xboxChannel, color: 0x107c10, label: "Xbox", iconUrl: "https://www.xbox.com/favicon.ico" },
    { id: "nintendo", channelId: config_1.config.nintendoChannel, color: 0xe60012, label: "Nintendo", iconUrl: "https://www.nintendo.com/favicon.ico" },
];
// Etat interne
let cronJob = null;
let isChecking = false;
let checkCount = 0;
// Helpers
function stripHtml(html) {
    return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}
function extractImageFromHtml(html) {
    const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    return match?.[1] ?? null;
}
function isValidUrl(url) {
    return typeof url === "string" && /^https?:\/\//i.test(url);
}
function extractTweetId(link) {
    const match = link.match(/\/status\/(\d+)/);
    return match?.[1] ?? null;
}
// Fetch RSS
async function fetchTweetsForAccount(account) {
    const url = RSSHUB_BASE + "/" + account;
    const tweets = [];
    try {
        const response = await axios_1.default.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                Accept: "application/rss+xml, application/xml, text/xml",
            },
            timeout: 15000,
            maxRedirects: 5,
        });
        const parsed = rssParser.parse(response.data);
        const items = parsed?.rss?.channel?.item;
        if (!items)
            return [];
        const itemList = (Array.isArray(items) ? items : [items]).slice(0, MAX_TWEETS_PER_ACCOUNT);
        for (const item of itemList) {
            const title = stripHtml(item.title || "");
            const link = item.link || "";
            const pubDate = item.pubDate || "";
            const tweetId = extractTweetId(link);
            if (!tweetId || !title)
                continue;
            let content = "";
            if (item.description) {
                content = stripHtml(item.description);
            }
            let imageUrl = null;
            const enclosureUrl = item.enclosure?.["@_url"] ?? item.enclosure?.url ?? null;
            if (isValidUrl(enclosureUrl))
                imageUrl = enclosureUrl;
            if (!imageUrl && item["media:content"]) {
                const mc = item["media:content"];
                const mcFirst = Array.isArray(mc) ? mc[0] : mc;
                const mcUrl = mcFirst?.["@_url"] ?? mcFirst?.url ?? null;
                if (isValidUrl(mcUrl))
                    imageUrl = mcUrl;
            }
            if (!imageUrl && item.description) {
                const img = extractImageFromHtml(item.description);
                if (isValidUrl(img))
                    imageUrl = img;
            }
            tweets.push({
                tweetId,
                account,
                content,
                pubDate,
                link,
                imageUrl,
            });
        }
    }
    catch (error) {
        logger_1.default.warn("[TwitterCron] Flux RSS inaccessible pour @" + account + ": " + (error instanceof Error ? error.message : String(error)));
    }
    return tweets;
}
// Detection de plateforme dans le contenu du tweet
function detectPlatforms(text) {
    const t = text.toLowerCase();
    const matched = [];
    const seen = new Set();
    if (/\b(epic games|epic)\b/.test(t) && !seen.has("epic")) {
        matched.push(PLATFORM_CONFIGS.find(p => p.id === "epic"));
        seen.add("epic");
    }
    if (/\b(steam)\b/.test(t) && !seen.has("steam")) {
        matched.push(PLATFORM_CONFIGS.find(p => p.id === "steam"));
        seen.add("steam");
    }
    if (/\b(playstation|ps4|ps5|psn)\b/.test(t) && !seen.has("playstation")) {
        matched.push(PLATFORM_CONFIGS.find(p => p.id === "playstation"));
        seen.add("playstation");
    }
    if (/\b(xbox|xbl|microsoft|series\s*[xs])\b/.test(t) && !seen.has("xbox")) {
        matched.push(PLATFORM_CONFIGS.find(p => p.id === "xbox"));
        seen.add("xbox");
    }
    if (/\b(nintendo|switch)\b/.test(t) && !seen.has("nintendo")) {
        matched.push(PLATFORM_CONFIGS.find(p => p.id === "nintendo"));
        seen.add("nintendo");
    }
    return matched;
}
// Fonction principale
async function checkTwitterAccounts(client) {
    // Securite anti-crash : verifier qu'au moins un salon est configure
    const hasAnyChannel = config_1.config.twitterChannel || config_1.config.steamEpicChannel ||
        config_1.config.playstationChannel || config_1.config.xboxChannel || config_1.config.nintendoChannel;
    if (!hasAnyChannel) {
        logger_1.default.warn("[TwitterCron] Aucun CHANNEL_ID configure (TWITTER_CHANNEL_ID, STEAM_EPIC_CHANNEL_ID, PLAYSTATION_CHANNEL_ID, XBOX_CHANNEL_ID, NINTENDO_CHANNEL_ID) — cron desactive");
        return;
    }
    const accountsRaw = config_1.config.twitterAccounts;
    if (!accountsRaw || accountsRaw.length === 0) {
        logger_1.default.warn("[TwitterCron] TWITTER_ACCOUNTS non configuré — cron desactive");
        return;
    }
    if (isChecking) {
        logger_1.default.info("[TwitterCron] Vérification déjà en cours, ignorée");
        return;
    }
    isChecking = true;
    const startTime = Date.now();
    let tweetsSent = 0;
    try {
        const accounts = accountsRaw
            .split(",")
            .map((a) => a.trim())
            .filter((a) => a.length > 0);
        if (accounts.length === 0) {
            logger_1.default.warn("[TwitterCron] Aucun compte Twitter configuré");
            return;
        }
        checkCount++;
        logger_1.default.info("[TwitterCron] Verification #" + checkCount + " de " + accounts.length + " compte(s)...");
        const results = await Promise.allSettled(accounts.map(async (account) => fetchTweetsForAccount(account)));
        const allTweets = [];
        for (const result of results) {
            if (result.status === "fulfilled") {
                allTweets.push(...result.value);
            }
        }
        if (allTweets.length === 0) {
            logger_1.default.info("[TwitterCron] Aucun tweet trouve");
            return;
        }
        // Deduplication via ProcessedTweets (SQLite)
        const freshTweets = [];
        for (const tweet of allTweets) {
            const existing = await prisma_1.default.processedTweets.findUnique({
                where: { tweetId: tweet.tweetId },
            });
            if (!existing) {
                freshTweets.push(tweet);
            }
        }
        if (freshTweets.length === 0) {
            logger_1.default.info("[TwitterCron] Tous les tweets sont déjà connus");
            return;
        }
        logger_1.default.info("[TwitterCron] " + freshTweets.length + " nouveau(x) tweet(s) à publier");
        for (const tweet of freshTweets) {
            // Barriere temporelle 48h
            const articleDate = new Date(tweet.pubDate);
            const limitDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
            if (isNaN(articleDate.getTime()) || articleDate < limitDate)
                continue;
            const platforms = detectPlatforms(tweet.content);
            // Fallback : TWITTER_CHANNEL_ID si aucune plateforme detectee
            const targetConfigs = platforms.length > 0
                ? platforms
                : [{
                        id: "steam",
                        channelId: config_1.config.twitterChannel,
                        color: TWITTER_BLUE,
                        label: "Twitter",
                        iconUrl: TWITTER_ICON,
                    }];
            // Deduplication des salons (Steam+Epic partagent le meme channel)
            const seenChannels = new Set();
            for (const cfg of targetConfigs) {
                if (!cfg.channelId || seenChannels.has(cfg.channelId))
                    continue;
                seenChannels.add(cfg.channelId);
                let channel = null;
                try {
                    const fetched = await client.channels.fetch(cfg.channelId);
                    if (fetched?.isTextBased())
                        channel = fetched;
                }
                catch { /* ignore */ }
                if (!channel) {
                    logger_1.default.warn("[TwitterCron] Salon " + cfg.channelId + " indisponible pour " + cfg.label);
                    continue;
                }
                const embedColor = cfg.id === "epic" && !platforms.length ? TWITTER_BLUE : cfg.color;
                // Traduire le contenu du tweet si nécessaire
                let translatedContent = tweet.content.slice(0, 2048) || "Contenu du tweet indisponible";
                try {
                    if ((0, translator_1.isLikelyEnglish)(tweet.content)) {
                        translatedContent = await (0, translator_1.translateToFrench)(tweet.content.slice(0, 2048));
                    }
                }
                catch (error) {
                    logger_1.default.debug(`[TwitterCron] Erreur traduction, utilisation texte original: ${error instanceof Error ? error.message : String(error)}`);
                }
                const embed = new discord_js_1.EmbedBuilder()
                    .setTitle("\uD83D\uDD25 Nouveau Tweet de @" + tweet.account)
                    .setURL(tweet.link)
                    .setColor(embedColor)
                    .setAuthor({
                    name: "@" + tweet.account,
                    iconURL: TWITTER_ICON,
                    url: "https://x.com/" + tweet.account,
                })
                    .setDescription(translatedContent)
                    .addFields({ name: "\uD83D\uDDA5\uFE0F Plateforme", value: cfg.label, inline: true })
                    .setFooter(FOOTER)
                    .setTimestamp();
                if (tweet.pubDate) {
                    embed.addFields({
                        name: "\uD83D\uDCC5 Publi\u00E9 le",
                        value: tweet.pubDate,
                        inline: true,
                    });
                }
                if (tweet.imageUrl) {
                    embed.setImage(tweet.imageUrl);
                }
                const row = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
                    .setLabel("\uD83D\uDD17 Ouvrir sur X")
                    .setStyle(discord_js_1.ButtonStyle.Link)
                    .setURL(tweet.link));
                try {
                    await channel.send({
                        content: "\uD83D\uDD14 **Nouveau tweet de @" + tweet.account + "**",
                        embeds: [embed],
                        components: [row],
                    });
                    logger_1.default.info("[TwitterCron] \u2713 " + cfg.label + " : @" + tweet.account);
                }
                catch (sendError) {
                    const sendMsg = sendError instanceof Error ? sendError.message : String(sendError);
                    logger_1.default.error("[TwitterCron] \u2717 Echec envoi " + cfg.label + ": " + sendMsg);
                    continue;
                }
                await new Promise((resolve) => setTimeout(resolve, 250));
            }
            await prisma_1.default.processedTweets.create({
                data: {
                    tweetId: tweet.tweetId,
                    account: tweet.account,
                    content: tweet.content.slice(0, 500),
                },
            });
            tweetsSent++;
        }
        const elapsed = Date.now() - startTime;
        logger_1.default.info("[TwitterCron] ✓ " + tweetsSent + " tweet(s) envoyé(s) en " + (elapsed / 1000).toFixed(1) + "s");
    }
    catch (error) {
        logger_1.default.error("[TwitterCron] Erreur critique: " + (error instanceof Error ? error.message : String(error)), { stack: error instanceof Error ? error.stack : undefined });
    }
    finally {
        isChecking = false;
    }
}
// Demarrage / Arret
function startTwitterMonitoring(client) {
    if (cronJob) {
        logger_1.default.warn("[TwitterCron] Déjà actif — ignoré");
        return;
    }
    if (!config_1.config.twitterAccounts || config_1.config.twitterAccounts.length === 0) {
        logger_1.default.warn("[TwitterCron] TWITTER_ACCOUNTS non configuré — surveillance désactivée");
        return;
    }
    const hasAnyChannel = config_1.config.twitterChannel || config_1.config.steamEpicChannel ||
        config_1.config.playstationChannel || config_1.config.xboxChannel || config_1.config.nintendoChannel;
    if (!hasAnyChannel) {
        logger_1.default.warn("[TwitterCron] Aucun CHANNEL_ID configuré — surveillance désactivée");
        return;
    }
    logger_1.default.info("[TwitterCron] ⏱️ Exécution Cron planifiée pour Twitter — toutes les 15 minutes");
    cronJob = node_cron_1.default.schedule("*/15 * * * *", () => {
        logger_1.default.info("[TwitterCron] ⏱️ Exécution Cron planifiée pour Twitter");
        checkTwitterAccounts(client).catch((err) => logger_1.default.error("[TwitterCron] Erreur cron: " + (err instanceof Error ? err.message : String(err)), { stack: err instanceof Error ? err.stack : undefined }));
    });
}
function stopTwitterMonitoring() {
    if (cronJob) {
        cronJob.stop();
        cronJob = null;
        logger_1.default.info("[TwitterCron] Arrêté");
    }
}
//# sourceMappingURL=twitterCron.js.map