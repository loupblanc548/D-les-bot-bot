/**
 * imageSender.ts — Detects image URLs in AI responses and sends them as Discord attachments
 *
 * When the AI generates an image (via Pollinations.ai or other tools), the response
 * contains an image URL. This utility extracts those URLs, downloads the images,
 * and sends them as Discord attachments alongside the text response.
 */

import { AttachmentBuilder, Message, TextChannel } from "discord.js";
import logger from "./logger.js";

const IMAGE_URL_PATTERN = /https?:\/\/[^\s<>"']+\.(?:png|jpg|jpeg|gif|webp|bmp|svg)\b[^\s<>"']*/gi;
const POLLINATIONS_PATTERN = /https?:\/\/image\.pollinations\.ai\/prompt\/[^\s<>"']+/gi;

interface ExtractedImage {
  url: string;
  cleanUrl: string;
}

/**
 * Extracts image URLs from a text string.
 * Detects both standard image extensions and Pollinations.ai URLs.
 */
export function extractImageUrls(text: string): ExtractedImage[] {
  const urls = new Set<string>();

  // Detect Pollinations.ai URLs (may not have standard extensions)
  const pollinationsMatches = text.match(POLLINATIONS_PATTERN);
  if (pollinationsMatches) {
    for (const match of pollinationsMatches) {
      urls.add(match);
    }
  }

  // Detect standard image URLs
  const imageMatches = text.match(IMAGE_URL_PATTERN);
  if (imageMatches) {
    for (const match of imageMatches) {
      // Filter out emoji URLs and other non-image matches
      if (!match.includes("discord.com/emoji") && !match.includes("twemoji")) {
        urls.add(match);
      }
    }
  }

  return Array.from(urls).map((url) => ({
    url,
    cleanUrl: url.replace(/[)\]>.,;]+$/, ""),
  }));
}

/**
 * Removes image URLs from the text to avoid duplicate display
 * (since the image will be sent as an attachment).
 */
export function removeImageUrlsFromText(text: string, urls: ExtractedImage[]): string {
  let cleaned = text;
  for (const { url } of urls) {
    // Remove the URL and any surrounding "Image générée: " prefix
    cleaned = cleaned.replace(new RegExp(`Image générée:\\s*${escapeRegex(url)}\\s*`, "gi"), "");
    cleaned = cleaned.replace(new RegExp(`Image:\\s*${escapeRegex(url)}\\s*`, "gi"), "");
    cleaned = cleaned.replace(url, "");
  }
  // Clean up double spaces and trailing whitespace
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
  return cleaned;
}

/**
 * Downloads an image from a URL and returns it as a Buffer.
 */
async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      logger.warn(
        `[ImageSender] Failed to download image: HTTP ${response.status} — ${url.slice(0, 80)}`,
      );
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    logger.warn(
      `[ImageSender] Error downloading image: ${err instanceof Error ? err.message : String(err)} — ${url.slice(0, 80)}`,
    );
    return null;
  }
}

/**
 * Determines the file extension from a URL.
 */
function getExtensionFromUrl(url: string): string {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes(".png")) return "png";
  if (lowerUrl.includes(".jpg") || lowerUrl.includes(".jpeg")) return "jpg";
  if (lowerUrl.includes(".gif")) return "gif";
  if (lowerUrl.includes(".webp")) return "webp";
  if (lowerUrl.includes(".bmp")) return "bmp";
  if (lowerUrl.includes(".svg")) return "svg";
  // Pollinations.ai returns PNG by default
  return "png";
}

/**
 * Extracts, downloads, and sends images found in an AI response.
 * Returns the cleaned text (with image URLs removed) and sends
 * the images as attachments to the channel.
 *
 * @param channel The Discord channel to send images to
 * @param aiResponse The AI response text that may contain image URLs
 * @returns The cleaned text with image URLs removed
 */
export async function sendImagesFromResponse(
  channel: TextChannel,
  aiResponse: string,
): Promise<string> {
  const imageUrls = extractImageUrls(aiResponse);

  if (imageUrls.length === 0) {
    return aiResponse;
  }

  logger.info(`[ImageSender] Found ${imageUrls.length} image URL(s) in AI response`);

  // Download all images in parallel
  const downloadResults = await Promise.all(
    imageUrls.map(async ({ cleanUrl }, index) => {
      const buffer = await downloadImage(cleanUrl);
      if (!buffer) return null;

      const ext = getExtensionFromUrl(cleanUrl);
      const filename = `generated_${Date.now()}_${index}.${ext}`;
      return new AttachmentBuilder(buffer, { name: filename });
    }),
  );

  const attachments = downloadResults.filter((a): a is AttachmentBuilder => a !== null);

  if (attachments.length === 0) {
    logger.warn("[ImageSender] No images could be downloaded — keeping URLs in text");
    return aiResponse;
  }

  // Send images as a separate message with attachments
  try {
    await channel.send({
      content:
        attachments.length === 1
          ? "🖼️ **Image générée**"
          : `🖼️ **${attachments.length} images générées**`,
      files: attachments,
    });
    logger.info(`[ImageSender] Sent ${attachments.length} image(s) as attachments`);
  } catch (err) {
    logger.error(
      `[ImageSender] Failed to send image attachments: ${err instanceof Error ? err.message : String(err)}`,
    );
    return aiResponse;
  }

  // Remove image URLs from the text response
  return removeImageUrlsFromText(aiResponse, imageUrls);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
