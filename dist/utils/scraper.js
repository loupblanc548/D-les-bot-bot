"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.launchBrowser = launchBrowser;
exports.closeBrowser = closeBrowser;
const playwright_1 = require("playwright");
const logger_1 = __importDefault(require("./logger"));
let browser = null;
let context = null;
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
/**
 * Lance (ou récupère) un navigateur Chromium headless.
 * Réutilise l'instance existante si elle est encore connectée.
 */
/**
 * Injecte des scripts anti-détection dans le contexte du navigateur.
 */
async function applyAntiDetection(ctx) {
    await ctx.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
}
async function launchBrowser() {
    if (browser?.isConnected()) {
        context = await browser.newContext({
            userAgent: DEFAULT_USER_AGENT,
            viewport: { width: 1920, height: 1080 },
            bypassCSP: true,
        });
        await applyAntiDetection(context);
        const page = await context.newPage();
        logger_1.default.debug('[Scraper] Reusing existing browser instance');
        return { browser, context, page };
    }
    logger_1.default.info('[Scraper] Launching Chromium...');
    browser = await playwright_1.chromium.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
        ],
    });
    context = await browser.newContext({
        userAgent: DEFAULT_USER_AGENT,
        viewport: { width: 1920, height: 1080 },
        bypassCSP: true,
    });
    // Supprime la détection d'automatisation
    await applyAntiDetection(context);
    const page = await context.newPage();
    // Bloque les dialogues (alert/confirm/prompt)
    page.on('dialog', async (dialog) => {
        await dialog.dismiss();
    });
    logger_1.default.info('[Scraper] Chromium launched successfully');
    return { browser, context, page };
}
/**
 * Ferme proprement le navigateur et le contexte.
 */
async function closeBrowser() {
    try {
        await context?.close();
        context = null;
        await browser?.close();
        browser = null;
        logger_1.default.info('[Scraper] Browser closed');
    }
    catch (err) {
        logger_1.default.warn('[Scraper] Error closing browser: ' + String(err));
    }
}
//# sourceMappingURL=scraper.js.map