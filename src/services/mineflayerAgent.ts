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
import type { TextChannel, Message } from "discord.js";

const AGENT_ENABLED =
  process.env.MINEFLAYER_AGENT_URL !== undefined ||
  process.env.MINEFLAYER_AGENT_DYNAMIC_URL === "true";
const URL_FILE = process.env.MINEFLAYER_AGENT_URL_FILE || "/opt/bot/data/mineflayer_url.txt";

let currentUrl: string | null = null;

// ─── Connection pool & caching for fluidity ───────────────────────
let lastWorldState: WorldState | null = null;
let lastWorldStateTime = 0;
const WORLD_STATE_CACHE_MS = 2000; // Cache world state for 2s to avoid spam

let lastStatus: AgentStatus | null = null;
let lastStatusTime = 0;
const STATUS_CACHE_MS = 3000;

// ─── Live log polling ─────────────────────────────────────────────
let logPoller: NodeJS.Timeout | null = null;
let logCallbacks: Array<(line: string) => void> = [];
let lastSeenLogContent = "";

/** Start polling agent log for live updates. Returns a stop function. */
export function subscribeAgentLog(callback: (line: string) => void): () => void {
  logCallbacks.push(callback);
  if (!logPoller && isAgentAvailable()) {
    logPoller = setInterval(async () => {
      const url = getUrl();
      if (!url) return;
      try {
        const result = await fetchWithRetry(`${url}/log?lines=10`, {
          timeoutMs: 5_000,
          retries: 0,
          parseJson: true,
        });
        if (result?.log) {
          const allLines = result.log.split("\n").filter(Boolean);
          const currentContent = allLines.join("\n");
          // Only emit lines that are new since last poll
          if (currentContent !== lastSeenLogContent) {
            const prevLines = lastSeenLogContent ? lastSeenLogContent.split("\n") : [];
            const newLines = allLines.slice(prevLines.length);
            for (const line of newLines) {
              for (const cb of logCallbacks) cb(line);
            }
            lastSeenLogContent = currentContent;
          }
        }
      } catch {
        logger.error("[Silent catch]");
      }
    }, 2000);
    if (logPoller.unref) logPoller.unref();
  }
  return () => {
    logCallbacks = logCallbacks.filter((cb) => cb !== callback);
    if (logCallbacks.length === 0 && logPoller) {
      clearInterval(logPoller);
      logPoller = null;
      lastSeenLogContent = "";
    }
  };
}

function readUrl(): string | null {
  if (process.env.MINEFLAYER_AGENT_URL) return process.env.MINEFLAYER_AGENT_URL;
  try {
    const content = fs.readFileSync(URL_FILE, "utf-8").trim();
    if (content && content.startsWith("http")) return content;
  } catch {
    logger.error("[Silent catch]");
  }
  return null;
}

