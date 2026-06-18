import { chromium, Browser, BrowserContext, Page } from 'playwright';
import logger from './logger.js';

let browser: Browser | null = null;
let context: BrowserContext | null = null;

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/**
 * Lance (ou récupère) un navigateur Chromium headless.
 * Réutilise l'instance existante si elle est encore connectée.
 */

/**
 * Injecte des scripts anti-détection dans le contexte du navigateur.
 */
async function applyAntiDetection(ctx: BrowserContext): Promise<void> {
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
}

export async function launchBrowser(): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  if (browser?.isConnected()) {
    context = await browser.newContext({
      userAgent: DEFAULT_USER_AGENT,
      viewport: { width: 1920, height: 1080 },
      bypassCSP: true,
    });
    await applyAntiDetection(context);
    const page = await context.newPage();
    logger.debug('[Scraper] Reusing existing browser instance');
    return { browser, context, page };
  }

  logger.info('[Scraper] Launching Chromium...');
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
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

  logger.info('[Scraper] Chromium launched successfully');
  return { browser, context, page };
}

/**
 * Ferme proprement le navigateur et le contexte.
 */
export async function closeBrowser(): Promise<void> {
  try {
    await context?.close();
    context = null;
    await browser?.close();
    browser = null;
    logger.info('[Scraper] Browser closed');
  } catch (err) {
    logger.warn('[Scraper] Error closing browser: ' + String(err));
  }
}
