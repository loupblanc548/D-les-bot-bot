"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkInstantGamingGiveaway = checkInstantGamingGiveaway;
exports.startInstantGamingCheck = startInstantGamingCheck;
exports.stopInstantGamingCheck = stopInstantGamingCheck;
const logger_1 = __importDefault(require("../utils/logger"));
const axios_1 = __importDefault(require("axios"));
const cheerio = __importStar(require("cheerio"));
const discord_js_1 = require("discord.js");
const prisma_1 = __importDefault(require("../prisma"));
const config_1 = require("../config");
const logs_1 = require("./logs");
const GIVEAWAY_BASE = config_1.config.instantGamingBaseUrl;
const GIVEAWAY_URL = GIVEAWAY_BASE + "/fr/giveaway/INSTANTGAMING";
const IG_ORANGE = 0xef7f1a;
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "DNT": "1",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Cache-Control": "max-age=0",
};
function cleanTitle(raw) {
    return raw.replace(/\s+/g, " ").trim();
}
function resolveUrl(href, base) {
    if (!href)
        return base;
    if (href.startsWith("http"))
        return href;
    if (href.startsWith("/"))
        return GIVEAWAY_BASE + href;
    return base + "/" + href;
}
async function scrapeGiveawayPage() {
    try {
        const response = await axios_1.default.get(GIVEAWAY_URL, {
            headers: HEADERS,
            timeout: 15000,
            maxRedirects: 5,
        });
        const html = response.data;
        const $ = cheerio.load(html);
        let title = $('[class*="giveaway"] h2').first().text() ||
            $('[class*="giveaway"] h3').first().text() ||
            $('.giveaway-container h2').first().text() ||
            $('.giveaway-container h3').first().text() ||
            $('[class*="prize"]').first().text() ||
            $('meta[property="og:title"]').attr("content") ||
            $("h1").first().text() ||
            $("title").text() ||
            "";
        if (!title) {
            logger_1.default.warn("[InstantGaming] Impossible d'extraire le titre.");
            return null;
        }
        title = cleanTitle(title);
        const image = $('meta[property="og:image"]').attr("content") ||
            $('.giveaway-container img').first().attr("src") ||
            $('[class*="giveaway"] img').first().attr("src") ||
            null;
        const resolvedImage = image ? resolveUrl(image, GIVEAWAY_URL) : null;
        const pageUrl = $('meta[property="og:url"]').attr("content") ||
            $('link[rel="canonical"]').attr("href") ||
            GIVEAWAY_URL;
        const slugMatch = pageUrl.match(/\/giveaway\/([^/?#]+)/i);
        const slug = slugMatch ? slugMatch[1].toUpperCase() : "INSTANTGAMING";
        return {
            id: slug,
            title,
            image: resolvedImage,
            url: pageUrl,
        };
    }
    catch (error) {
        logger_1.default.error("[InstantGaming] Erreur lors du scraping:", error instanceof Error ? error.message : String(error));
        return null;
    }
}
async function sendGiveawayEmbed(client, data) {
    const channelId = config_1.config.instantGamingChannel;
    if (!channelId) {
        logger_1.default.warn("[InstantGaming] INSTANT_GAMING_CHANNEL_ID non configure.");
        return;
    }
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
        logger_1.default.warn("[InstantGaming] Salon introuvable ou non textuel.");
        return;
    }
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle("🎁 NOUVEAU CONCOURS INSTANT GAMING !")
        .setDescription("## **" + data.title + "**\n\n" +
        "🔗 [Voir le concours](" + data.url + ")\n\n" +
        "📅 *Participez avant la fin du tirage au sort !*")
        .setColor(IG_ORANGE)
        .setFooter({
        text: "Instant Gaming • Concours",
        iconURL: GIVEAWAY_BASE + "/themes/igv2/images/favicon.png",
    })
        .setTimestamp();
    if (data.image) {
        embed.setImage(data.image);
    }
    const row = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
        .setLabel("🎮 Participer")
        .setStyle(discord_js_1.ButtonStyle.Link)
        .setURL(data.url));
    await channel.send({
        embeds: [embed],
        components: [row],
    });
    logger_1.default.info("[InstantGaming] Notification envoyee : " + data.title);
}
let isChecking = false;
async function checkInstantGamingGiveaway(client) {
    if (isChecking)
        return;
    isChecking = true;
    try {
        logger_1.default.info("[InstantGaming] Verification des concours...");
        const data = await scrapeGiveawayPage();
        if (!data) {
            logger_1.default.info("[InstantGaming] Aucune donnee extraite.");
            return;
        }
        let inserted = false;
        try {
            await prisma_1.default.igGiveaway.upsert({
                where: { id: data.id },
                update: {},
                create: {
                    id: data.id,
                    title: data.title,
                },
            });
            inserted = true;
            logger_1.default.info("[InstantGaming] Nouveau concours detecte : " + data.title);
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger_1.default.error(`[InstantGaming] Erreur DB: ${err.message}`, { stack: err.stack });
            await (0, logs_1.sendErrorLog)("InstantGaming DB", err, client);
            return;
        }
        if (inserted) {
            try {
                await sendGiveawayEmbed(client, data);
            }
            catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                logger_1.default.error("[InstantGaming] Erreur d'envoi:", err.message);
                await (0, logs_1.sendErrorLog)("InstantGaming sendGiveawayEmbed", err, client);
            }
        }
    }
    catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger_1.default.error("[InstantGaming] Erreur globale:", err.message);
        await (0, logs_1.sendErrorLog)("InstantGaming check", err, client);
    }
    finally {
        isChecking = false;
    }
}
const CHECK_INTERVAL_MS = config_1.config.igGiveawayIntervalMs;
let intervalId = null;
function startInstantGamingCheck(client) {
    if (intervalId) {
        logger_1.default.warn("[InstantGaming] Surveillance deja active.");
        return;
    }
    logger_1.default.info("[InstantGaming] Surveillance activee (intervalle: 12h)");
    checkInstantGamingGiveaway(client).catch((err) => logger_1.default.error("[InstantGaming] Erreur check initial:", err));
    intervalId = setInterval(() => {
        checkInstantGamingGiveaway(client).catch((err) => logger_1.default.error("[InstantGaming] Erreur check cyclique:", err));
    }, CHECK_INTERVAL_MS);
}
function stopInstantGamingCheck() {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        logger_1.default.info("[InstantGaming] Surveillance arretee.");
    }
}
//# sourceMappingURL=instantgaming.js.map