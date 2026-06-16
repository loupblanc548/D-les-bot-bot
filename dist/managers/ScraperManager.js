"use strict";
/**
 * ScraperManager.ts — Bridge TypeScript & Validation Atomique (Générique)
 *
 * Gestionnaire qui exécute le script Python engine.py via child_process.spawn,
 * valide les données avec Zod, applique la barrière temporelle de 48h,
 * et dédoublonne via Prisma avant de poursuivre le pipeline.
 *
 * Supporte TOUS les types de contenu : tweets, free games, patch notes,
 * deals, videos, game updates, price alerts.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScrapedItemSchema = exports.ScrapedDataSchema = exports.ContentType = void 0;
exports.executeScraper = executeScraper;
exports.isWithinTemporalBarrier = isWithinTemporalBarrier;
exports.getContentTypeConfig = getContentTypeConfig;
exports.getUniqueField = getUniqueField;
exports.isNewItem = isNewItem;
exports.markAsProcessed = markAsProcessed;
exports.runScrapingPipeline = runScrapingPipeline;
exports.scrapeRssFeed = scrapeRssFeed;
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const zod_1 = require("zod");
const logger_1 = __importDefault(require("../utils/logger"));
const prisma_1 = __importDefault(require("../prisma"));
// ─── Content Type System ────────────────────────────────────────────────────
/**
 * Types de contenu supportés par le ScraperManager générique.
 * Chaque type correspond à un modèle Processed* dans Prisma.
 */
var ContentType;
(function (ContentType) {
    ContentType["TWEET"] = "tweet";
    ContentType["FREE_GAME"] = "free_game";
    ContentType["PATCH_NOTE"] = "patch_note";
    ContentType["DEAL"] = "deal";
    ContentType["VIDEO"] = "video";
    ContentType["GAME_UPDATE"] = "game_update";
    ContentType["PRICE_ALERT"] = "price_alert";
})(ContentType || (exports.ContentType = ContentType = {}));
/**
 * Map associant chaque ContentType à sa configuration Prisma.
 */
const CONTENT_TYPE_CONFIGS = {
    [ContentType.TWEET]: { tableName: "processedTweets", uniqueField: "tweetId" },
    [ContentType.FREE_GAME]: { tableName: "processedFreeGames", uniqueField: "redditPostId" },
    [ContentType.PATCH_NOTE]: { tableName: "processedPatchNotes", uniqueField: "guid" },
    [ContentType.DEAL]: { tableName: "processedDeal", uniqueField: "guid" },
    [ContentType.VIDEO]: { tableName: "processedVideos", uniqueField: "videoId" },
    [ContentType.GAME_UPDATE]: { tableName: "processedGameUpdate", uniqueField: "updateId" },
    [ContentType.PRICE_ALERT]: { tableName: "processedPriceAlert", uniqueField: "alertId" },
};
// ─── Zod Schema — Validation Stricte du JSON reçu de Python ────────────────
exports.ScrapedDataSchema = zod_1.z.object({
    success: zod_1.z.boolean(),
    title: zod_1.z.string().optional().default(""),
    content: zod_1.z.string().optional().default(""),
    pubDate: zod_1.z.string().optional().default(""),
    link: zod_1.z.string().optional().default(""),
    image: zod_1.z.string().optional().default(""),
    raw: zod_1.z.string().optional(),
    error: zod_1.z.string().optional(),
});
exports.ScrapedItemSchema = zod_1.z.object({
    guid: zod_1.z.string().min(1, "GUID requis pour déduplication"),
    title: zod_1.z.string().min(1, "Titre requis"),
    content: zod_1.z.string().optional().default(""),
    pubDate: zod_1.z.string().optional().default(""),
    link: zod_1.z.string().optional().default(""),
    image: zod_1.z.string().optional().default(""),
});
// ─── Constantes ─────────────────────────────────────────────────────────────
const ENGINE_SCRIPT = path_1.default.join(process.cwd(), "src", "scrapers", "engine.py");
const DEFAULT_TIMEOUT_MS = 30_000;
const TEMPORAL_BARRIER_MS = 48 * 60 * 60 * 1000; // 48 heures
// ─── Core: Exécution du script Python ───────────────────────────────────────
/**
 * Exécute engine.py via child_process.spawn de manière totalement asynchrone.
 * Capture stdout, applique un timeout, et parse le JSON.
 */
