/**
 * baritoneClient.ts — Client for Baritone AI pathfinding backend running on Colab.
 *
 * Sends commands to a headless Minecraft Java client with Baritone mod
 * running on Google Colab. The Colab notebook exposes a FastAPI server
 * that types commands into Minecraft chat via xdotool.
 *
 * Discord commands: /mc goto <x> <z>, /mc mine <ore>, /mc follow <player>,
 *                   /mc explore, /mc stop, /mc status
 */

import logger from "../utils/logger.js";
import { fetchWithRetry } from "../utils/httpClient.js";
import fs from "fs";

const BARITONE_ENABLED =
  process.env.BARITONE_URL !== undefined || process.env.BARITONE_DYNAMIC_URL === "true";
const URL_FILE = process.env.BARITONE_URL_FILE || "/opt/bot/data/baritone_url.txt";
const TIMEOUT_MS = parseInt(process.env.BARITONE_TIMEOUT_MS || "15000", 10);

let currentUrl: string | null = null;

/** Read the Baritone API URL from env or file. */
function readUrl(): string | null {
  if (process.env.BARITONE_URL) return process.env.BARITONE_URL;
  try {
    const content = fs.readFileSync(URL_FILE, "utf-8").trim();
    if (content && content.startsWith("http")) return content;
  } catch {
    logger.error("[Silent catch]");
  }
  return null;
}

/** Get current URL, refreshing from file if needed. */
function getUrl(): string | null {
  const url = readUrl();
  if (url !== currentUrl) {
    if (url) {
      logger.info(`[Baritone] API URL: ${url}`);
    } else if (currentUrl) {
      logger.info("[Baritone] API URL cleared — Colab session ended");
    }
    currentUrl = url;
  }
  return currentUrl;
}

/** Check if Baritone backend is available. */
export function isBaritoneAvailable(): boolean {
  return BARITONE_ENABLED && getUrl() !== null;
}

/** Webhook handler — called when Colab sends a new Baritone API URL. */
export async function setBaritoneUrl(url: string): Promise<void> {
  try {
    fs.writeFileSync(URL_FILE, url, "utf-8");
    currentUrl = url;
    logger.info(`[Baritone] API URL written: ${url}`);
  } catch (err) {
    logger.error("[Baritone] Failed to write URL file:", err);
  }
}

// ─── Status ──────────────────────────────────────────────────────

export interface BaritoneStatus {
  connected: boolean;
  position: { x: number; y: number; z: number } | null;
  health: number | null;
  food: number | null;
  current_task: string | null;
  baritone_active: boolean;
}

/** Get Minecraft + Baritone status. */
export async function getBaritoneStatus(): Promise<BaritoneStatus | null> {
  const url = getUrl();
  if (!url) return null;
  try {
    const result = await fetchWithRetry(`${url}/status`, {
      timeoutMs: 10_000,
      retries: 1,
      parseJson: true,
    });
    return result as BaritoneStatus;
  } catch (err) {
    logger.warn(`[Baritone] Status fetch failed: ${err}`);
    return null;
  }
}

