/**
 * colabTools.ts — Client for GPU-accelerated tasks running on Google Colab.
 *
 * Routes heavy tasks (NSFW detection, AI image detection, background removal,
 * screenshots, transcription, embeddings) to a Colab GPU backend via ngrok.
 *
 * Falls back to existing VPS-based services when Colab is unavailable.
 */

import logger from "../utils/logger.js";
import { fetchWithRetry } from "../utils/httpClient.js";
import fs from "fs";

const COLAB_TOOLS_ENABLED =
  process.env.COLAB_TOOLS_URL !== undefined || process.env.LLM_DYNAMIC_URL === "true";
const TOOLS_URL_FILE = process.env.COLAB_TOOLS_URL_FILE || "/opt/bot/data/colab_tools_url.txt";
const TOOLS_TIMEOUT = parseInt(process.env.COLAB_TOOLS_TIMEOUT_MS || "30000", 10);

let currentToolsUrl: string | null = null;

/** Read the Colab Tools URL from file (written by webhook). */
function readToolsUrl(): string | null {
  // Priority: env var > file
  if (process.env.COLAB_TOOLS_URL) return process.env.COLAB_TOOLS_URL;
  try {
    const content = fs.readFileSync(TOOLS_URL_FILE, "utf-8").trim();
    if (content && content.startsWith("http")) return content;
  } catch { logger.error("[Silent catch]"); }
  return null;
}

/** Get the current Colab Tools URL, refreshing from file if needed. */
function getToolsUrl(): string | null {
  const url = readToolsUrl();
  if (url !== currentToolsUrl) {
    if (url) {
      logger.info(`[ColabTools] Tools URL: ${url}`);
    } else if (currentToolsUrl) {
      logger.info("[ColabTools] Tools URL cleared — Colab tools session ended");
    }
    currentToolsUrl = url;
  }
  return currentToolsUrl;
}

/** Check if Colab Tools are available. */
export function isColabToolsAvailable(): boolean {
  return COLAB_TOOLS_ENABLED && getToolsUrl() !== null;
}

/** Webhook handler — called when Colab Tools notebook sends a new URL. */
export async function setColabToolsUrl(url: string): Promise<void> {
  try {
    fs.writeFileSync(TOOLS_URL_FILE, url, "utf-8");
    currentToolsUrl = url;
    logger.info(`[ColabTools] Tools URL written: ${url}`);
  } catch (err) {
    logger.error("[ColabTools] Failed to write tools URL file:", err);
  }
}

/** Ping the Colab Tools server. */
export async function pingColabTools(): Promise<boolean> {
  const url = getToolsUrl();
  if (!url) return false;
  try {
    const result = await fetchWithRetry(`${url}/health`, {
      timeoutMs: 5_000,
      retries: 1,
      parseJson: true,
    });
    return result?.status === "ok";
  } catch {
    return false;
  }
}

// ─── NSFW Classification ─────────────────────────────────────────

export interface NsfwResult {
  is_nsfw: boolean;
  nsfw_score: number;
  scores: Record<string, number>;
}

/**
 * Classify an image as NSFW using Colab GPU.
 * Falls back to the VPS-based nsfwClassifier if Colab is unavailable.
 */
export async function classifyNsfwViaColab(imageUrl: string): Promise<NsfwResult | null> {
  const url = getToolsUrl();
  if (!url) return null;
  try {
    const result = await fetchWithRetry(`${url}/nsfw`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { url: imageUrl },
      timeoutMs: TOOLS_TIMEOUT,
      retries: 1,
      parseJson: true,
      onRetry: (attempt, err) => logger.info(`[ColabTools] nsfw retry ${attempt}: ${err}`),
    });
    logger.info(
      `[ColabTools] NSFW result: score=${result?.nsfw_score?.toFixed(2)} nsfw=${result?.is_nsfw}`,
    );
    return result as NsfwResult;
  } catch (err) {
    logger.warn(`[ColabTools] NSFW classification failed: ${err}`);
    return null;
  }
}

// ─── AI Image Detection ──────────────────────────────────────────

export interface AiDetectResult {
  is_ai: boolean;
  ai_score: number;
  scores: Record<string, number>;
}

/**
 * Detect if an image is AI-generated using Colab GPU.
 */
