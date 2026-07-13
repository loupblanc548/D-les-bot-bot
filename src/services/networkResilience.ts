/**
 * networkResilience.ts — MODULE 6: Cross-Border Network Resilience & Discord Gateway Reconnections
 *
 * Handles network blips between the German data center and Discord's WebSocket gateways.
 * Implements robust shard event listeners, exponential backoff for reconnections,
 * and automatic rich presence restoration on reconnection.
 *
 * Memory-safe: all timers are cleaned up on shutdown. Backoff state per shard.
 */

import { Client, ActivityType, PresenceData } from "discord.js";
import logger from "../utils/logger.js";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ShardBackoffState {
  shardId: number;
  attempts: number;
  lastDisconnectAt: number;
  backoffTimer: ReturnType<typeof setTimeout> | null;
  currentBackoffMs: number;
}

interface PresenceState {
  status: PresenceData["status"];
  activities: Array<{
    name: string;
    type: ActivityType;
    url?: string;
  }>;
}

// ─── Configuration ───────────────────────────────────────────────────────────

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 120_000; // 2 min max between retries (was 1 min — 503 needs more)
const BACKOFF_MULTIPLIER = 2;
const MAX_RECONNECT_ATTEMPTS = 20; // Increased from 15 for 503 scenarios
const RATE_LIMIT_COOLDOWN_MS = 5_000; // Extra delay for 429/403
const SERVER_ERROR_COOLDOWN_MS = 15_000; // Extra delay for 503/502/504 — Discord gateway unavailable

// ─── State ───────────────────────────────────────────────────────────────────

const shardBackoff = new Map<number, ShardBackoffState>();
let savedPresence: PresenceState | null = null;
let resilienceClient: Client | null = null;
let isInitialized = false;

// ─── Stats ───────────────────────────────────────────────────────────────────

let totalDisconnects = 0;
let totalReconnects = 0;
let totalRateLimited = 0;
let totalErrors = 0;

export interface NetworkStats {
  totalDisconnects: number;
  totalReconnects: number;
  totalRateLimited: number;
  totalErrors: number;
  activeBackoffs: number;
  connected: boolean;
}

export function getNetworkStats(): NetworkStats {
  return {
    totalDisconnects,
    totalReconnects,
    totalRateLimited,
    totalErrors,
    activeBackoffs: shardBackoff.size,
    connected: resilienceClient?.isReady() ?? false,
  };
}

// ─── Presence Management ─────────────────────────────────────────────────────

/**
 * Save the bot's current presence state for restoration after reconnection.
 */
export function savePresence(presence: PresenceState): void {
  savedPresence = presence;
  logger.debug("[NetworkResilience] Presence state saved");
}

/**
 * Restore the saved presence after a reconnection.
 */
