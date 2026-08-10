/**
 * mineflayerAgent.ts — Client for the LLM-controlled Minecraft agent on Colab.
 *
 * The Colab notebook runs:
 *   - Ollama LLM (7B-70B) on GPU
 *   - Mineflayer bot connected to a Minecraft Java server
 *   - FastAPI server exposing the agent loop
 *
 * The Discord bot sends high-level goals, and the LLM on Colab:
 *   1. Observes the world via Mineflayer
 *   2. Decides actions using the 70B model
 *   3. Executes them via Mineflayer
 *   4. Repeats until the goal is done
 *
 * Discord commands:
 *   /mc agent <goal>   — Set a goal for the LLM agent
 *   /mc agentstop       — Stop the agent
 *   /mc agentstatus     — Get agent + bot status
 *   /mc agentlog        — View agent action log
 *   /mc agentworld      — View current world state
 *   /mc agentchat <msg> — Send a chat message via the bot
 */

import logger from "../utils/logger.js";
import { fetchWithRetry } from "../utils/httpClient.js";
import fs from "fs";

const AGENT_ENABLED =
  process.env.MINEFLAYER_AGENT_URL !== undefined ||
  process.env.MINEFLAYER_AGENT_DYNAMIC_URL === "true";
const URL_FILE = process.env.MINEFLAYER_AGENT_URL_FILE || "/opt/bot/data/mineflayer_url.txt";
const TIMEOUT_MS = parseInt(process.env.MINEFLAYER_AGENT_TIMEOUT_MS || "120000", 10);

let currentUrl: string | null = null;

function readUrl(): string | null {
  if (process.env.MINEFLAYER_AGENT_URL) return process.env.MINEFLAYER_AGENT_URL;
  try {
    const content = fs.readFileSync(URL_FILE, "utf-8").trim();
    if (content && content.startsWith("http")) return content;
  } catch {
    // File doesn't exist yet
  }
  return null;
}

function getUrl(): string | null {
  const url = readUrl();
  if (url !== currentUrl) {
    if (url) {
      logger.info(`[MineflayerAgent] API URL: ${url}`);
    } else if (currentUrl) {
      logger.info("[MineflayerAgent] API URL cleared — Colab session ended");
    }
    currentUrl = url;
  }
  return currentUrl;
}

/** Check if Mineflayer agent is available. */
export function isAgentAvailable(): boolean {
  return AGENT_ENABLED && getUrl() !== null;
}

/** Webhook handler — called when Colab sends a new agent URL. */
export async function setAgentUrl(url: string): Promise<void> {
  try {
    fs.writeFileSync(URL_FILE, url, "utf-8");
    currentUrl = url;
    logger.info(`[MineflayerAgent] API URL written: ${url}`);
  } catch (err) {
    logger.error("[MineflayerAgent] Failed to write URL file:", err);
  }
}

// ─── Types ──────────────────────────────────────────────────────

export interface WorldState {
  position: { x: string; y: string; z: string } | null;
  health: number;
  food: number;
  saturation: number;
  oxygen: number;
  gameMode: string;
  isMoving: boolean;
  nearbyBlocks: Array<{ name: string; x: number; y: number; z: number }>;
  nearbyEntities: Array<{ name: string; type: number; distance: string }>;
  inventory: Array<{ name: string; count: number }>;
  timeOfDay: number;
  isRaining: boolean;
  biome: string;
}

export interface AgentStatus {
  connected: boolean;
  username: string | null;
  position: { x: string; y: string; z: string } | null;
  health: number;
  food: number;
  agent_running: boolean;
  llm_model: string;
}

// ─── API calls ──────────────────────────────────────────────────

