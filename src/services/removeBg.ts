/**
 * removeBg.ts — Remove.bg Image Background Removal
 *
 * Uses the Remove.bg API to remove backgrounds from images.
 * Metered API — free quota is limited, then cost per call.
 *
 * Env vars:
 *  - REMOVEBG_API_KEY: API key (required)
 *
 * Degrades gracefully: if not configured, returns null and the tool is filtered.
 */

import logger from "../utils/logger.js";

const REMOVEBG_API_KEY = process.env.REMOVEBG_API_KEY ?? "";

// ─── Public API ──────────────────────────────────────────────────────────────

export async function removeBackground(
  imageUrl: string,
): Promise<{ resultUrl: string; creditsUsed: number } | null> {
  // Try Colab GPU rembg first (free, no API credits)
  try {
    const { removeBgViaColab, isColabToolsAvailable } = await import("./colabTools.js");
    if (isColabToolsAvailable()) {
      const colabResult = await removeBgViaColab(imageUrl);
      if (colabResult?.image_base64) {
        // Return as data URL
        const dataUrl = `data:image/${colabResult.format};base64,${colabResult.image_base64}`;
        logger.info("[RemoveBg] Background removed via Colab GPU (rembg)");
        return { resultUrl: dataUrl, creditsUsed: 0 };
      }
    }
  } catch {
    // Colab unavailable — continue to remove.bg API
  }

  if (!REMOVEBG_API_KEY) {
    logger.debug("[RemoveBg] API key not configured");
    return null;
  }

  try {
    const formData = new FormData();
    formData.append("image_url", imageUrl);
    formData.append("size", "auto");

    const res = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: {
        "X-Api-Key": REMOVEBG_API_KEY,
      },
      body: formData,
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "unknown");
      logger.warn(`[RemoveBg] HTTP ${res.status}: ${errText}`);
      return null;
    }

    // Remove.bg returns binary PNG data
    const arrayBuffer = await res.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const dataUrl = `data:image/png;base64,${base64}`;

    // Extract credits used from headers (if available)
    const creditsHeader = res.headers.get("X-Credits-Used");
    const creditsUsed = creditsHeader ? parseInt(creditsHeader, 10) : 1;

    logger.info(`[RemoveBg] Background removed (${creditsUsed} credits used)`);

    return { resultUrl: dataUrl, creditsUsed };
  } catch (err) {
    logger.warn(`[RemoveBg] Error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export function isRemoveBgConfigured(): boolean {
  return !!REMOVEBG_API_KEY;
}
