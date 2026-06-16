"use strict";
/**
 * freeGamesCron.ts — Cron Jeux Gratuits
 *
 * Pipeline complet : scraper-bridge → ScraperManager → translator → ChannelRouter
 *
 * Surveille r/FreeGameFindings (Reddit RSS) et l'API Epic Games pour
 * détecter les nouveaux jeux gratuits, les traduire en français,
 * et les router vers le(s) salon(s) Discord approprié(s).
 *
 * Fonctionne toutes les 10 minutes avec barrière 48h et déduplication Prisma.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startFreeGamesMonitoring = startFreeGamesMonitoring;
exports.stopFreeGamesMonitoring = stopFreeGamesMonitoring;
exports.checkFreeGames = checkFreeGames;
const node_cron_1 = __importDefault(require("node-cron"));
const axios_1 = __importDefault(require("axios"));
const config_1 = require("../config");
const logger_1 = __importDefault(require("../utils/logger"));
const translator_1 = require("../utils/translator");
const ScraperManager_1 = require("../managers/ScraperManager");
const scraper_bridge_1 = require("../scrapers/scraper-bridge");
const ChannelRouter_1 = require("../managers/ChannelRouter");
const globalPatchNotesCron_1 = require("./globalPatchNotesCron");
// ─── Constantes ───────────────────────────────────────────────────────────────
const DIRECT_REDDIT_RSS_URL = config_1.config.redditFreeGamesRss;
const RSS2JSON_FALLBACK_URL = `${config_1.config.rss2jsonBaseUrl}?rss_url=${encodeURIComponent(config_1.config.redditFreeGamesRss)}`;
const EPIC_FREE_GAMES_API = config_1.config.epicGamesRss;
// ─── Helpers ──────────────────────────────────────────────────────────────────
/**
 * Extrait l'ID unique Reddit du lien (ex: /comments/abc123/... → abc123).
 */