/** Ping the Baritone backend. */
export async function pingBaritone(): Promise<boolean> {
  const url = getUrl();
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

// ─── Commands ────────────────────────────────────────────────────

/** Send a Baritone command (auto-prefixed with #). */
export async function sendBaritoneCommand(
  command: string,
): Promise<{ success: boolean; message: string }> {
  const url = getUrl();
  if (!url) {
    return { success: false, message: "❌ Baritone backend non disponible (Colab éteint ?)" };
  }
  try {
    const result = await fetchWithRetry(`${url}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { command },
      timeoutMs: TIMEOUT_MS,
      retries: 1,
      parseJson: true,
    });
    if (result?.success) {
      logger.info(`[Baritone] Command sent: #${command}`);
      return { success: true, message: `✅ Commande envoyée: \`#${command}\`` };
    }
    return { success: false, message: `❌ Échec: ${result?.error || "unknown"}` };
  } catch (err) {
    logger.warn(`[Baritone] Command failed: ${err}`);
    return {
      success: false,
      message: `❌ Erreur: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Stop Baritone pathfinding. */
export async function stopBaritone(): Promise<{ success: boolean; message: string }> {
  const url = getUrl();
  if (!url) return { success: false, message: "❌ Baritone backend non disponible" };
  try {
    await fetchWithRetry(`${url}/stop`, {
      method: "POST",
      timeoutMs: 10_000,
      retries: 1,
      parseJson: true,
    });
    logger.info("[Baritone] Stopped");
    return { success: true, message: "⏹️ Baritone arrêté." };
  } catch (err) {
    return { success: false, message: `❌ Erreur: ${err}` };
  }
}

/** Send a regular chat message (not a Baritone command). */
export async function sendMinecraftChat(
  message: string,
): Promise<{ success: boolean; message: string }> {
  const url = getUrl();
  if (!url) return { success: false, message: "❌ Baritone backend non disponible" };
  try {
    await fetchWithRetry(`${url}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { command: message },
      timeoutMs: TIMEOUT_MS,
      retries: 1,
      parseJson: true,
    });
    logger.info(`[Baritone] Chat sent: ${message}`);
    return { success: true, message: `💬 Message envoyé: ${message}` };
  } catch (err) {
    return { success: false, message: `❌ Erreur: ${err}` };
  }
}

/** Update a Baritone setting at runtime. */
export async function setBaritoneSetting(
  key: string,
  value: string,
): Promise<{ success: boolean; message: string }> {
  const url = getUrl();
  if (!url) return { success: false, message: "❌ Baritone backend non disponible" };
  try {
    await fetchWithRetry(`${url}/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { key, value },
      timeoutMs: TIMEOUT_MS,
      retries: 1,
      parseJson: true,
    });
    logger.info(`[Baritone] Setting updated: ${key}=${value}`);
    return { success: true, message: `⚙️ Paramètre \`${key}\` = \`${value}\`` };
  } catch (err) {
    return { success: false, message: `❌ Erreur: ${err}` };
  }
}

/** Get Minecraft log (last N lines). */
export async function getMinecraftLog(lines: number = 30): Promise<string | null> {
  const url = getUrl();
  if (!url) return null;
  try {
    const result = await fetchWithRetry(`${url}/log?lines=${lines}`, {
      timeoutMs: 10_000,
      retries: 1,
      parseJson: true,
    });
    return result?.log || null;
  } catch {
    return null;
  }
}

/** Force disconnect the Minecraft client. */
export async function forceDisconnectBaritone(): Promise<{ success: boolean; message: string }> {
  const url = getUrl();
  if (!url) return { success: false, message: "❌ Baritone backend non disponible" };
  try {
    await fetchWithRetry(`${url}/force-disconnect`, {
      method: "POST",
      timeoutMs: 10_000,
      retries: 1,
      parseJson: true,
    });
    logger.info("[Baritone] Force disconnected");
    return { success: true, message: "🔌 Client Minecraft arrêté." };
  } catch (err) {
    return { success: false, message: `❌ Erreur: ${err}` };
  }
}

// ─── High-level commands (for Discord slash commands) ───────────

/** Go to coordinates. */
export async function baritoneGoto(
  x: number,
  z: number,
): Promise<{ success: boolean; message: string }> {
  return sendBaritoneCommand(`goto ${x} ${z}`);
}

/** Mine a specific ore/block. */
export async function baritoneMine(
  oreName: string,
): Promise<{ success: boolean; message: string }> {
  return sendBaritoneCommand(`mine ${oreName}`);
}

/** Follow a player. */
export async function baritoneFollow(
  playerName: string,
): Promise<{ success: boolean; message: string }> {
  return sendBaritoneCommand(`follow ${playerName}`);
}

/** Explore the world. */
export async function baritoneExplore(): Promise<{ success: boolean; message: string }> {
  return sendBaritoneCommand("explore");
}

/** Build a structure (Baritone build command). */
export async function baritoneBuild(
  structure: string,
): Promise<{ success: boolean; message: string }> {
  return sendBaritoneCommand(`build ${structure}`);
}
