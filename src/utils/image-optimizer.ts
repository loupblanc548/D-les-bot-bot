/**
 * image-optimizer.ts
 *
 * Optimisation d'images avec Sharp avant envoi Discord.
 * - Redimensionne à max 1280x720 (ratio préservé)
 * - Convertit en JPEG quality 80 (plus léger que PNG/WebP pour Discord)
 * - Retourne un Buffer + un data URI pour AttachmentBuilder
 */

import sharp from "sharp";
import logger from "./logger.js";

const MAX_WIDTH = 1280;
const MAX_HEIGHT = 720;
const JPEG_QUALITY = 80;

export interface OptimizedImage {
  buffer: Buffer;
  width: number;
  height: number;
}

/**
 * Télécharge une image depuis une URL et l'optimise avec Sharp.
 * Retourne null si le téléchargement ou l'optimisation échoue.
 */
export async function fetchAndOptimizeImage(
  url: string,
  options?: { maxWidth?: number; maxHeight?: number; quality?: number },
): Promise<OptimizedImage | null> {
  const maxWidth = options?.maxWidth ?? MAX_WIDTH;
  const maxHeight = options?.maxHeight ?? MAX_HEIGHT;
  const quality = options?.quality ?? JPEG_QUALITY;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "DiscordSurveillanceBot/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) return null;

    const arrayBuffer = await res.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    const metadata = await sharp(inputBuffer).metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;

    // Si l'image est déjà petite, ne pas redimensionner
    const shouldResize = width > maxWidth || height > maxHeight;

    const pipeline = sharp(inputBuffer, { failOn: "none" });
    if (shouldResize) {
      pipeline.resize(maxWidth, maxHeight, {
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    const buffer = await pipeline
      .jpeg({ quality, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });

    return {
      buffer: buffer.data,
      width: buffer.info.width,
      height: buffer.info.height,
    };
  } catch (err) {
    logger.debug(
      `[ImageOptimizer] Échec optimisation ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * Vérifie si une URL d'image est optimisable (format supporté par Sharp).
 */
export function isOptimizableImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|webp|gif|avif|tiff|bmp)(\?|$)/i.test(url);
}