async function executeScraper(options) {
    const { url, selectors, mode = "html", timeout = DEFAULT_TIMEOUT_MS } = options;
    logger_1.default.info(`[ScraperManager] Lancement scraping: ${url} (mode: ${mode})`);
    const args = [
        ENGINE_SCRIPT,
        "--url", url,
        "--mode", mode,
        "--timeout", String(Math.floor(timeout / 1000)),
    ];
    if (selectors) {
        args.push("--selectors", JSON.stringify(selectors));
    }
    return new Promise((resolve, reject) => {
        let stdout = "";
        let stderr = "";
        let settled = false;
        const proc = (0, child_process_1.spawn)("python", args, {
            cwd: path_1.default.dirname(ENGINE_SCRIPT),
            env: { ...process.env, PYTHONIOENCODING: "utf-8" },
            stdio: ["pipe", "pipe", "pipe"],
        });
        const timer = setTimeout(() => {
            if (!settled) {
                settled = true;
                proc.kill("SIGTERM");
                logger_1.default.error(`[ScraperManager] Timeout après ${timeout}ms: ${url}`);
                reject(new Error(`Scraper timeout after ${timeout}ms`));
            }
        }, timeout);
        proc.stdout?.on("data", (chunk) => {
            stdout += chunk.toString("utf-8");
        });
        proc.stderr?.on("data", (chunk) => {
            stderr += chunk.toString("utf-8");
        });
        proc.on("close", (code) => {
            clearTimeout(timer);
            if (settled)
                return;
            settled = true;
            if (stderr) {
                logger_1.default.warn(`[ScraperManager] Stderr Python: ${stderr.trim()}`);
            }
            if (code !== 0 && code !== null) {
                reject(new Error(`Python exited with code ${code}: ${stderr.trim() || stdout.trim()}`));
                return;
            }
            // Parser le JSON de stdout
            try {
                const trimmed = stdout.trim();
                const jsonStart = trimmed.lastIndexOf("{");
                const jsonStr = jsonStart >= 0 ? trimmed.substring(jsonStart) : trimmed;
                const raw = JSON.parse(jsonStr);
                // Valider avec Zod
                const parsed = exports.ScrapedDataSchema.safeParse(raw);
                if (!parsed.success) {
                    logger_1.default.error(`[ScraperManager] Données corrompues reçues de Python: ${parsed.error.message}`);
                    reject(new Error(`Validation Zod échouée: ${parsed.error.message}`));
                    return;
                }
                const data = parsed.data;
                if (!data.success || data.error) {
                    reject(new Error(data.error || "Scraping failed"));
                    return;
                }
                logger_1.default.info(`[ScraperManager] Scraping réussi: "${data.title?.slice(0, 80) || "N/A"}"`);
                resolve(data);
            }
            catch (parseError) {
                logger_1.default.error(`[ScraperManager] JSON invalide: ${stdout.slice(0, 300)}`);
                reject(new Error(`Invalid JSON from Python: ${parseError.message}`));
            }
        });
        proc.on("error", (err) => {
            clearTimeout(timer);
            if (settled)
                return;
            settled = true;
            logger_1.default.error(`[ScraperManager] Échec spawn Python: ${err.message}`);
            reject(new Error(`Failed to start Python: ${err.message}`));
        });
    });
}
// ─── Barrière Temporelle 48h ────────────────────────────────────────────────
/**
 * Vérifie si une date est dans la fenêtre des 48 dernières heures.
 * Retourne false si l'item est trop vieux ou si la date est invalide.
 */
function isWithinTemporalBarrier(pubDate) {
    if (!pubDate)
        return true; // Pas de date = on accepte (pessimiste)
    try {
        const date = new Date(pubDate);
        if (isNaN(date.getTime()))
            return false; // Date invalide = on rejette
        const now = Date.now();
        const age = now - date.getTime();
        return age <= TEMPORAL_BARRIER_MS;
    }
    catch {
        return false; // Erreur de parsing = on rejette
    }
}
// ─── Helpers: Résolution de la config ───────────────────────────────────────
/**
 * Retourne la configuration Prisma pour un type de contenu donné.
 */
function getContentTypeConfig(type) {
    const config = CONTENT_TYPE_CONFIGS[type];
    if (!config) {
        throw new Error(`[ScraperManager] ContentType inconnu: ${type}`);
    }
    return config;
}
/**
 * Retourne le nom du champ unique pour un type de contenu donné.
 */
