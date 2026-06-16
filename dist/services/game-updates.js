"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkGameUpdates = checkGameUpdates;
exports.startGameUpdatesMonitoring = startGameUpdatesMonitoring;
exports.stopGameUpdatesMonitoring = stopGameUpdatesMonitoring;
const logger_1 = __importDefault(require("../utils/logger"));
const discord_js_1 = require("discord.js");
const config_1 = require("../config");
const prisma_1 = __importDefault(require("../prisma"));
const rss_parser_1 = __importDefault(require("rss-parser"));
const UPDATE_SOURCES = {
    steam: "https://store.steampowered.com/feeds/news/app/",
    epic: "https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions",
    playstation: "https://blog.playstation.com/feed/",
    xbox: "https://news.xbox.com/en-us/feed/",
};
const TRACKED_GAMES = [
    { id: "730", name: "Counter-Strike 2", platform: "steam" },
    { id: "1172470", name: "Apex Legends", platform: "steam" },
    { id: "578080", name: "PUBG: Battlegrounds", platform: "steam" },
    { id: "1091500", name: "Cyberpunk 2077", platform: "steam" },
    { id: "1245620", name: "ELDEN RING", platform: "steam" },
];
let updateCheckInterval = null;
const CHECK_INTERVAL_MS = 3600000; // 1 heure
/**
 * Vérifie les mises à jour de jeux depuis Steam
 */
async function checkSteamUpdates() {
    const updates = [];
    const parser = new rss_parser_1.default();
    for (const game of TRACKED_GAMES.filter(g => g.platform === "steam")) {
        try {
            const feed = await parser.parseURL(`${UPDATE_SOURCES.steam}${game.id}`);
            for (const item of feed.items.slice(0, 3)) {
                const title = item.title || "";
                const description = item.contentSnippet || item.content || "";
                const link = item.link || "";
                const pubDate = item.pubDate || "";
                // Vérifier si c'est une mise à jour
                if (title.toLowerCase().includes("update") ||
                    title.toLowerCase().includes("patch") ||
                    title.toLowerCase().includes("hotfix")) {
                    const update = {
                        gameId: game.id,
                        gameName: game.name,
                        platform: "steam",
                        updateType: title.toLowerCase().includes("hotfix") ? "hotfix" : "patch",
                        title,
                        description: description.replace(/<[^>]*>/g, "").substring(0, 500),
                        url: link,
                        publishedAt: new Date(pubDate),
                    };
                    updates.push(update);
                }
            }
        }
        catch (error) {
            logger_1.default.error(`[GameUpdates] Erreur lors de la vérification des mises à jour Steam pour ${game.name}:`, error);
        }
    }
    return updates;
}
/**
 * Vérifie si une mise à jour a déjà été traitée
 */
async function isUpdateProcessed(updateId) {
    const existing = await prisma_1.default.processedGameUpdate.findUnique({
        where: { updateId },
    });
    return !!existing;
}
/**
 * Marque une mise à jour comme traitée
 */
async function markUpdateProcessed(updateId) {
    await prisma_1.default.processedGameUpdate.create({
        data: { updateId },
    });
}
/**
 * Envoie une notification de mise à jour
 */
async function sendUpdateNotification(client, update) {
    if (!config_1.config.logChannel) {
        logger_1.default.error("[GameUpdates] Channel de logs non configuré");
        return;
    }
    const channel = client.channels.cache.get(config_1.config.logChannel);
    if (!channel || !channel.isTextBased()) {
        logger_1.default.error("[GameUpdates] Channel de logs non disponible");
        return;
    }
    const colors = {
        patch: 0x00ff00,
        maintenance: 0xffaa00,
        hotfix: 0xff6600,
        announcement: 0x00aaff,
    };
    const emojis = {
        patch: "🔧",
        maintenance: "🔨",
        hotfix: "⚡",
        announcement: "📢",
    };
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle(`${emojis[update.updateType]} ${update.gameName} - ${update.updateType.toUpperCase()}`)
        .setDescription(update.title)
        .setColor(colors[update.updateType])
        .addFields({
        name: "Plateforme",
        value: update.platform.toUpperCase(),
        inline: true,
    }, {
        name: "Type",
        value: update.updateType.toUpperCase(),
        inline: true,
    }, {
        name: "Publié le",
        value: update.publishedAt.toLocaleString(),
        inline: true,
    })
        .setURL(update.url)
        .setTimestamp();
    if (update.description) {
        embed.addFields({
            name: "Description",
            value: update.description,
            inline: false,
        });
    }
    try {
        await channel.send({ embeds: [embed] });
        logger_1.default.info(`[GameUpdates] Notification envoyée pour ${update.gameName}`);
    }
    catch (error) {
        logger_1.default.error("[GameUpdates] Erreur lors de l'envoi de la notification:", error);
    }
}
/**
 * Vérifie et traite les mises à jour de jeux
 */
async function checkGameUpdates(client) {
    logger_1.default.info("[GameUpdates] Vérification des mises à jour de jeux...");
    const updates = await checkSteamUpdates();
    for (const update of updates) {
        const updateId = `${update.gameId}-${update.publishedAt.getTime()}`;
        if (!(await isUpdateProcessed(updateId))) {
            await sendUpdateNotification(client, update);
            await markUpdateProcessed(updateId);
        }
    }
    logger_1.default.info(`[GameUpdates] ${updates.length} mise(s) à jour vérifiée(s)`);
}
/**
 * Démarre la surveillance des mises à jour de jeux
 */
function startGameUpdatesMonitoring(client) {
    if (updateCheckInterval) {
        logger_1.default.warn("[GameUpdates] Surveillance déjà active");
        return;
    }
    logger_1.default.info("[GameUpdates] Démarrage de la surveillance des mises à jour");
    // Vérification immédiate
    checkGameUpdates(client);
    // Vérification périodique
    updateCheckInterval = setInterval(() => {
        checkGameUpdates(client);
    }, CHECK_INTERVAL_MS);
}
/**
 * Arrête la surveillance des mises à jour de jeux
 */
function stopGameUpdatesMonitoring() {
    if (updateCheckInterval) {
        clearInterval(updateCheckInterval);
        updateCheckInterval = null;
        logger_1.default.info("[GameUpdates] Surveillance arrêtée");
    }
}
//# sourceMappingURL=game-updates.js.map