/** Get the current agent API URL (cached). */
export function getUrl(): string | null {
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

/** Get the current world state from Mineflayer (cached for 2s). */
export async function getWorldState(): Promise<WorldState | null> {
  const now = Date.now();
  if (lastWorldState && now - lastWorldStateTime < WORLD_STATE_CACHE_MS) {
    return lastWorldState;
  }
  const url = getUrl();
  if (!url) return null;
  try {
    const result = await fetchWithRetry(`${url}/world`, {
      timeoutMs: 10_000,
      retries: 1,
      parseJson: true,
    });
    lastWorldState = result as WorldState;
    lastWorldStateTime = now;
    return lastWorldState;
  } catch (err) {
    logger.warn(`[MineflayerAgent] World state failed: ${err}`);
    return lastWorldState; // Return stale cache instead of null
  }
}

/** Get agent + bot status (cached for 3s, unless forceRefresh). */
export async function getAgentStatus(forceRefresh = false): Promise<AgentStatus | null> {
  const now = Date.now();
  if (!forceRefresh && lastStatus && now - lastStatusTime < STATUS_CACHE_MS) {
    return lastStatus;
  }
  const url = getUrl();
  if (!url) return null;
  try {
    const result = await fetchWithRetry(`${url}/status`, {
      timeoutMs: 8_000,
      retries: 1,
      parseJson: true,
    });
    lastStatus = result as AgentStatus;
    lastStatusTime = now;
    return lastStatus;
  } catch (err) {
    logger.warn(`[MineflayerAgent] Status failed: ${err}`);
    return lastStatus; // Return stale cache
  }
}

/** Set a high-level goal for the LLM agent. */
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
      timeoutMs: 15_000,
      retries: 2,
      parseJson: true,
    });
    if (result?.success) {
      logger.info(`[MineflayerAgent] Goal set: "${goal}" (max ${maxActions} actions)`);
      return {
        success: true,
        message: `🎯 Objectif envoyé au LLM: **${goal}**\n📊 Max ${maxActions} actions — le bot travaille en temps réel`,
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
export async function sendDirectAction(action: {
  type: string;
  params: Record<string, any>;
}): Promise<{ success: boolean; message: string } | null> {
  const url = getUrl();
  if (!url) return null;
  // Quick actions (eat, jump, sleep, stop, etc.) get 30s, complex ones get 60s
  const quickActions = [
    "eat",
    "jump",
    "sleep",
    "stop",
    "sprint",
    "sneak",
    "sortInventory",
    "chat",
    "getInventory",
    "getHealth",
  ];
  const timeout = quickActions.includes(action.type) ? 30_000 : 60_000;
  try {
    const result = await fetchWithRetry(`${url}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: action,
      timeoutMs: timeout,
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
  lines.push(
    `🌍 Biome: **${world.biome}** | 🕐 Heure: **${world.timeOfDay}** | 🌧️ Pluie: **${world.isRaining}**`,
  );

  if (world.inventory.length > 0) {
    const inv = world.inventory.map((i) => `${i.name} x${i.count}`).join(", ");
    lines.push(`🎒 Inventaire: ${inv}`);
  } else {
    lines.push(`🎒 Inventaire: *vide*`);
  }

  if (world.nearbyEntities.length > 0) {
    const entities = world.nearbyEntities
      .slice(0, 10)
      .map((e) => `${e.name} (${e.distance}m)`)
      .join(", ");
    lines.push(`👥 Entités proches: ${entities}`);
  }

  // Count interesting blocks (ores, wood, etc.)
  const interesting = world.nearbyBlocks.filter(
    (b) =>
      b.name.includes("ore") ||
      b.name.includes("log") ||
      b.name.includes("diamond") ||
      b.name.includes("iron") ||
      b.name.includes("gold") ||
      b.name.includes("coal"),
  );
  if (interesting.length > 0) {
    const blocks = interesting
      .slice(0, 10)
      .map((b) => `${b.name} (${b.x},${b.y},${b.z})`)
      .join(", ");
    lines.push(`💎 Ressources proches: ${blocks}`);
  }

  return lines.join("\n");
}

/** Format agent status for Discord display. */
export function formatAgentStatus(status: AgentStatus): string {
  const lines: string[] = [];
  lines.push(`🤖 Bot: **${status.connected ? "Connecté" : "Déconnecté"}**`);
  if (status.username) lines.push(`👤 Username: **${status.username}**`);
  if (status.position)
    lines.push(`📍 Position: **${status.position.x}, ${status.position.y}, ${status.position.z}**`);
  lines.push(`❤️ Santé: **${status.health}/20** | 🍖 Faim: **${status.food}/20**`);
  lines.push(`🧠 LLM: **${status.llm_model}**`);
  lines.push(`⚡ Agent: **${status.agent_running ? "En cours" : "Inactif"}**`);
  return lines.join("\n");
}

// ─── Live goal tracking with Discord message updates ───────────────

let activeGoalPoller: NodeJS.Timeout | null = null;

/**
 * Set a goal AND live-update a Discord message with progress.
 * The message updates every 2s with the latest agent log lines.
 */
export async function setAgentGoalLive(
  goal: string,
  maxActions: number,
  channel: TextChannel,
): Promise<{ success: boolean; message: string; statusMsg?: Message }> {
  // Send goal to agent
  const goalResult = await setAgentGoal(goal, maxActions);
  if (!goalResult.success) return goalResult;

  // Clear any existing live poller before starting a new one
  if (activeGoalPoller) {
    clearInterval(activeGoalPoller);
    activeGoalPoller = null;
  }

  // Create a live status message
  let statusMsg: Message | undefined;
  try {
    statusMsg = await channel.send({
      content: `🎯 **${goal}** — démarrage de l'agent...\n⏳ En attente des premières actions...`,
    });
  } catch {
    // Can't send message — goal still set, just no live tracking
    return { ...goalResult, statusMsg: undefined };
  }

  // Poll log every 2s and update the message (incremental for fluidity)
  let lastLogSince = 0;
  let lastDisplayedLog = "";
  let pollCount = 0;
  const maxPolls = Math.ceil((maxActions * 120) / 2); // Safety: 120s per action max (LLM timeout 90s + execution), poll every 2s

  const pollInterval = setInterval(async () => {
    pollCount++;
    if (pollCount > maxPolls) {
      clearInterval(pollInterval);
      activeGoalPoller = null;
      try {
        await statusMsg?.edit({
          content: `🎯 **${goal}** — ✅ Terminé (timeout de suivi atteint)\nUtilise \`/mc agentlog\` pour voir l'historique complet.`,
        });
      } catch {
        logger.error("[Silent catch]");
      }
      return;
    }

    // Check if agent is still running (force refresh to avoid stale cache)
    const status = await getAgentStatus(true);
    if (!status?.agent_running && pollCount > 2) {
      clearInterval(pollInterval);
      activeGoalPoller = null;
      const finalLog = await getAgentLog(15);
      try {
        await statusMsg?.edit({
          content: `🎯 **${goal}** — ✅ Terminé\n\`\`\`${(finalLog || "").slice(-1500)}\`\`\``,
        });
      } catch {
        logger.error("[Silent catch]");
      }
      return;
    }

    // Get incremental log lines (only new ones since last poll)
    const url = getUrl();
    if (!url) return;
    try {
      const logResult = await fetchWithRetry(`${url}/log/since?since=${lastLogSince}`, {
        timeoutMs: 5_000,
        retries: 0,
        parseJson: true,
      });
      if (logResult?.lines && Array.isArray(logResult.lines) && logResult.lines.length > 0) {
        lastLogSince = logResult.next_since ?? lastLogSince;
        const allLines = [
          ...(lastDisplayedLog ? lastDisplayedLog.split("\n") : []),
          ...logResult.lines,
        ];
        lastDisplayedLog = allLines.slice(-12).join("\n");
        const hp = status?.health !== undefined ? `❤️${status.health}` : "";
        const pos = status?.position
          ? `📍${status.position.x},${status.position.y},${status.position.z}`
          : "";
        try {
          await statusMsg?.edit({
            content: `🎯 **${goal}** — ${hp} ${pos}\n\`\`\`\n${lastDisplayedLog.slice(-1200)}\n\`\`\``,
          });
        } catch {
          logger.error("[Silent catch]");
        }
      }
    } catch {
      logger.error("[Silent catch]");
    }
  }, 2000);

  if (pollInterval.unref) pollInterval.unref();
  activeGoalPoller = pollInterval;

  return { ...goalResult, statusMsg };
}

/** Send multiple actions in rapid succession (batch mode). */
export async function sendActionBatch(
  actions: Array<{ type: string; params: Record<string, any> }>,
): Promise<Array<{ success: boolean; message: string }>> {
  const url = getUrl();
  if (!url) return actions.map(() => ({ success: false, message: "Agent non disponible" }));
  const results: Array<{ success: boolean; message: string }> = [];
  for (const action of actions) {
    try {
      const result = await fetchWithRetry(`${url}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: action,
        timeoutMs: 60_000,
        retries: 1,
        parseJson: true,
      });
      results.push(result as { success: boolean; message: string });
    } catch (err) {
      results.push({ success: false, message: String(err) });
    }
  }
  return results;
}

/** Quick action presets — one-liners for common tasks. */
export const QUICK_ACTIONS = {
  collectWood: () =>
    sendDirectAction({ type: "collectBlocks", params: { blockType: "oak_log", count: 10 } }),
  collectStone: () =>
    sendDirectAction({ type: "collectBlocks", params: { blockType: "stone", count: 20 } }),
  collectIron: () =>
    sendDirectAction({ type: "mineResource", params: { resource: "iron_ore", count: 10 } }),
  collectDiamonds: () =>
    sendDirectAction({ type: "mineResource", params: { resource: "diamond_ore", count: 5 } }),
  buildHouse: () =>
    sendDirectAction({ type: "buildHouse", params: { size: 5, material: "oak_planks" } }),
  eat: () => sendDirectAction({ type: "eat", params: {} }),
  sleep: () => sendDirectAction({ type: "sleep", params: {} }),
  defend: () => sendDirectAction({ type: "defend", params: {} }),
  hunt: () => sendDirectAction({ type: "hunt", params: {} }),
  stop: () => sendDirectAction({ type: "stop", params: {} }),
  sortInventory: () => sendDirectAction({ type: "sortInventory", params: {} }),
  explore: () => sendDirectAction({ type: "explore", params: { radius: 50 } }),
} as const;
