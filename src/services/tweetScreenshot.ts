/**
 * tweetScreenshot.ts — Capture visuelle de tweets avec Playwright
 *
 * Prend un screenshot d'un tweet tel qu'il apparaît sur X/Twitter,
 * au lieu de juste poster un embed texte. Le screenshot est envoyé
 * comme pièce jointe dans le salon Discord concerné.
 *
 * Fallback gracieux: si Playwright échoue, le flux existant (embed texte) continue.
 */

import { chromium } from "playwright";
import { AttachmentBuilder, TextChannel, EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";

// ─── Configuration ───────────────────────────────────────────────────────────

const SCREENSHOT_TIMEOUT_MS = 12_000;
const VIEWPORT_WIDTH = 600;
const VIEWPORT_HEIGHT = 800;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TweetScreenshotResult {
  buffer: Buffer;
  filename: string;
}

// ─── Core: Screenshot a tweet ────────────────────────────────────────────────

/**
 * Capture un screenshot d'un tweet via Playwright.
 * Utilise xcancel.com (Nitter) comme proxy pour éviter le JS lourd de X.com.
 *
 * @param tweetUrl L'URL originale du tweet (https://x.com/user/status/123)
 * @returns Buffer + filename si succès, null si échec
 */
export async function captureTweetScreenshot(
  tweetUrl: string,
): Promise<TweetScreenshotResult | null> {
  let browser = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
    });

    const context = await browser.newContext({
      viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
      deviceScaleFactor: 2,
      locale: "fr-FR",
    });

    const page = await context.newPage();

    // Convertir l'URL X.com vers xcancel pour un rendu léger
    const nitterUrl = tweetUrl
      .replace("https://x.com", "https://xcancel.com")
      .replace("https://twitter.com", "https://xcancel.com");

    logger.info(`[TweetScreenshot] Capturing: ${nitterUrl}`);

    await page.goto(nitterUrl, {
      waitUntil: "domcontentloaded",
      timeout: SCREENSHOT_TIMEOUT_MS,
    });

    // Attendre que le tweet soit rendu
    try {
      await page.waitForSelector(".tweet-content, .timeline-item", {
        timeout: 5_000,
      });
    } catch {
      // Si xcancel échoue, essayer l'URL X.com directement
      logger.debug("[TweetScreenshot] Nitter failed, trying X.com directly");
      await page.goto(tweetUrl, {
        waitUntil: "domcontentloaded",
        timeout: SCREENSHOT_TIMEOUT_MS,
      });
      try {
        await page.waitForSelector("article[data-testid='tweet']", {
          timeout: 5_000,
        });
      } catch {
        logger.warn("[TweetScreenshot] Could not find tweet element");
        return null;
      }
    }

    // Screenshot du premier tweet uniquement
    const tweetSelector = ".timeline-item, article[data-testid='tweet']";
    const tweetElement = await page.$(tweetSelector);
    if (!tweetElement) {
      logger.warn("[TweetScreenshot] Tweet element not found");
      return null;
    }

    const buffer = await tweetElement.screenshot({
      type: "png",
      omitBackground: false,
    });

    const tweetId = tweetUrl.match(/\/status\/(\d+)/)?.[1] || "unknown";
    const filename = `tweet_${tweetId}.png`;

    logger.info(`[TweetScreenshot] ✓ Captured ${filename} (${buffer.length} bytes)`);

    return { buffer, filename };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn(`[TweetScreenshot] Failed: ${errMsg}`);
    return null;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // Ignore close errors
      }
    }
  }
}

/**
 * Envoie un screenshot de tweet dans un salon Discord, avec un embed
 * contenant les métadonnées (auteur, lien, plateforme).
 *
 * @param channel Le salon Discord cible
 * @param tweetUrl L'URL du tweet
 * @param account Le compte Twitter (@username)
 * @param content Le contenu texte du tweet (pour l'embed)
 * @param platformLabel Le label de la plateforme (ex: "Fortnite", "Steam")
 * @param embedColor La couleur de l'embed
 * @returns true si le screenshot a été envoyé, false si fallback nécessaire
 */
export async function sendTweetScreenshot(
  channel: TextChannel,
  tweetUrl: string,
  account: string,
  content: string,
  platformLabel: string,
  embedColor: number,
): Promise<boolean> {
  const screenshot = await captureTweetScreenshot(tweetUrl);
  if (!screenshot) {
    return false;
  }

  const attachment = new AttachmentBuilder(screenshot.buffer, {
    name: screenshot.filename,
  });

  const embed = new EmbedBuilder()
    .setTitle(`🔥 Nouveau Tweet de @${account}`)
    .setURL(tweetUrl)
    .setColor(embedColor)
    .setAuthor({
      name: `@${account}`,
      url: `https://x.com/${account}`,
    })
    .setDescription(content.slice(0, 2048) || "Voir le screenshot")
    .addFields({ name: "🖥️ Plateforme", value: platformLabel, inline: true })
    .setImage(`attachment://${screenshot.filename}`)
    .setFooter({ text: "Twitter Monitor • Capture visuelle" })
    .setTimestamp();

  try {
    await channel.send({
      content: `🔔 **Nouveau tweet de @${account}**`,
      embeds: [embed],
      files: [attachment],
    });
    logger.info(`[TweetScreenshot] ✓ Sent to #${channel.name}`);
    return true;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn(`[TweetScreenshot] Failed to send: ${errMsg}`);
    return false;
  }
}
