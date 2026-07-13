/**
 * screenshotTool.ts — Screenshot service for the autonomous AI agent
 *
 * Uses Playwright (already installed) to capture screenshots of any URL.
 * The bot can take screenshots on demand to show things to users.
 *
 * Memory-safe: browser is launched per-request and closed immediately after.
 * No persistent browser instance to avoid memory leaks.
 */

import { chromium } from "playwright";
import { AttachmentBuilder, TextChannel } from "discord.js";
import logger from "../utils/logger.js";
import type { ToolCallResult, ToolContext } from "./agentTools.js";

// ─── Configuration ───────────────────────────────────────────────────────────

const SCREENSHOT_TIMEOUT_MS = 15_000;
const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 720;
const MAX_URL_LENGTH = 2048;

// ─── Screenshot Tool ─────────────────────────────────────────────────────────

/**
 * Take a screenshot of a URL and send it to the Discord channel.
 * @param url The URL to screenshot
 * @param ctx Tool context (for sending the image to Discord)
 * @param fullPage Whether to capture the full page (default: false, viewport only)
 */
export async function takeScreenshot(
  url: string,
  ctx: ToolContext,
  fullPage = false,
): Promise<ToolCallResult> {
  // Validate URL
  if (!url || url.length > MAX_URL_LENGTH) {
    return { success: false, data: "URL invalide ou trop longue" };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { success: false, data: `URL invalide: ${url}` };
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return { success: false, data: `Protocole non supporté: ${parsedUrl.protocol}` };
  }

  let browser = null;
  try {
    logger.info(`[Screenshot] Capturing: ${url} (fullPage: ${fullPage})`);

    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
      ],
    });

    const context = await browser.newContext({
      viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
      locale: "fr-FR",
      timezoneId: "Europe/Paris",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();

    // Navigate with timeout
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: SCREENSHOT_TIMEOUT_MS,
    });

    // Wait a bit for dynamic content to render
    await page.waitForTimeout(2000);

    // Take screenshot
    const screenshotBuffer = await page.screenshot({
      fullPage,
      type: "png",
    });

    await browser.close();
    browser = null;

    // Send to Discord channel
    const channel = ctx.client.channels.cache.get(ctx.channelId) as TextChannel | undefined;
    if (!channel || !channel.isTextBased()) {
      return { success: false, data: "Salon Discord introuvable pour envoyer la capture" };
    }

    const filename = `screenshot-${Date.now()}.png`;
    const attachment = new AttachmentBuilder(screenshotBuffer, { name: filename });

    await channel.send({
      content: `📸 Capture d'écran de ${url}`,
      files: [attachment],
    });

    logger.info(`[Screenshot] Sent: ${filename} (${screenshotBuffer.length} bytes)`);

    return {
      success: true,
      data: `Capture d'écran de ${url} envoyée dans le salon. ${fullPage ? "Page complète capturée." : "Viewport capturé."} Dimensions: ${VIEWPORT_WIDTH}x${VIEWPORT_HEIGHT}.`,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error(`[Screenshot] Error capturing ${url}: ${errorMsg}`);
    return {
      success: false,
      data: `Erreur lors de la capture: ${errorMsg}`,
    };
  } finally {
    // Always close browser to prevent memory leaks
    if (browser) {
      try {
        await browser.close();
      } catch {
        // Ignore — already closing
      }
    }
  }
}

// ─── Agent Tool Definition ───────────────────────────────────────────────────

export const SCREENSHOT_TOOL_DEF = {
  type: "function" as const,
  function: {
    name: "take_screenshot",
    description:
      "Prend une capture d'écran d'une page web (URL) et l'envoie dans le salon Discord. " +
      "Utile pour montrer visuellement le contenu d'un site, un article, un graphique, etc. " +
      "L'image est envoyée directement dans le canal courant.",
    parameters: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description:
            "L'URL complète de la page à capturer (doit commencer par http:// ou https://)",
        },
        fullPage: {
          type: "boolean",
          description:
            "Capturer la page entière (true) ou seulement le viewport visible (false, défaut)",
        },
      },
      required: ["url"],
    },
  },
};

/**
 * Handler for the take_screenshot tool — called from the agent tool dispatcher.
 */
export async function handleScreenshotTool(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const url = String(args.url || "");
  const fullPage = Boolean(args.fullPage);
  return takeScreenshot(url, ctx, fullPage);
}
