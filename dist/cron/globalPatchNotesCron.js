"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseRssXmlItems = parseRssXmlItems;
exports.startGlobalPatchNotesMonitoring = startGlobalPatchNotesMonitoring;
exports.stopGlobalPatchNotesMonitoring = stopGlobalPatchNotesMonitoring;
exports.checkPatchNotes = checkPatchNotes;
const node_cron_1 = __importDefault(require("node-cron"));
const axios_1 = __importDefault(require("axios"));
const config_1 = require("../config");
const logger_1 = __importDefault(require("../utils/logger"));
const fast_xml_parser_1 = require("fast-xml-parser");
const translator_1 = require("../utils/translator");
const ScraperManager_1 = require("../managers/ScraperManager");
const scraper_bridge_1 = require("../scrapers/scraper-bridge");
const ChannelRouter_1 = require("../managers/ChannelRouter");
// ─── Constantes ───────────────────────────────────────────────────────────────
// URL directe Reddit RSS (scrapee via Scrapling - anti-bot bypass)
const DIRECT_REDDIT_RSS_URL = config_1.config.redditPatchNotesRss;
// Fallback: rss2json (service tiers - utilise uniquement si Scrapling echoue)
const RSS2JSON_FALLBACK_URL = `${config_1.config.rss2jsonBaseUrl}?rss_url=${encodeURIComponent(config_1.config.redditPatchNotesRss)}`;
// ─── Helpers ──────────────────────────────────────────────────────────────────
/**
 * Parse le XML RSS brut en items structures.
 * Utilise fast-xml-parser pour une extraction fiable de tous les champs.
 */