function getUniqueField(type) {
    return getContentTypeConfig(type).uniqueField;
}
// ─── Déduplication Prisma Générique ─────────────────────────────────────────
/**
 * Vérifie si un identifiant unique existe déjà dans la table Processed* correspondante.
 * Retourne true si l'élément est inédit (doit être traité).
 *
 * @param type - Type de contenu (détermine la table Prisma)
 * @param uniqueId - Identifiant unique (guid, tweetId, videoId, etc.)
 */
async function isNewItem(type, uniqueId) {
    const config = getContentTypeConfig(type);
    try {
        const model = prisma_1.default[config.tableName];
        if (!model) {
            throw new Error(`[ScraperManager] Modèle Prisma introuvable: ${config.tableName}`);
        }
        const existing = await model.findUnique({
            where: { [config.uniqueField]: uniqueId },
        });
        return existing === null;
    }
    catch (error) {
        logger_1.default.error(`[ScraperManager] Erreur déduplication ${config.tableName}[${config.uniqueField}=${uniqueId}]: ${error}`);
        return false; // En cas d'erreur, on skip pour éviter les doublons
    }
}
/**
 * Enregistre un identifiant unique comme traité dans la table Processed* correspondante.
 *
 * @param type - Type de contenu (détermine la table Prisma)
 * @param uniqueId - Identifiant unique (guid, tweetId, videoId, etc.)
 */
async function markAsProcessed(type, uniqueId) {
    const config = getContentTypeConfig(type);
    try {
        const model = prisma_1.default[config.tableName];
        if (!model) {
            throw new Error(`[ScraperManager] Modèle Prisma introuvable: ${config.tableName}`);
        }
        await model.create({
            data: { [config.uniqueField]: uniqueId, title: "" },
        });
        logger_1.default.debug(`[ScraperManager] ${config.tableName}[${config.uniqueField}=${uniqueId}] marqué comme traité`);
    }
    catch (error) {
        // Ignorer les doublons (contrainte unique)
        logger_1.default.debug(`[ScraperManager] ${config.tableName}[${config.uniqueField}=${uniqueId}] déjà existant`);
    }
}
// ─── Pipeline Complet ───────────────────────────────────────────────────────
/**
 * Pipeline complet générique : Scraping → Validation Zod → Barrière 48h → Déduplication.
 * Retourne un PipelineResult indiquant si l'item est valide et doit être publié.
 *
 * @param type - Type de contenu pour la déduplication (défaut: PATCH_NOTE)
 * @param url - URL à scraper
 * @param guid - Identifiant unique pour la déduplication
 * @param options - Options de scraping additionnelles
 */
async function runScrapingPipeline(url, guid, options, type = ContentType.PATCH_NOTE) {
    const config = getContentTypeConfig(type);
    logger_1.default.info(`[ScraperManager] Pipeline [${type}] démarré: GUID=${guid} URL=${url}`);
    // Étape 1: Scraping
    let scraped;
    try {
        scraped = await executeScraper({ url, ...options });
    }
    catch (error) {
        const errMsg = `Scraping échoué: ${error.message}`;
        logger_1.default.error(`[ScraperManager] ${errMsg}`);
        return { valid: false, skippedReason: "scraping_failed", error: errMsg };
    }
    // Étape 2: Validation Zod (déjà faite dans executeScraper)
    if (!scraped.success) {
        return { valid: false, skippedReason: "scraping_unsuccessful", error: scraped.error };
    }
    // Étape 3: Barrière temporelle 48h
    if (!isWithinTemporalBarrier(scraped.pubDate)) {
        logger_1.default.info(`[ScraperManager] Item ignoré (barrière 48h): ${scraped.pubDate}`);
        return { valid: false, skippedReason: "temporal_barrier" };
    }
    // Étape 4: Déduplication Prisma (générique par ContentType)
    const isNew = await isNewItem(type, guid);
    if (!isNew) {
        logger_1.default.debug(`[ScraperManager] Item déjà traité: [${type}] ${config.uniqueField}=${guid}`);
        return { valid: false, skippedReason: "duplicate" };
    }
    // Construire l'item validé
    const item = {
        guid,
        title: scraped.title,
        content: scraped.content,
        pubDate: scraped.pubDate,
        link: scraped.link,
        image: scraped.image,
    };
    logger_1.default.info(`[ScraperManager] ✅ [${type}] Item validé: "${item.title.slice(0, 80)}"`);
    return { valid: true, item };
}
/**
 * Wrapper pratique pour les flux RSS.
 */
async function scrapeRssFeed(url, timeout) {
    return executeScraper({ url, mode: "rss", timeout });
}
exports.default = executeScraper;
//# sourceMappingURL=ScraperManager.js.map