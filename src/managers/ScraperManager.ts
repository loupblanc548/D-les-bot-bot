/**

 * ScraperManager.ts ÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ Bridge TypeScript & Validation Atomique (GÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©nÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©rique)

 *

 * Gestionnaire qui exÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©cute le script Python engine.py via child_process.spawn,

 * valide les donnÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©es avec Zod, applique la barriÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¨re temporelle de 48h,

 * et dÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©doublonne via Prisma avant de poursuivre le pipeline.

 *

 * Supporte TOUS les types de contenu : tweets, free games, patch notes,

 * deals, videos, game updates, price alerts.

 */

import { z } from "zod";

import logger from "../utils/logger.js";

import prisma from "../prisma.js";

import { closeBrowser as closeScraperBrowser } from "../utils/scraper.js";

type Browser = import("playwright").Browser;

/** Re-export du closeBrowser du scraper */
export async function closeBrowser(): Promise<void> {
  await closeScraperBrowser();
}

// ÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ Content Type System ÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ

/**

 * Types de contenu supportÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©s par le ScraperManager gÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©nÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©rique.

 * Chaque type correspond ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ  un modÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¨le Processed* dans Prisma.

 */

export enum ContentType {
  TWEET = "tweet",

  FREE_GAME = "free_game",

  PATCH_NOTE = "patch_note",

  DEAL = "deal",

  VIDEO = "video",

  GAME_UPDATE = "game_update",

  PRICE_ALERT = "price_alert",
}

/**

 * Configuration d'un type de contenu : mapping vers le modÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¨le Prisma.

 */

interface ContentTypeConfig {
  /** Nom de la table Prisma (ex: "processedPatchNotes") */

  tableName: string;

  /** Nom du champ unique utilisÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ© pour la dÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©duplication (ex: "guid") */

  uniqueField: string;
}

/**

 * Map associant chaque ContentType ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ  sa configuration Prisma.

 */

const CONTENT_TYPE_CONFIGS: Record<ContentType, ContentTypeConfig> = {
  [ContentType.TWEET]: { tableName: "processedTweets", uniqueField: "tweetId" },

  [ContentType.FREE_GAME]: { tableName: "processedFreeGames", uniqueField: "redditPostId" },

  [ContentType.PATCH_NOTE]: { tableName: "processedPatchNotes", uniqueField: "guid" },

  [ContentType.DEAL]: { tableName: "processedDeal", uniqueField: "guid" },

  [ContentType.VIDEO]: { tableName: "processedVideos", uniqueField: "videoId" },

  [ContentType.GAME_UPDATE]: { tableName: "processedGameUpdate", uniqueField: "updateId" },

  [ContentType.PRICE_ALERT]: { tableName: "processedPriceAlert", uniqueField: "alertId" },
};

// ÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ Zod Schema ÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ Validation Stricte du JSON reÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ§u de Python ÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ

/**
 * Retourne la configuration Prisma pour un type de contenu donne.
 */
export function getContentTypeConfig(type: ContentType): ContentTypeConfig {
  const config = CONTENT_TYPE_CONFIGS[type];
  if (!config) throw new Error("[ScraperManager] Type de contenu inconnu: " + type);
  return config;
}

/**
 * Verifie si la date de publication est dans la barriere temporelle (24h).
 */
export function isWithinTemporalBarrier(pubDate: string): boolean {
  if (!pubDate) return true;
  const date = new Date(pubDate);
  if (isNaN(date.getTime())) return false;
  const now = Date.now();
  const diff = now - date.getTime();
  return diff <= TEMPORAL_BARRIER_MS;
}

export const ScrapedDataSchema = z.object({
  success: z.boolean(),

  title: z.string().optional().default(""),

  content: z.string().optional().default(""),

  pubDate: z.string().optional().default(""),

  link: z.string().optional().default(""),

  image: z.string().optional().default(""),

  raw: z.string().optional(),

  error: z.string().optional(),
});

export type ScrapedData = z.infer<typeof ScrapedDataSchema>;

export const ScrapedItemSchema = z.object({
  guid: z.string().min(1, "GUID requis pour dÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©duplication"),

  title: z.string().min(1, "Titre requis"),

  content: z.string().optional().default(""),

  pubDate: z.string().optional().default(""),

  link: z.string().optional().default(""),

  image: z.string().optional().default(""),
});

export type ScrapedItem = z.infer<typeof ScrapedItemSchema>;

export interface ScraperSelectors {
  title?: string;

  content?: string;

  date?: string;

  image?: string;
}

export interface ScraperOptions {
  url: string;

  selectors?: ScraperSelectors;

  mode?: "html" | "rss";

  timeout?: number;
}

export interface PipelineResult {
  valid: boolean;

  item?: ScrapedItem;