/** @internal Test-only export */
function parseRssXmlItems(rawXml) {
    try {
        const parser = new fast_xml_parser_1.XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
        const parsed = parser.parse(rawXml);
        const rssItems = parsed?.rss?.channel?.item || parsed?.feed?.entry || [];
        const items = Array.isArray(rssItems) ? rssItems : [rssItems];
        // Helper: extrait le texte d'un champ (gère les objets avec attributs XML)
        const text = (val) => {
            if (typeof val === 'string')
                return val;
            if (val && typeof val === 'object' && '#text' in val) {
                return String(val['#text']);
            }
            return String(val || '');
        };
        return items.map((it) => {
            // Atom <link href="..."/> -> it.link.href
            const linkObj = it.link;
            const link = typeof it.link === 'string' ? it.link : (linkObj?.href ? String(linkObj.href) : '');
            return {
                title: text(it.title),
                link,
                // RSS <pubDate> ou Atom <published>
                pubDate: text(it.pubDate || it.published),
                // RSS <description> ou Atom <content>
                content: text(it.description || it.content),
                contentSnippet: text(it.description || it.content).replace(/<[^>]*>/g, ''),
                // RSS <author>, Atom <author><name>, ou Dublin Core <dc:creator>
                author: typeof it.author === 'object' && it.author
                    ? text(it.author.name || it.author)
                    : text(it.author || it['dc:creator']),
                // RSS <guid> ou Atom <id> (fallback: link)
                guid: text(it.guid || it.id) || link,
                thumbnail: text(it.thumbnail),
            };
        });
    }
    catch (error) {
        logger_1.default.warn('[GlobalPatchNotes] Failed to parse RSS XML: ' + (error instanceof Error ? error.message : String(error)));
        return [];
    }
}
function generatePatchId(link) {
    const match = link.match(/\/comments\/([a-z0-9]+)\//i);
    return match?.[1] || link;
}
function generatePatchGuid(item) {
    return item.guid || generatePatchId(item.link);
}
function generateSummary(content) {
    if (!content)
        return "Aucune description disponible";
    // Remove HTML tags
    let cleanText = content.replace(/<[^>]*>/g, "");
    // Remove BBCode tags
    cleanText = cleanText.replace(/\[\/?[a-z]+\]/gi, "");
    // Remove URLs
    cleanText = cleanText.replace(/https?:\/\/[^\s]+/g, "");
    // Remove excessive whitespace
    cleanText = cleanText.replace(/\s+/g, " ").trim();
    // Limit to 400-500 characters
    if (cleanText.length > 500) {
        cleanText = cleanText.substring(0, 500);
        // Find the last space to avoid cutting in the middle of a word
        const lastSpace = cleanText.lastIndexOf(" ");
        if (lastSpace > 400) {
            cleanText = cleanText.substring(0, lastSpace);
        }
        cleanText += "...";
    }
    return cleanText;
}
// createPatchEmbed() déléguée à ChannelRouter.buildPlatformEmbed()
// La traduction est désormais gérée dans processPatchNote (avant routage)
// ─── Main Processing ────────────────────────────────────────────────────────────
async function processPatchNote(client, item) {
    // ═══ Étape 1: Barrière temporelle 48h (ScraperManager) ════════════════
    if (!(0, ScraperManager_1.isWithinTemporalBarrier)(item.pubDate)) {
        logger_1.default.debug(`[GlobalPatchNotes] Item ignoré (barrière 48h): ${item.pubDate}`);
        return;
    }
    const patchGuid = generatePatchGuid(item);
    // ═══ Étape 2: Déduplication (ScraperManager) ══════════════════════════
    const isNew = await (0, ScraperManager_1.isNewItem)(ScraperManager_1.ContentType.PATCH_NOTE, patchGuid);
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
        logger_1.default.debug(`[GlobalPatchNotes] Erreur traduction, utilisation texte original: ${error instanceof Error ? error.message : String(error)}`);
    }
    // Tronquer le contenu pour respecter les limites Discord (4096 chars max)
    if (translatedContent.length > 1800) {
        translatedContent = translatedContent.slice(0, 1797) + "...";
    }
    // ═══ Étape 4: Routage multi-salon (ChannelRouter) ════════════════════
    const imageUrl = item.thumbnail || item.enclosure?.url;
    try {
        const routingResult = await (0, ChannelRouter_1.routeArticle)(client, translatedTitle, translatedContent, item.link, item.pubDate, imageUrl);
        logger_1.default.info(`[GlobalPatchNotes] Routé: "${translatedTitle.slice(0, 60)}" → ${routingResult.sentTo.length} salon(s), ${routingResult.errors.length} erreur(s)`);
        if (routingResult.errors.length > 0) {
            logger_1.default.warn(`[GlobalPatchNotes] Erreurs routage: ${routingResult.errors.join("; ")}`);
        }
        // ═══ Étape 5: Marquage comme traité (ScraperManager) ═══════════════
        // Marquer SEULEMENT si au moins un salon a reçu l'article
        if (routingResult.routed) {
            await (0, ScraperManager_1.markAsProcessed)(ScraperManager_1.ContentType.PATCH_NOTE, patchGuid);
        }
    }
    catch (error) {
        logger_1.default.error(`[GlobalPatchNotes] Échec routage: ${error instanceof Error ? error.message : String(error)}`, { stack: error instanceof Error ? error.stack : undefined });
        // Ne pas marquer comme traité si le routage échoue → sera réessayé
    }
}
async function checkPatchNotes(client) {
    logger_1.default.info("[GlobalPatchNotes] Vérification des patch notes Reddit...");
    try {
        // Fetch via Scrapling adaptive scraper (anti-bot bypass + self-healing selectors)
        let items = [];
        try {
            const scraped = await (0, scraper_bridge_1.scrapeRssFeed)(DIRECT_REDDIT_RSS_URL, 15000);
            if (scraped.raw) {
                // Parser le XML RSS brut via fast-xml-parser (fiable, extrait tous les champs)
                items = parseRssXmlItems(scraped.raw);
                if (items.length === 0) {
                    // Fallback: essayer JSON si ce n'est pas du XML
                    try {
                        const parsed = JSON.parse(scraped.raw);
                        items = (parsed.items || parsed.entries || []);
                    }
                    catch (error) {
                        logger_1.default.warn('[GlobalPatchNotes] Failed to parse RSS XML: ' + (error instanceof Error ? error.message : String(error)));
                        logger_1.default.warn("[GlobalPatchNotes] Unable to parse scraped raw content");
                    }
                }
            }
            else if (scraped.items) {
                // Items pre-parses par scraper-bridge (deja valides Zod + pubDate->date)
                items = scraped.items;
            }
        }
        catch (scraperErr) {
            logger_1.default.warn('[GlobalPatchNotes] Scrapling failed on direct Reddit RSS, falling back to rss2json: ' + (scraperErr instanceof Error ? scraperErr.message : String(scraperErr)));
            // Fallback to original axios method
            try {
                const response = await axios_1.default.get(RSS2JSON_FALLBACK_URL, { timeout: 10000 });
                const feed = response.data;
                items = (feed.items || []);
            }
            catch (axiosErr) {
                logger_1.default.warn('[GlobalPatchNotes] rss2json also failed, trying direct Reddit RSS with axios: ' + (axiosErr instanceof Error ? axiosErr.message : String(axiosErr)));
                try {
                    const directResponse = await axios_1.default.get(DIRECT_REDDIT_RSS_URL, { timeout: 15000 });
                    const rawXml = directResponse.data;
                    const titleMatches = (typeof rawXml == 'string' ? rawXml.match(/<title[^>]*>([^<]+)<\/title>/gi) : null) || [];
                    items = titleMatches.slice(1).map((t, i) => ({
                        title: t.replace(/<[^>]+>/g, ''),
                        link: '',
                        pubDate: new Date().toISOString(),
                        content: '',
                    }));
                }
                catch (directErr) {
                    logger_1.default.error('[GlobalPatchNotes] All 3 attempts failed (Scrapling, rss2json, direct axios)');
                    return;
                }
            }
        }
        if (!Array.isArray(items) || items.length === 0) {
            logger_1.default.warn("[GlobalPatchNotes] Format RSS invalide ou aucun item");
            return;
        }
        let processedCount = 0;
        for (const item of items.slice(0, 10)) {
            try {
                await processPatchNote(client, item);
                processedCount++;
            }
            catch (error) {
                logger_1.default.error(`[GlobalPatchNotes] Erreur traitement patch: ${error instanceof Error ? error.message : String(error)}`, { stack: error instanceof Error ? error.stack : undefined });
            }
        }
        logger_1.default.info(`[GlobalPatchNotes] ${processedCount} patch note(s) traitée(s)`);
    }
    catch (error) {
        if (axios_1.default.isAxiosError(error)) {
            if (error.response?.status === 429) {
                logger_1.default.warn("[GlobalPatchNotes] Rate limit Reddit (429) - réessayer plus tard");
            }
            else {
                logger_1.default.error(`[GlobalPatchNotes] Erreur HTTP: ${error.response?.status || error.message}`, { stack: error.stack });
            }
        }
        else {
            logger_1.default.error(`[GlobalPatchNotes] Erreur critique: ${error instanceof Error ? error.message : String(error)}`, { stack: error instanceof Error ? error.stack : undefined });
        }
    }
}
// ─── Cron Management ───────────────────────────────────────────────────────────
let cronJob = null;
let isChecking = false;
function startGlobalPatchNotesMonitoring(client) {
    if (cronJob) {
        logger_1.default.warn("[GlobalPatchNotes] Déjà actif — ignoré");
        return;
    }
    logger_1.default.info("[GlobalPatchNotes] ⏱️ Exécution Cron planifiée pour Patch Notes — toutes les 10 minutes");
    cronJob = node_cron_1.default.schedule("*/10 * * * *", () => {
        if (isChecking) {
            logger_1.default.info("[GlobalPatchNotes] Vérification déjà en cours, ignorée");
            return;
        }
        isChecking = true;
        logger_1.default.info("[GlobalPatchNotes] ⏱️ Exécution Cron planifiée pour Patch Notes");
        checkPatchNotes(client)
            .catch((err) => logger_1.default.error(`[GlobalPatchNotes] Erreur cron: ${err instanceof Error ? err.message : String(err)}`, { stack: err instanceof Error ? err.stack : undefined }))
            .finally(() => {
            isChecking = false;
        });
    });
}
function stopGlobalPatchNotesMonitoring() {
    if (cronJob) {
        cronJob.stop();
        cronJob = null;
        logger_1.default.info("[GlobalPatchNotes] Arrêté");
    }
}
//# sourceMappingURL=globalPatchNotesCron.js.map