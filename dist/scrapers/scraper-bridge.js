"use strict";
/**
 * Scraper Bridge - TypeScript wrapper for the Python Scrapling scraper.
 * Spawns a Python child process and returns parsed JSON results.
 *
 * Provides async/await interface with timeout, error handling, and logging.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RssItemSchema = exports.ScrapedDataSchema = void 0;
exports.scrapeWithScrapling = scrapeWithScrapling;
exports.scrapeRssFeed = scrapeRssFeed;
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const logger_1 = __importDefault(require("../utils/logger"));
const zod_1 = require("zod");
// ─── Zod Schemas — Validation Stricte du JSON reçu de Python ──────────────
exports.ScrapedDataSchema = zod_1.z.object({
    title: zod_1.z.string().optional().default(""),
    content: zod_1.z.string().optional().default(""),
    pubDate: zod_1.z.string().optional().default(""),
    date: zod_1.z.string().optional().default(""),
    link: zod_1.z.string().optional().default(""),
    image: zod_1.z.string().optional().default(""),
    items: zod_1.z.array(zod_1.z.record(zod_1.z.string(), zod_1.z.unknown())).optional(),
    raw: zod_1.z.string().optional(),
    error: zod_1.z.string().optional(),
});
exports.RssItemSchema = zod_1.z.object({
    title: zod_1.z.string().min(1, "Titre RSS requis"),
    content: zod_1.z.string().optional().default(""),
    pubDate: zod_1.z.string().optional().default(""),
    link: zod_1.z.string().optional().default(""),
    guid: zod_1.z.string().optional(),
    thumbnail: zod_1.z.string().optional(),
});
// ─── Constants ────────────────────────────────────────────────────────────────
const SCRAPER_SCRIPT = path_1.default.join(__dirname, "universal_scraper.py");
const DEFAULT_TIMEOUT = 30_000; // 30 seconds in ms
// ─── Core Function ────────────────────────────────────────────────────────────
/**
 * Executes the Python Scrapling scraper and returns parsed JSON.
 *
 * @param options - Scraping options (URL, selectors, mode, timeout)
 * @returns Promise resolving to the scraped data
 * @throws Error if scraping fails, times out, or returns invalid JSON
 */
async function scrapeWithScrapling(options) {
    const { url, selectors, mode = "html", timeout = DEFAULT_TIMEOUT } = options;
    logger_1.default.info(`[ScraperBridge] Scraping URL: ${url} (mode: ${mode})`);
    // Build CLI arguments
    const args = [
        SCRAPER_SCRIPT,
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
            cwd: path_1.default.dirname(SCRAPER_SCRIPT),
            env: { ...process.env, PYTHONIOENCODING: "utf-8" },
            stdio: ["pipe", "pipe", "pipe"],
        });
        // ── Timeout guard ──────────────────────────────────────────────────
        const timer = setTimeout(() => {
            if (!settled) {
                settled = true;
                proc.kill("SIGTERM");
                logger_1.default.error(`[ScraperBridge] Timeout after ${timeout}ms for URL: ${url}`);
                reject(new Error(`Scraper timeout after ${timeout}ms`));
            }
        }, timeout);
        // ── Stdout collection ─────────────────────────────────────────────
        proc.stdout?.on("data", (chunk) => {
            stdout += chunk.toString("utf-8");
        });
        // ── Stderr collection (log as warnings) ──────────────────────────
        proc.stderr?.on("data", (chunk) => {
            stderr += chunk.toString("utf-8");
        });
        // ── Process exit ─────────────────────────────────────────────────
        proc.on("close", (code) => {
            clearTimeout(timer);
            if (settled)
                return;
            settled = true;
            if (stderr) {
                logger_1.default.warn(`[ScraperBridge] Python stderr: ${stderr.trim()}`);
            }
            if (code !== 0 && code !== null) {
                const errMsg = `Python scraper exited with code ${code}: ${stderr.trim() || stdout.trim()}`;
                logger_1.default.error(`[ScraperBridge] ${errMsg}`);
                reject(new Error(errMsg));
                return;
            }
            // Parse JSON output
            let result;
            try {
                // Extraire le JSON du stdout (gère les logs Python mélangés)
                const trimmed = stdout.trim();
                let rawParsed;
                try {
                    // Essayer de parser tout le stdout d'abord (cas normal: JSON pur)
                    rawParsed = JSON.parse(trimmed);
                }
                catch {
                    // Fallback: stdout contient des logs avant le JSON -> extraire le dernier {...}
                    const jsonStart = trimmed.lastIndexOf("{");
                    const jsonStr = jsonStart >= 0 ? trimmed.substring(jsonStart) : trimmed;
                    rawParsed = JSON.parse(jsonStr);
                }
                // Validation Zod avant d'utiliser les données
                const parsed = exports.ScrapedDataSchema.safeParse(rawParsed);
                if (!parsed.success) {
                    logger_1.default.error(`[ScraperBridge] Données corrompues du scraper: ${parsed.error.message}`);
                    reject(new Error(`Validation Zod échouée: ${parsed.error.message}`));
                    return;
                }
                // Mapper pubDate (Python) → date (interface existante)
                const validated = parsed.data;
                if (!validated.date && validated.pubDate) {
                    validated.date = validated.pubDate;
                }
                result = validated;
            }
            catch (parseError) {
                logger_1.default.error(`[ScraperBridge] Failed to parse JSON output. Raw: ${stdout.slice(0, 500)}`);
                reject(new Error(`Failed to parse scraper output: ${parseError.message}`));
                return;
            }
            // Check for error in result
            if (result.error) {
                logger_1.default.error(`[ScraperBridge] Scraper returned error: ${result.error}`);
                reject(new Error(result.error));
                return;
            }
            logger_1.default.info(`[ScraperBridge] Successfully scraped: "${result.title?.slice(0, 80) || 'N/A'}"`);
            resolve(result);
        });
        // ── Process error ────────────────────────────────────────────────
        proc.on("error", (err) => {
            clearTimeout(timer);
            if (settled)
                return;
            settled = true;
            logger_1.default.error(`[ScraperBridge] Failed to spawn Python: ${err.message}`);
            reject(new Error(`Failed to start Python scraper: ${err.message}`));
        });
    });
}
/**
 * Scrapes an RSS feed URL and returns parsed items.
 * Convenience wrapper around scrapeWithScrapling with mode='rss'.
 */
async function scrapeRssFeed(url, timeout) {
    return scrapeWithScrapling({ url, mode: "rss", timeout });
}
exports.default = scrapeWithScrapling;
//# sourceMappingURL=scraper-bridge.js.map