  skippedReason?: string;

  error?: string;
}

// ÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ Constantes ÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ

const DEFAULT_TIMEOUT_MS = 30_000;
let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserInstance?.isConnected()) {
    const { chromium } = await import("playwright");
    browserInstance = await chromium.launch({
      headless: true,
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    logger.info("[ScraperManager] Navigateur Playwright lance");
  }
  return browserInstance!;
}

const DEFAULT_HTML_SELECTORS = {
  title: "h1",
  content: 'article, .content, main, [role="main"]',
  date: "time, [datetime], .date, .published",
  image: 'meta[property="og:image"], img',
};

const TEMPORAL_BARRIER_MS = 24 * 60 * 60 * 1000; // 24 heures (anti-spam strict)

// ÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ Core: ExÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©cution du script Python ÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ

/**

 * ExÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©cute engine.py via child_process.spawn de maniÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¨re totalement asynchrone.

 * Capture stdout, applique un timeout, et parse le JSON.

 */

export async function executeScraper(options: ScraperOptions): Promise<ScrapedData> {
  const { url, selectors, mode = "html", timeout = DEFAULT_TIMEOUT_MS } = options;
  logger.info("[ScraperManager] Lancement scraping: " + url + " (mode: " + mode + ")");
  if (mode === "rss") {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      const rawText = await response.text();
      return {
        success: true,
        title: "",
        content: rawText,
        pubDate: "",
        link: url,
        image: "",
        raw: rawText,
      };
    } catch (error) {
      return {
        success: false,
        error: "RSS fetch failed: " + (error as Error).message,
        title: "",
        content: "",
        pubDate: "",
        link: url,
        image: "",
      };
    }
  }
  let page: any = null;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout });
    const sel = selectors || DEFAULT_HTML_SELECTORS;
    let title = "";
    if (sel.title) {
      try {
        const el = await page.$(sel.title);
        if (el) title = (await el.textContent())?.trim() || "";
      } catch { logger.error("[Silent catch]"); }
    }
    if (!title) {
      try {
        title = await page.$eval(
          'meta[property="og:title"]',
          (el: any) => el.getAttribute("content") || "",
        );
      } catch { logger.error("[Silent catch]"); }
    }
    title = title.replace(/\n\n/g, " ").replace(/\n/g, " ").trim();
    let content = "";
    if (sel.content) {
      try {
        content = await page.$$eval(sel.content, (els: any[]) =>
          els.map((el: any) => el.textContent?.trim() || "").join(" "),
        );
      } catch { logger.error("[Silent catch]"); }
    }
    content = content.replace(/\n\n/g, " ").replace(/\n/g, " ").trim().slice(0, 5000);
    let pubDate = "";
    if (sel.date) {
      try {
        pubDate = await page.$eval(
          sel.date,
          (el: any) =>
            el.getAttribute("datetime") ||
            el.getAttribute("content") ||
            el.textContent?.trim() ||
            "",
        );
      } catch { logger.error("[Silent catch]"); }
    }
    pubDate = pubDate.trim();
    let image = "";
    if (sel.image) {
      try {
        image = await page.$eval(
          sel.image,
          (el: any) => el.getAttribute("src") || el.getAttribute("content") || "",
        );
      } catch { logger.error("[Silent catch]"); }
    }
    image = image.trim();
    return { success: true, title, content, pubDate, link: url, image };
  } catch (error) {
    const errMsg = (error as Error).message;
    if (errMsg.includes("timeout") || errMsg.includes("Timeout")) {
      logger.error("[ScraperManager] Timeout apres " + timeout + "ms: " + url);
      return {
        success: false,
        error: "Scraper timeout after " + timeout + "ms",
        title: "",
        content: "",
        pubDate: "",
        link: url,
        image: "",
      };
    }
    logger.error("[ScraperManager] Scraping echoue: " + errMsg);
    return {
      success: false,
      error: "Scraping failed: " + errMsg,
      title: "",
      content: "",
      pubDate: "",
      link: url,
      image: "",
    };
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

export async function isNewItem(
  type: ContentType,

  uniqueId: string,
): Promise<boolean> {
  const config = getContentTypeConfig(type);

  try {
    const prismaAny = prisma as any as Record<
      string,
      { findUnique: (args: Record<string, any>) => Promise<any> }
    >;

    const model = prismaAny[config.tableName];

    if (!model) {
      throw new Error(
        `[ScraperManager] ModÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¨le Prisma introuvable: ${config.tableName}`,
      );
    }

    const existing = await model.findUnique({
      where: { [config.uniqueField]: uniqueId },
    });

    return existing === null;
  } catch (error) {
    logger.error(
      `[ScraperManager] Erreur dÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©duplication ${config.tableName}[${config.uniqueField}=${uniqueId}]: ${error}`,
    );

    return false; // En cas d'erreur, on skip pour ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©viter les doublons
  }
}

/**

 * Enregistre un identifiant unique comme traitÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ© dans la table Processed* correspondante.

 *

 * @param type - Type de contenu (dÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©termine la table Prisma)

 * @param uniqueId - Identifiant unique (guid, tweetId, videoId, etc.)

 */

export async function markAsProcessed(
  type: ContentType,

  uniqueId: string,
): Promise<void> {
  const config = getContentTypeConfig(type);

  try {
    const prismaAny = prisma as any as Record<
      string,
      { create: (args: Record<string, any>) => Promise<any> }
    >;

    const model = prismaAny[config.tableName];

    if (!model) {
      throw new Error(
        `[ScraperManager] ModÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¨le Prisma introuvable: ${config.tableName}`,
      );
    }

    await model.create({
      data: { [config.uniqueField]: uniqueId },
    });

    logger.debug(
      `[ScraperManager] ${config.tableName}[${config.uniqueField}=${uniqueId}] marquÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ© comme traitÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©`,
    );
  } catch (error) {
    // Ignorer uniquement les doublons (contrainte unique P2002)

    if ((error as any)?.code === "P2002") {
      logger.debug(
        `[ScraperManager] ${config.tableName}[${config.uniqueField}=${uniqueId}] dÃÂÃÂÃÂÃÂ©jÃÂÃÂÃÂÃÂ  existant (P2002)`,
      );

      return;
    }

    logger.error(
      `[ScraperManager] Erreur critique markAsProcessed ${config.tableName}: ${error instanceof Error ? error.message : String(error)}`,
    );

    // Non critique - on ne bloque pas le pipeline
  }
}

/**

 * Pipeline complet gÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©nÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©rique : Scraping ÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ Validation Zod ÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ BarriÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¨re 48h ÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ DÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©duplication.

 * Retourne un PipelineResult indiquant si l'item est valide et doit ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂªtre publiÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©.

 *

 * @param type - Type de contenu pour la dÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©duplication (dÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©faut: PATCH_NOTE)

 * @param url - URL ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ  scraper

 * @param guid - Identifiant unique pour la dÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©duplication

 * @param options - Options de scraping additionnelles

 */

export async function runScrapingPipeline(
  url: string,

  guid: string,

  options?: Partial<ScraperOptions>,

  type: ContentType = ContentType.PATCH_NOTE,
): Promise<PipelineResult> {
  const config = getContentTypeConfig(type);

  logger.info(
    `[ScraperManager] Pipeline [${type}] dÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©marrÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©: GUID=${guid} URL=${url}`,
  );

  // ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂtape 1: Scraping

  let scraped: ScrapedData;

  try {
    scraped = await executeScraper({ url, ...options });
  } catch (error) {
    const errMsg = `Scraping ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©chouÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©: ${(error as Error).message}`;

    logger.error(`[ScraperManager] ${errMsg}`);

    return { valid: false, skippedReason: "scraping_failed", error: errMsg };
  }

  // ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂtape 2: Validation Zod (dÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©jÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ  faite dans executeScraper)

  if (!scraped.success) {
    return { valid: false, skippedReason: "scraping_unsuccessful", error: scraped.error };
  }

  // ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂtape 3: BarriÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¨re temporelle 48h

  if (!isWithinTemporalBarrier(scraped.pubDate)) {
    logger.info(
      `[ScraperManager] Item ignorÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ© (barriÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¨re 48h): ${scraped.pubDate}`,
    );

    return { valid: false, skippedReason: "temporal_barrier" };
  }

  // ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂtape 4: DÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©duplication Prisma (gÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©nÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©rique par ContentType)

  const isNew = await isNewItem(type, guid);

  if (!isNew) {
    logger.debug(
      `[ScraperManager] Item dÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©jÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ  traitÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©: [${type}] ${config.uniqueField}=${guid}`,
    );

    return { valid: false, skippedReason: "duplicate" };
  }

  // Construire l'item validÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©

  const item: ScrapedItem = {
    guid,

    title: scraped.title,

    content: scraped.content,

    pubDate: scraped.pubDate,

    link: scraped.link,

    image: scraped.image,
  };

  logger.info(
    `[ScraperManager] ÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ [${type}] Item validÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©: "${item.title.slice(0, 80)}"`,
  );

  return { valid: true, item };
}

/**

 * Wrapper pratique pour les flux RSS.

 */

export async function scrapeRssFeed(url: string, timeout?: number): Promise<ScrapedData> {
  return executeScraper({ url, mode: "rss", timeout });
}

export const scrapeWithScrapling = executeScraper;

export default executeScraper;
