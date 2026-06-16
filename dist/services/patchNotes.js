"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startPatchNotesService = startPatchNotesService;
exports.stopPatchNotesService = stopPatchNotesService;
const logger_1 = __importDefault(require("../utils/logger"));
const discord_js_1 = require("discord.js");
const fast_xml_parser_1 = require("fast-xml-parser");
const ai_1 = require("./ai");
const image_helpers_1 = require("../utils/image-helpers");
const prisma_1 = __importDefault(require("../prisma"));
const config_1 = require("../config");
const feeds_1 = require("./feeds");
const RSS_FEEDS = [];
function initFeeds() {
    if (config_1.config.fortniteChannel)
        RSS_FEEDS.push({ game: "Fortnite", url: "https://www.fortnite.com/news/rss", channelId: config_1.config.fortniteChannel });
    if (config_1.config.dedicatedChannel)
        RSS_FEEDS.push({ game: "Helldivers 2", url: "https://store.steampowered.com/feeds/news/app/553850/?l=french", channelId: config_1.config.dedicatedChannel });
    if (config_1.config.dedicatedChannel)
        RSS_FEEDS.push({ game: "Call of Duty Warzone", url: "https://www.callofduty.com/blog/rss", channelId: config_1.config.dedicatedChannel });
}
const xmlParser = new fast_xml_parser_1.XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
});
// Extrait le texte d'un champ XML : string simple ou objet { #text: "..." }
function textOf(val) {
    return typeof val === "string" ? val : val?.["#text"] || "";
}
async function fetchPatchNotes(feed) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(feed.url, { signal: controller.signal });
        clearTimeout(timeout);
        if (!response.ok)
            return null;
        const xml = await response.text();
        const parsed = xmlParser.parse(xml);
        // Support RSS 2.0 et Atom
        let firstItem = null;
        if (parsed.rss?.channel?.item) {
            firstItem = Array.isArray(parsed.rss.channel.item)
                ? parsed.rss.channel.item[0]
                : parsed.rss.channel.item;
        }
        if (!firstItem && parsed.feed?.entry) {
            firstItem = Array.isArray(parsed.feed.entry)
                ? parsed.feed.entry[0]
                : parsed.feed.entry;
        }
        if (!firstItem)
            return null;
        const title = textOf(firstItem.title).trim() || feed.game + " Update";
        const rawContent = (textOf(firstItem.description) ||
            textOf(firstItem.summary) ||
            textOf(firstItem.content) ||
            textOf(firstItem["content:encoded"]) ||
            "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 3000);
        let url = "";
        if (typeof firstItem.link === "string") {
            url = firstItem.link;
        }
        else if (firstItem.link?.["@_href"]) {
            url = firstItem.link["@_href"];
        }
        else if (firstItem.link?.["#text"]) {
            url = firstItem.link["#text"];
        }
        url = url.trim();
        if (!rawContent)
            return null;
        return { game: feed.game, title, url, rawContent };
    }
    catch {
        return null;
    }
}
async function summarizeWithAI(rawContent) {
    try {
        const client = (0, ai_1.getOpenAIClient)();
        const completion = await client.chat.completions.create({
            model: "openai/gpt-4o-mini",
            messages: [
                { role: "system", content: "Tu es un assistant gaming d elite. Prends ce patch note brut et resume-le sous forme de 5 points cles indispensables pour les joueurs. Style direct, punchy, sans fioritures. Reponds en francais." },
                { role: "user", content: rawContent },
            ],
            max_tokens: 500,
            temperature: 0.7,
        });
        return completion.choices[0]?.message?.content || "Resume indisponible.";
    }
    catch {
        return "Resume indisponible (erreur IA).";
    }
}
let patchCheckInterval = null;
function startPatchNotesService(client) {
    initFeeds();
    if (RSS_FEEDS.length === 0) {
        logger_1.default.info("[PatchNotes] Aucun flux RSS configure");
        return;
    }
    logger_1.default.info("[PatchNotes] Surveillance de " + RSS_FEEDS.length + " flux RSS");
    patchCheckInterval = setInterval(() => checkAllFeeds(client), config_1.config.patchNotesIntervalMs);
    checkAllFeeds(client);
}
function stopPatchNotesService() {
    if (patchCheckInterval) {
        clearInterval(patchCheckInterval);
        patchCheckInterval = null;
    }
}
async function checkAllFeeds(client) {
    for (const feed of RSS_FEEDS) {
        try {
            const patchNote = await fetchPatchNotes(feed);
            if (!patchNote)
                continue;
            const alreadyNotified = await prisma_1.default.notification.findFirst({ where: { sourceId: "patch-" + feed.game, content: patchNote.title } });
            if (alreadyNotified)
                continue;
            const summary = await summarizeWithAI(patchNote.rawContent);
            const lines = summary.split(/\n\s*\n|\n(?=\d+\.|\-|\*)/).filter(Boolean).slice(0, 5);
            const embed = new discord_js_1.EmbedBuilder()
                .setTitle(feeds_1.PLATFORM_LABELS["patch-notes"] + " — " + feed.game)
                .setColor(feeds_1.PLATFORM_COLORS["patch-notes"])
                .setDescription(lines.map((p, i) => "**" + (i + 1) + ".** " + p.trim()).join("\n") || summary)
                .setFooter({ text: "Resume genere automatiquement par IA • " + new Date().toLocaleDateString("fr-FR") })
                .setTimestamp();
            if (patchNote.url)
                embed.setURL(patchNote.url);
            // Ajout automatique d'image de l'article (og:image)
            try {
                if (patchNote.url) {
                    const ogImage = await (0, image_helpers_1.getOgImage)(patchNote.url);
                    if (ogImage)
                        embed.setImage(ogImage);
                }
            }
            catch { }
            try {
                const channel = await client.channels.fetch(feed.channelId);
                if (channel?.isTextBased()) {
                    await channel.send({ embeds: [embed] });
                    await prisma_1.default.notification.create({ data: { sourceId: "patch-" + feed.game, platform: "patch-notes", content: patchNote.title, url: patchNote.url } });
                }
            }
            catch (err) {
                logger_1.default.error("[PatchNotes] Erreur envoi Discord:", String(err));
            }
        }
        catch (err) {
            logger_1.default.error("[PatchNotes] Erreur flux " + feed.game + ":", String(err));
        }
    }
}
//# sourceMappingURL=patchNotes.js.map