/** Ping the agent backend. */
export async function pingAgent(): Promise<boolean> {
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

/** Get the current world state from Mineflayer. */
export async function getWorldState(): Promise<WorldState | null> {
  const url = getUrl();
  if (!url) return null;
  try {
    const result = await fetchWithRetry(`${url}/world`, {
      timeoutMs: 15_000,
      retries: 1,
      parseJson: true,
    });
    return result as WorldState;
  } catch (err) {
    logger.warn(`[MineflayerAgent] World state failed: ${err}`);
    return null;
  }
}

/** Get agent + bot status. */
export async function getAgentStatus(): Promise<AgentStatus | null> {
  const url = getUrl();
  if (!url) return null;
  try {
    const result = await fetchWithRetry(`${url}/status`, {
      timeoutMs: 10_000,
      retries: 1,
      parseJson: true,
    });
    return result as AgentStatus;
  } catch (err) {
    logger.warn(`[MineflayerAgent] Status failed: ${err}`);
    return null;
  }
}

/**
 * Set a high-level goal for the LLM agent.
 * The LLM will observe the world, decide actions, and execute them.
 * Examples: "Build a small house", "Mine 10 iron ore", "Find diamonds",
 *           "Kill the nearby zombie", "Collect 20 wood"
 */
export async function setAgentGoal(
  goal: string,
  maxActions: number = 50,
): Promise<{ success: boolean; message: string }> {
  const url = getUrl();
  if (!url) {
    return {
      success: false,
      message: "❌ Agent Mineflayer non disponible (Colab éteint ?)",
    };
  }
  try {
    const result = await fetchWithRetry(`${url}/goal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { goal, max_actions: maxActions },
      timeoutMs: 30_000,
      retries: 1,
      parseJson: true,
    });
    if (result?.success) {
      logger.info(`[MineflayerAgent] Goal set: "${goal}" (max ${maxActions} actions)`);
      return {
        success: true,
        message: `🎯 Objectif envoyé au LLM: **${goal}**\n📊 Max ${maxActions} actions — utilise \`/mc agentstatus\` pour suivre`,
      };
    }
    return {
      success: false,
      message: `❌ ${result?.error || "Échec"}`,
    };
  } catch (err) {
    logger.warn(`[MineflayerAgent] Goal failed: ${err}`);
    return {
      success: false,
      message: `❌ Erreur: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Stop the agent loop. */
export async function stopAgent(): Promise<{ success: boolean; message: string }> {
  const url = getUrl();
  if (!url) return { success: false, message: "❌ Agent non disponible" };
  try {
    await fetchWithRetry(`${url}/stop`, {
      method: "POST",
      timeoutMs: 10_000,
      retries: 1,
      parseJson: true,
    });
    logger.info("[MineflayerAgent] Stopped");
    return { success: true, message: "⏹️ Agent arrêté." };
  } catch (err) {
    return { success: false, message: `❌ Erreur: ${err}` };
  }
}

/** Get the agent action log. */
export async function getAgentLog(lines: number = 30): Promise<string | null> {
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

/** Send a chat message through the Minecraft bot. */
export async function sendAgentChat(
  message: string,
): Promise<{ success: boolean; message: string }> {
  const url = getUrl();
  if (!url) return { success: false, message: "❌ Agent non disponible" };
  try {
    await fetchWithRetry(`${url}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { message },
      timeoutMs: 10_000,
      retries: 1,
      parseJson: true,
    });
    logger.info(`[MineflayerAgent] Chat: ${message}`);
    return { success: true, message: `💬 ${message}` };
  } catch (err) {
    return { success: false, message: `❌ Erreur: ${err}` };
  }
}

/** Send a single action directly (bypass LLM). */
export async function sendDirectAction(
  action: { type: string; params: Record<string, unknown> },
): Promise<{ success: boolean; message: string } | null> {
  const url = getUrl();
  if (!url) return null;
  try {
    const result = await fetchWithRetry(`${url}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: action,
      timeoutMs: TIMEOUT_MS,
      retries: 1,
      parseJson: true,
    });
    return result as { success: boolean; message: string };
  } catch (err) {
    logger.warn(`[MineflayerAgent] Direct action failed: ${err}`);
    return null;
  }
}

// ─── Format helpers for Discord ──────────────────────────────────

/** Format world state for Discord display. */
export function formatWorldState(world: WorldState): string {
  const lines: string[] = [];
  if (world.position) {
    lines.push(`📍 Position: **${world.position.x}, ${world.position.y}, ${world.position.z}**`);
  }
  lines.push(`❤️ Santé: **${world.health}/20** | 🍖 Faim: **${world.food}/20**`);
  lines.push(`🌍 Biome: **${world.biome}** | 🕐 Heure: **${world.timeOfDay}** | 🌧️ Pluie: **${world.isRaining}**`);

  if (world.inventory.length > 0) {
    const inv = world.inventory.map((i) => `${i.name} x${i.count}`).join(", ");
    lines.push(`🎒 Inventaire: ${inv}`);
  } else {
    lines.push(`🎒 Inventaire: *vide*`);
  }

  if (world.nearbyEntities.length > 0) {
    const entities = world.nearbyEntities.slice(0, 10).map((e) => `${e.name} (${e.distance}m)`).join(", ");
    lines.push(`👥 Entités proches: ${entities}`);
  }

  // Count interesting blocks (ores, wood, etc.)
  const interesting = world.nearbyBlocks.filter((b) =>
    b.name.includes("ore") || b.name.includes("log") || b.name.includes("diamond") ||
    b.name.includes("iron") || b.name.includes("gold") || b.name.includes("coal"),
  );
  if (interesting.length > 0) {
    const blocks = interesting.slice(0, 10).map((b) => `${b.name} (${b.x},${b.y},${b.z})`).join(", ");
    lines.push(`💎 Ressources proches: ${blocks}`);
  }

  return lines.join("\n");
}

/** Format agent status for Discord display. */
export function formatAgentStatus(status: AgentStatus): string {
  const lines: string[] = [];
  lines.push(`🤖 Bot: **${status.connected ? "Connecté" : "Déconnecté"}**`);
  if (status.username) lines.push(`👤 Username: **${status.username}**`);
  if (status.position) lines.push(`📍 Position: **${status.position.x}, ${status.position.y}, ${status.position.z}**`);
  lines.push(`❤️ Santé: **${status.health}/20** | 🍖 Faim: **${status.food}/20**`);
  lines.push(`🧠 LLM: **${status.llm_model}**`);
  lines.push(`⚡ Agent: **${status.agent_running ? "En cours" : "Inactif"}**`);
  return lines.join("\n");
}