function generateFreeGameId(link) {
    const match = link.match(/\/comments\/([a-z0-9]+)\//i);
    return match?.[1] || link;
}
/**
 * Génère un résumé propre à partir du contenu HTML/texte.
 */
function generateSummary(content) {
    if (!content)
        return "Aucune description disponible";
    let cleanText = content.replace(/<[^>]*>/g, "");
    cleanText = cleanText.replace(new RegExp("\[/?[a-z]+\]", "gi"), "");
    cleanText = cleanText.replace(/https?:\/\/[^\s]+/g, "");
    cleanText = cleanText.replace(/\s+/g, " ").trim();
    if (cleanText.length > 500) {
        cleanText = cleanText.substring(0, 500);
        const lastSpace = cleanText.lastIndexOf(" ");
        if (lastSpace > 400) {
            cleanText = cleanText.substring(0, lastSpace);
        }
        cleanText += "...";
    }
    return cleanText;
}
// ─── Pipeline de traitement ────────────────────────────────────────────────────
/**
 * Pipeline complet pour un jeu gratuit :
 * 1. Barrière temporelle 48h (ScraperManager)
 * 2. Déduplication (ScraperManager → ContentType.FREE_GAME)
 * 3. Traduction (translator)
 * 4. Routage multi-salon (ChannelRouter)
 * 5. Marquage comme traité (ScraperManager)
 */
async function processFreeGame(client, item) {
    // ═══ Étape 1: Barrière temporelle 48h (ScraperManager) ════════════════
    if (!(0, ScraperManager_1.isWithinTemporalBarrier)(item.pubDate)) {
        logger_1.default.debug(`[FreeGamesCron] Item ignoré (barrière 48h): ${item.pubDate}`);
        return;
    }
    const gameId = item.guid || generateFreeGameId(item.link);
    // ═══ Étape 2: Déduplication (ScraperManager) ══════════════════════════
    const isNew = await (0, ScraperManager_1.isNewItem)(ScraperManager_1.ContentType.FREE_GAME, gameId);
    if (!isNew) {
        return;
    }
    // ═══ Étape 3: Traduction (translator) ════════════════════════════════
    let translatedTitle = item.title;
    let translatedContent = generateSummary(item.content || item.contentSnippet || "");
    try {
        const titleResult = await (0, translator_1.translateAutoToFrench)(item.title);
        if (titleResult && titleResult.detectedLanguage !== "fr") {
            translatedTitle = titleResult.translatedText;
        }
        const contentResult = await (0, translator_1.translateAutoToFrench)(translatedContent);
        if (contentResult && contentResult.detectedLanguage !== "fr") {
            translatedContent = contentResult.translatedText;
        }
    }
    catch (error) {
        logger_1.default.debug(`[FreeGamesCron] Erreur traduction, utilisation texte original: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (translatedContent.length > 1800) {
        translatedContent = translatedContent.slice(0, 1797) + "...";
    }
    // ═══ Étape 4: Routage multi-salon (ChannelRouter) ════════════════════
    const imageUrl = item.thumbnail || item.enclosure?.url;
    try {
        const routingResult = await (0, ChannelRouter_1.routeArticle)(client, translatedTitle, translatedContent, item.link, item.pubDate, imageUrl);
        logger_1.default.info(`[FreeGamesCron] Routé: "${translatedTitle.slice(0, 60)}" → ${routingResult.sentTo.length} salon(s), ${routingResult.errors.length} erreur(s)`);
        if (routingResult.errors.length > 0) {
            logger_1.default.warn(`[FreeGamesCron] Erreurs routage: ${routingResult.errors.join("; ")}`);
        }
        // ═══ Étape 5: Marquage — seulement si routé ════════════════════════
        if (routingResult.routed) {
            await (0, ScraperManager_1.markAsProcessed)(ScraperManager_1.ContentType.FREE_GAME, gameId);
        }
    }
    catch (error) {
        logger_1.default.error(`[FreeGamesCron] Échec routage: ${error instanceof Error ? error.message : String(error)}`, { stack: error instanceof Error ? error.stack : undefined });
    }
}
// ─── Fetch & Orchestration ─────────────────────────────────────────────────────
async function checkFreeGames(client) {
    logger_1.default.info("[FreeGamesCron] Vérification des jeux gratuits...");
    try {
        let items = [];
        // Plan A: Scrapling sur le RSS Reddit direct (anti-bot bypass)
        try {
            const scraped = await (0, scraper_bridge_1.scrapeRssFeed)(DIRECT_REDDIT_RSS_URL, 15000);
            if (scraped.raw) {
                items = (0, globalPatchNotesCron_1.parseRssXmlItems)(scraped.raw);
                if (items.length === 0) {
                    try {
                        const parsed = JSON.parse(scraped.raw);
                        items = (parsed.items || parsed.entries || []);
                    }
                    catch {
                        logger_1.default.warn("[FreeGamesCron] Unable to parse scraped raw content");
                    }
                }
            }
            else if (scraped.items) {
                items = scraped.items;
            }
        }
        catch (scraperErr) {
            logger_1.default.warn('[FreeGamesCron] Scrapling failed, falling back to rss2json: ' + (scraperErr instanceof Error ? scraperErr.message : String(scraperErr)));
            // Plan B: rss2json
            try {
                const response = await axios_1.default.get(RSS2JSON_FALLBACK_URL, { timeout: 10000 });
                items = (response.data.items || []);
            }
            catch (axiosErr) {
                logger_1.default.warn('[FreeGamesCron] rss2json failed, trying direct Reddit RSS: ' + (axiosErr instanceof Error ? axiosErr.message : String(axiosErr)));
                // Plan C: axios direct Reddit RSS
                try {
                    const directResponse = await axios_1.default.get(DIRECT_REDDIT_RSS_URL, { timeout: 15000 });
                    items = (0, globalPatchNotesCron_1.parseRssXmlItems)(directResponse.data);
                }
                catch {
                    // Plan D: API Epic Games
                    logger_1.default.warn('[FreeGamesCron] Direct Reddit RSS failed, trying Epic Games API');
                    try {
                        const epicResponse = await axios_1.default.get(EPIC_FREE_GAMES_API, { timeout: 15000 });
                        const epicData = epicResponse.data;
                        const elements = epicData?.data?.Catalog?.searchStore?.elements;
                        if (elements && Array.isArray(elements)) {
                            items = elements
                                .filter((e) => {
                                // L'API Epic retourne des jeux avec promotions.promotionalOffers pour les gratuits
                                const offers = e.promotions;
                                return offers?.promotionalOffers && Array.isArray(offers.promotionalOffers) && offers.promotionalOffers.length > 0;
                            })
                                .map((e) => ({
                                title: String(e.title || "Jeu gratuit Epic Games"),
                                link: `https://store.epicgames.com/p/${e.productSlug || e.catalogNs?.mappings?.[0]?.pageSlug || ''}`,
                                pubDate: new Date().toISOString(),
                                content: String(e.description || ""),
                                guid: String(e.productSlug || e.id || ""),
                                thumbnail: Array.isArray(e.keyImages) ? String(e.keyImages[0]?.url || "") : "",
                            }));
                            logger_1.default.info(`[FreeGamesCron] ${items.length} jeu(x) gratuit(s) Epic Games détecté(s)`);
                        }
                    }
                    catch {
                        logger_1.default.error('[FreeGamesCron] All attempts failed (Scrapling, rss2json, direct Reddit, Epic API)');
                        return;
                    }
                }
            }
        }
        if (!Array.isArray(items) || items.length === 0) {
            logger_1.default.warn("[FreeGamesCron] Aucun jeu gratuit trouvé");
            return;
        }
        let processedCount = 0;
        for (const item of items.slice(0, 10)) {
            try {
                await processFreeGame(client, item);
                processedCount++;
            }
            catch (error) {
                logger_1.default.error(`[FreeGamesCron] Erreur traitement jeu: ${error instanceof Error ? error.message : String(error)}`, { stack: error instanceof Error ? error.stack : undefined });
            }
        }
        logger_1.default.info(`[FreeGamesCron] ${processedCount} jeu(x) gratuit(s) traité(s)`);
    }
    catch (error) {
        if (axios_1.default.isAxiosError(error)) {
            if (error.response?.status === 429) {
                logger_1.default.warn("[FreeGamesCron] Rate limit (429) - réessayer plus tard");
            }
            else {
                logger_1.default.error(`[FreeGamesCron] Erreur HTTP: ${error.response?.status || error.message}`, { stack: error.stack });
            }
        }
        else {
            logger_1.default.error(`[FreeGamesCron] Erreur critique: ${error instanceof Error ? error.message : String(error)}`, { stack: error instanceof Error ? error.stack : undefined });
        }
    }
}
// ─── Cron Management ───────────────────────────────────────────────────────────
let cronJob = null;
let isChecking = false;
function startFreeGamesMonitoring(client) {
    if (cronJob) {
        logger_1.default.warn("[FreeGamesCron] Déjà actif — ignoré");
        return;
    }
    logger_1.default.info("[FreeGamesCron] ⏱️ Surveillance des jeux gratuits — toutes les 10 minutes");
    cronJob = node_cron_1.default.schedule("*/10 * * * *", () => {
        if (isChecking) {
            logger_1.default.info("[FreeGamesCron] Vérification déjà en cours, ignorée");
            return;
        }
        isChecking = true;
        logger_1.default.info("[FreeGamesCron] ⏱️ Vérification des jeux gratuits");
        checkFreeGames(client)
            .catch((err) => logger_1.default.error(`[FreeGamesCron] Erreur cron: ${err instanceof Error ? err.message : String(err)}`, { stack: err instanceof Error ? err.stack : undefined }))
            .finally(() => {
            isChecking = false;
        });
    });
}
function stopFreeGamesMonitoring() {
    if (cronJob) {
        cronJob.stop();
        cronJob = null;
        logger_1.default.info("[FreeGamesCron] Arrêté");
    }
}
//# sourceMappingURL=freeGamesCron.js.map