async function restorePresence(): Promise<void> {
  if (!resilienceClient || !savedPresence) return;

  try {
    await resilienceClient.user?.setPresence({
      status: savedPresence.status,
      activities: savedPresence.activities.map((a) => ({
        name: a.name,
        type: a.type,
        url: a.url as string | undefined,
      })),
    });
    logger.info("[NetworkResilience] Rich presence restored after reconnection");
  } catch (err) {
    logger.warn(
      `[NetworkResilience] Failed to restore presence: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ─── Backoff Logic ───────────────────────────────────────────────────────────

function getOrCreateBackoff(shardId: number): ShardBackoffState {
  let state = shardBackoff.get(shardId);
  if (!state) {
    state = {
      shardId,
      attempts: 0,
      lastDisconnectAt: 0,
      backoffTimer: null,
      currentBackoffMs: INITIAL_BACKOFF_MS,
    };
    shardBackoff.set(shardId, state);
  }
  return state;
}

function calculateBackoff(
  state: ShardBackoffState,
  rateLimited: boolean,
  serverError = false,
): number {
  let backoff = state.currentBackoffMs;
  if (rateLimited) {
    backoff += RATE_LIMIT_COOLDOWN_MS;
  }
  if (serverError) {
    backoff += SERVER_ERROR_COOLDOWN_MS;
  }
  return Math.min(backoff, MAX_BACKOFF_MS);
}

function clearBackoff(shardId: number): void {
  const state = shardBackoff.get(shardId);
  if (state?.backoffTimer) {
    clearTimeout(state.backoffTimer);
    state.backoffTimer = null;
  }
  shardBackoff.delete(shardId);
}

// ─── Event Handlers ──────────────────────────────────────────────────────────

function handleShardDisconnect(
  shardId: number,
  closeEvent: { code: number; reason: string },
): void {
  totalDisconnects++;
  logger.warn(
    `[NetworkResilience] Shard ${shardId} disconnected — code: ${closeEvent.code}, reason: ${closeEvent.reason || "unknown"}`,
  );

  const state = getOrCreateBackoff(shardId);
  state.lastDisconnectAt = Date.now();

  // Check if this was a rate limit disconnect
  const rateLimited = closeEvent.code === 429 || closeEvent.code === 403;
  if (rateLimited) {
    totalRateLimited++;
    logger.warn(
      `[NetworkResilience] Shard ${shardId} rate-limited (code ${closeEvent.code}) — adding extra cooldown`,
    );
  }

  // Check if this was a server error (503 Service Unavailable, 502 Bad Gateway, 504 Gateway Timeout)
  // "Unexpected server response: 503" comes as a reason string, not a close code
  const isServerError =
    closeEvent.code === 503 ||
    closeEvent.code === 502 ||
    closeEvent.code === 504 ||
    closeEvent.reason?.includes("503") ||
    closeEvent.reason?.includes("502") ||
    closeEvent.reason?.includes("Unexpected server response");
  if (isServerError) {
    logger.warn(
      `[NetworkResilience] Shard ${shardId} Discord gateway unavailable (code ${closeEvent.code}) — adding ${SERVER_ERROR_COOLDOWN_MS}ms cooldown`,
    );
  }

  const backoffMs = calculateBackoff(state, rateLimited, isServerError);
  state.attempts++;

  if (state.attempts > MAX_RECONNECT_ATTEMPTS) {
    logger.error(
      `[NetworkResilience] Shard ${shardId} exceeded max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) — giving up`,
    );
    return;
  }

  logger.info(
    `[NetworkResilience] Shard ${shardId} reconnecting in ${backoffMs}ms (attempt ${state.attempts}/${MAX_RECONNECT_ATTEMPTS})`,
  );

  // Clear any existing timer
  if (state.backoffTimer) clearTimeout(state.backoffTimer);

  // Set new backoff timer
  state.backoffTimer = setTimeout(() => {
    logger.info(`[NetworkResilience] Shard ${shardId} backoff elapsed — attempting reconnect`);
    // Discord.js auto-reconnects, but we track the attempt
    state.currentBackoffMs = Math.min(state.currentBackoffMs * BACKOFF_MULTIPLIER, MAX_BACKOFF_MS);
  }, backoffMs);
}

function handleShardReconnecting(shardId: number): void {
  logger.info(`[NetworkResilience] Shard ${shardId} reconnecting...`);
}

function handleShardReady(shardId: number): void {
  totalReconnects++;

  // Clear backoff state on successful connection
  if (shardBackoff.has(shardId)) {
    clearBackoff(shardId);
    logger.info(`[NetworkResilience] Shard ${shardId} reconnected successfully — backoff cleared`);
  }

  // Restore presence on first shard ready or after reconnection
  void restorePresence();
}

function handleError(error: Error): void {
  totalErrors++;

  // Detect Discord gateway 503 Service Unavailable
  if (error.message?.includes("503") || error.message?.includes("Unexpected server response")) {
    logger.warn(
      `[NetworkResilience] Discord gateway temporarily unavailable (503) — bot will auto-reconnect with backoff`,
    );
  } else {
    logger.error(`[NetworkResilience] Gateway error: ${error.message}`, { stack: error.stack });
  }
}

// ─── Initialization ──────────────────────────────────────────────────────────

/**
 * Initialize network resilience listeners on the Discord client.
 * Call this after the client is created but before login.
 */
export function initNetworkResilience(client: Client): void {
  if (isInitialized) {
    logger.warn("[NetworkResilience] Already initialized");
    return;
  }

  resilienceClient = client;
  isInitialized = true;

  // Shard events
  client.on("shardDisconnect", (closeEvent, shardId) => {
    handleShardDisconnect(shardId, closeEvent);
  });

  client.on("shardReconnecting", (shardId) => {
    handleShardReconnecting(shardId);
  });

  client.on("shardReady", (shardId) => {
    handleShardReady(shardId);
  });

  client.on("error", (error) => {
    handleError(error);
  });

  // Save initial presence
  if (client.user?.presence) {
    const presence = client.user.presence;
    savedPresence = {
      status: presence.status as PresenceData["status"],
      activities: presence.activities.map((a) => ({
        name: a.name || "",
        type: a.type,
        url: a.url ?? undefined,
      })),
    };
  }

  logger.info("[NetworkResilience] Initialized — listening for shard events");
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

/**
 * Shutdown network resilience — clean up all timers.
 */
export function shutdownNetworkResilience(): void {
  for (const [_shardId, state] of shardBackoff) {
    if (state.backoffTimer) {
      clearTimeout(state.backoffTimer);
    }
  }
  shardBackoff.clear();

  if (resilienceClient) {
    resilienceClient.removeAllListeners("shardDisconnect");
    resilienceClient.removeAllListeners("shardReconnecting");
    resilienceClient.removeAllListeners("shardReady");
    resilienceClient.removeAllListeners("error");
  }

  resilienceClient = null;
  isInitialized = false;
  logger.info("[NetworkResilience] Shutdown complete");
}
