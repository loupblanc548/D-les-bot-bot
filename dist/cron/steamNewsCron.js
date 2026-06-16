"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLATFORM_CONFIGS = void 0;
exports.checkTrackedGames = checkTrackedGames;
exports.startSteamNewsMonitoring = startSteamNewsMonitoring;
exports.stopSteamNewsMonitoring = stopSteamNewsMonitoring;
const discord_js_1 = require("discord.js");
const prisma_1 = __importDefault(require("../prisma"));
const logger_1 = __importDefault(require("../utils/logger"));
const config_1 = require("../config");
const retry_1 = require("../utils/retry");
const cache_1 = require("../utils/cache");
const metrics_1 = require("../utils/metrics");
// Constantes
const RSS_FEED_URL = "https://api.rss2json.com/v1/api.json?rss_url=https://www.reddit.com/r/patchnotes/.rss";
const FOOTER = { text: "Patch Notes Tracker • Surveillance automatique" };
// Configuration des plateformes
const PLATFORM_CONFIGS = {
    epic: {
        channelId: config_1.config.steamEpicChannel,
        color: 0x2a2a2a,
        iconUrl: "https://store.epicgames.com/favicon.ico",
        label: "Epic Games",
    },
    steam: {
        channelId: config_1.config.steamEpicChannel,
        color: 0x000080,
        iconUrl: "https://store.steampowered.com/favicon.ico",
        label: "Steam",
    },
    playstation: {
        channelId: config_1.config.playstationChannel,
        color: 0x003791,
        iconUrl: "https://www.playstation.com/favicon.ico",
        label: "PlayStation",
    },
    xbox: {
        channelId: config_1.config.xboxChannel,
        color: 0x107c10,
        iconUrl: "https://www.xbox.com/favicon.ico",
        label: "Xbox",
    },
    nintendo: {
        channelId: config_1.config.nintendoChannel,
        color: 0xe60012,
        iconUrl: "https://www.nintendo.com/favicon.ico",
        label: "Nintendo Switch",
    },
};
exports.PLATFORM_CONFIGS = PLATFORM_CONFIGS;
// Etat interne
let intervalId = null;
let isChecking = false;
let checkCount = 0;
// Detection des plateformes
/**
 * Detecte TOUTES les plateformes mentionnees dans le titre.
 * Un patch note peut etre multiplateforme => route vers chaque salon.
 */
function detectPlatforms(title) {
    const t = title.toLowerCase();
    const platforms = [];
    if (/\b(epic|epic games)\b/.test(t)) {
        platforms.push("epic");
    }
    if (/\b(steam|gog|pc)\b/.test(t)) {
        platforms.push("steam");
    }
    if (/\b(ps4|ps5|playstation|psn)\b/.test(t)) {
        platforms.push("playstation");
    }
    if (/\b(xbox|series\s*[xs]|xbl|microsoft)\b/.test(t)) {
        platforms.push("xbox");
    }
    if (/\b(switch|nintendo)\b/.test(t)) {
        platforms.push("nintendo");
    }
    return platforms;
}
/**
 * Nettoie le contenu HTML pour générer un résumé propre
 * @param content - Contenu brut avec HTML
 * @returns Résumé nettoyé (400-500 caractères)
 */
function cleanSummary(content) {
    // Supprimer les balises HTML
    const cleanText = content
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
    // Limiter à 400-500 caractères
    return cleanText.length > 500 ? cleanText.slice(0, 497) + '...' : cleanText;
}
/**
 * Vérifie si un patch note a déjà été traité
 * @param guid - Identifiant unique du patch note
 * @returns true si déjà traité, false sinon
 */
async function isPatchProcessed(guid) {
    const cached = cache_1.dbCache.get(guid);
    if (cached !== undefined)
        return cached;
    try {
        const existing = await prisma_1.default.processedPatchNotes.findUnique({ where: { guid } });
        const result = !!existing;
        cache_1.dbCache.set(guid, result);
        return result;
    }
    catch (error) {
        logger_1.default.warn(`[PatchNotesCron] Erreur verification ProcessedPatchNotes: ${error instanceof Error ? error.message : String(error)}`);
        return false;
    }
}
/**
 * Marque un patch note comme traité dans la base de données
 * @param guid - Identifiant unique du patch note
 * @param title - Titre du patch note
 */