export async function detectAiImageViaColab(imageUrl: string): Promise<AiDetectResult | null> {
  const url = getToolsUrl();
  if (!url) return null;
  try {
    const result = await fetchWithRetry(`${url}/ai-detect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { url: imageUrl },
      timeoutMs: TOOLS_TIMEOUT,
      retries: 1,
      parseJson: true,
    });
    logger.info(
      `[ColabTools] AI detect: score=${result?.ai_score?.toFixed(2)} ai=${result?.is_ai}`,
    );
    return result as AiDetectResult;
  } catch (err) {
    logger.warn(`[ColabTools] AI detection failed: ${err}`);
    return null;
  }
}

// ─── Background Removal ───────────────────────────────────────────

export interface RemoveBgResult {
  image_base64: string;
  format: string;
}

/**
 * Remove background from image using Colab GPU (rembg).
 * Falls back to remove.bg API if Colab is unavailable.
 */
export async function removeBgViaColab(imageUrl: string): Promise<RemoveBgResult | null> {
  const url = getToolsUrl();
  if (!url) return null;
  try {
    const result = await fetchWithRetry(`${url}/remove-bg`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { url: imageUrl },
      timeoutMs: TOOLS_TIMEOUT,
      retries: 1,
      parseJson: true,
    });
    logger.info(`[ColabTools] Background removed (${result?.image_base64?.length} bytes b64)`);
    return result as RemoveBgResult;
  } catch (err) {
    logger.warn(`[ColabTools] Background removal failed: ${err}`);
    return null;
  }
}

// ─── Screenshot ───────────────────────────────────────────────────

export interface ScreenshotResult {
  image_base64: string;
  format: string;
}

/**
 * Take a screenshot of a URL using Colab (Playwright + Chromium).
 * Falls back to the VPS-based screenshotTool if Colab is unavailable.
 */
export async function screenshotViaColab(targetUrl: string): Promise<ScreenshotResult | null> {
  const url = getToolsUrl();
  if (!url) return null;
  try {
    const result = await fetchWithRetry(`${url}/screenshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { url: targetUrl },
      timeoutMs: 60_000, // screenshots can take longer
      retries: 1,
      parseJson: true,
    });
    logger.info(`[ColabTools] Screenshot taken (${result?.image_base64?.length} bytes b64)`);
    return result as ScreenshotResult;
  } catch (err) {
    logger.warn(`[ColabTools] Screenshot failed: ${err}`);
    return null;
  }
}

// ─── Speech-to-Text (Whisper) ─────────────────────────────────────

export interface TranscribeResult {
  text: string;
  language: string;
}

/**
 * Transcribe audio using Whisper on Colab GPU.
 * Falls back to AssemblyAI API if Colab is unavailable.
 */
export async function transcribeViaColab(audioUrl: string): Promise<TranscribeResult | null> {
  const url = getToolsUrl();
  if (!url) return null;
  try {
    const result = await fetchWithRetry(`${url}/transcribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { url: audioUrl },
      timeoutMs: 120_000, // transcription can take a while
      retries: 1,
      parseJson: true,
    });
    logger.info(
      `[ColabTools] Transcribed: ${result?.text?.length} chars, lang=${result?.language}`,
    );
    return result as TranscribeResult;
  } catch (err) {
    logger.warn(`[ColabTools] Transcription failed: ${err}`);
    return null;
  }
}

// ─── Embeddings ───────────────────────────────────────────────────

export interface EmbeddingsResult {
  embedding: number[];
  model: string;
}

/**
 * Generate text embeddings using Colab GPU (Ollama or sentence-transformers).
 * Used for RAG memory and semantic search.
 */
export async function embeddingsViaColab(text: string): Promise<EmbeddingsResult | null> {
  const url = getToolsUrl();
  if (!url) return null;
  try {
    const result = await fetchWithRetry(`${url}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { text },
      timeoutMs: 15_000,
      retries: 1,
      parseJson: true,
    });
    logger.info(
      `[ColabTools] Embeddings: ${result?.embedding?.length} dims, model=${result?.model}`,
    );
    return result as EmbeddingsResult;
  } catch (err) {
    logger.warn(`[ColabTools] Embeddings failed: ${err}`);
    return null;
  }
}

// ─── Smart Router: Colab GPU → VPS fallback ──────────────────────

/**
 * Try Colab Tools first, fall back to VPS-based service if unavailable.
 * Usage:
 *   const result = await withColabFallback('nsfw', () => classifyNsfwViaColab(url), () => classifyNsfw(url));
 */
export async function withColabFallback<T>(
  taskName: string,
  colabFn: () => Promise<T | null>,
  fallbackFn: () => Promise<T | null>,
): Promise<T | null> {
  // Try Colab first
  if (isColabToolsAvailable()) {
    const result = await colabFn();
    if (result !== null) return result;
    logger.info(`[ColabTools] ${taskName} returned null — falling back to VPS`);
  }
  // Fall back to VPS
  return fallbackFn();
}