async function markPatchProcessed(guid, title) {
    try {
        await prisma_1.default.processedPatchNotes.create({ data: { guid, title: title.slice(0, 255) } });
        cache_1.dbCache.set(guid, true);
    }
    catch {
        logger_1.default.debug("[PatchNotesCron] Patch note deja persiste, ignore");
    }
}
// Resolution des salons
async function resolveChannel(client, channelId) {
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel?.isTextBased()) {
            logger_1.default.error("[PatchNotesCron] Salon " + channelId + " introuvable ou non textuel");
            return null;
        }
        return channel;
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger_1.default.error("[PatchNotesCron] Erreur fetch salon " + channelId + ": " + msg);
        return null;
    }
}
// Fonction principale de verification
async function checkTrackedGames(client) {
    // Securite anti-crash : verification stricte des variables d'environnement
    const activePlatforms = Object.keys(PLATFORM_CONFIGS).filter((p) => PLATFORM_CONFIGS[p].channelId);
    if (activePlatforms.length === 0) {
        logger_1.default.warn("[PatchNotesCron] Aucun CHANNEL_ID configure (STEAM_EPIC_CHANNEL_ID, PLAYSTATION_CHANNEL_ID, XBOX_CHANNEL_ID, NINTENDO_CHANNEL_ID) — cron desactive");
        return;
    }
    if (isChecking) {
        logger_1.default.info("[PatchNotesCron] Verification deja en cours, ignoree");
        return;
    }
    isChecking = true;
    const startTime = Date.now();
    let patchesSent = 0;
    try {
        checkCount++;
        logger_1.default.info("[PatchNotesCron] Verification #" + checkCount + " — fetch RSS Reddit r/patchnotes...");
        let feed;
        try {
            // Utiliser rss2json avec retry logic
            feed = await (0, retry_1.retry)(async () => {
                const response = await fetch(RSS_FEED_URL);
                if (!response.ok)
                    throw new Error(`HTTP ${response.status}`);
                return response.json();
            }, 3, 1000);
        }
        catch (rssError) {
            const msg = rssError instanceof Error ? rssError.message : String(rssError);
            logger_1.default.warn("[PatchNotesCron] Flux Reddit inaccessible: " + msg);
            return;
        }
        if (!feed?.items?.length) {
            logger_1.default.info("[PatchNotesCron] Aucun article trouve dans le flux");
            return;
        }
        logger_1.default.info("[PatchNotesCron] " + feed.items.length + " article(s) recupere(s) du flux RSS");
        // Deduplication via ProcessedPatchNotes (guid)
        const freshItems = [];
        for (const item of feed.items) {
            const guid = item.guid || item.link || item.title;
            if (!guid)
                continue;
            if (!(await isPatchProcessed(guid))) {
                freshItems.push(item);
            }
        }
        if (freshItems.length === 0) {
            logger_1.default.info("[PatchNotesCron] Tous les articles sont deja connus");
            return;
        }
        logger_1.default.info("[PatchNotesCron] " + freshItems.length + " nouveau(x) article(s) a router");
        // Routage multi-plateforme
        for (const item of freshItems) {
            // ⏱️ Barriere temporelle 48h : ignorer les articles trop anciens (evite le re-post massif apres reset BDD)
            const articleDate = new Date(item.pubDate);
            const limitDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
            if (isNaN(articleDate.getTime()) || articleDate < limitDate)
                continue;
            const title = item.title ?? "Sans titre";
            const platforms = detectPlatforms(title);
            const uniquePlatforms = [...new Set(platforms)];
            // Si aucune plateforme détectée, ignorer
            if (uniquePlatforms.length === 0) {
                logger_1.default.debug(`[PatchNotesCron] Plateforme non detectee pour: ${title.slice(0, 80)}`);
                continue;
            }
            const link = item.link ?? "";
            const description = cleanSummary(item.contentSnippet || item.content || "Nouveau patch note disponible !");
            const pubDateStr = item.pubDate
                ? "<t:" + Math.floor(new Date(item.pubDate).getTime() / 1000) + ":D>"
                : "Date inconnue";
            let sent = false;
            for (const platform of uniquePlatforms) {
                const cfg = PLATFORM_CONFIGS[platform];
                if (!cfg.channelId) {
                    logger_1.default.warn(`[PatchNotesCron] CHANNEL_ID manquant pour ${platform}, skip`);
                    continue;
                }
                const channel = await resolveChannel(client, cfg.channelId);
                if (!channel)
                    continue;
                const embed = new discord_js_1.EmbedBuilder()
                    .setTitle("📋 " + title)
                    .setURL(link)
                    .setColor(cfg.color)
                    .setAuthor({
                    name: cfg.label,
                    iconURL: cfg.iconUrl,
                })
                    .setDescription(description)
                    .addFields({ name: "📅 Publie le", value: pubDateStr, inline: true }, { name: "🔗 Lien", value: link ? "[Voir le patch note](" + link + ")" : "Lien indisponible", inline: true }, { name: "🖥️ Plateforme", value: cfg.label, inline: true })
                    .setFooter(FOOTER)
                    .setTimestamp();
                try {
                    await channel.send({
                        content: "📋 **Nouveau patch note detecte sur " + cfg.label + " !**",
                        embeds: [embed],
                    });
                    sent = true;
                    logger_1.default.info("[PatchNotesCron] ✓ " + cfg.label + " : \"" + title.slice(0, 80) + "\"");
                }
                catch (sendError) {
                    const sendMsg = sendError instanceof Error ? sendError.message : String(sendError);
                    logger_1.default.error("[PatchNotesCron] ✗ Echec envoi " + cfg.label + ": " + sendMsg);
                }
                await new Promise((resolve) => setTimeout(resolve, 250));
            }
            // Persister dans la BDD (une seule fois, meme si multi-plateforme)
            const guid = item.guid || item.link || item.title;
            if (guid) {
                await markPatchProcessed(guid, title);
                if (sent)
                    patchesSent++;
            }
        }
        const elapsed = Date.now() - startTime;
        logger_1.default.info("[PatchNotesCron] ✓ " + patchesSent + " patch note(s) envoye(s) en " + (elapsed / 1000).toFixed(1) + "s");
        // Enregistrer les métriques
        metrics_1.metricsCollector.recordProcessing("patchNotes", true, elapsed);
    }
    catch (error) {
        logger_1.default.error("[PatchNotesCron] Erreur critique: " + (error instanceof Error ? error.message : String(error)), { stack: error instanceof Error ? error.stack : undefined });
        metrics_1.metricsCollector.recordProcessing("patchNotes", false, Date.now() - startTime);
    }
    finally {
        isChecking = false;
    }
}
function startSteamNewsMonitoring(client) {
    if (intervalId) {
        logger_1.default.warn("[PatchNotesCron] Deja actif — ignore");
        return;
    }
    const intervalMs = 600000; // 10 minutes
    logger_1.default.info("[PatchNotesCron] Demarrage — intervalle " + (intervalMs / 60000).toFixed(1) + " min");
    checkTrackedGames(client).catch((err) => logger_1.default.error("[PatchNotesCron] Erreur check initial: " + (err instanceof Error ? err.message : String(err)), { stack: err instanceof Error ? err.stack : undefined }));
    intervalId = setInterval(() => {
        checkTrackedGames(client).catch((err) => logger_1.default.error("[PatchNotesCron] Erreur check periodique: " + (err instanceof Error ? err.message : String(err)), { stack: err instanceof Error ? err.stack : undefined }));
    }, intervalMs);
}
function stopSteamNewsMonitoring() {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        logger_1.default.info("[PatchNotesCron] Arrete");
    }
}
//# sourceMappingURL=steamNewsCron.js.map