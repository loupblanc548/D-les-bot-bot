/**
 * circuitBreaker.ts — MODULE 1: Agentic Circuit Breaker (AI Safety Engine)
 *
 * Tracks execution state for the autonomous AI agent loop (REASON → ACT → OBSERVE → REPLY).
 * Hard cap: 5 evaluation loops per interaction. If exceeded without a final REPLY,
 * the circuit breaker trips — halting execution, firing a system alert, and
 * returning a graceful immersive error to Discord.
 *
 * Memory-safe: entries are auto-cleaned after completion or timeout.
 */

import { EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type AgentPhase = "REASON" | "ACT" | "OBSERVE" | "REPLY" | "TRIPPED";

export interface CircuitBreakerState {
  /** Unique ID for this interaction (userId + timestamp). */
  interactionId: string;
  /** Discord user ID. */
  userId: string;
  /** Guild ID (empty for DMs). */
  guildId: string;
  /** Current loop count (0-indexed). */
  loopCount: number;
  /** Current phase. */
  phase: AgentPhase;
  /** Total tokens consumed so far (approximate). */
  tokensConsumed: number;
  /** Timestamp when the interaction started. */
  startedAt: number;
  /** Whether the breaker has tripped. */
  tripped: boolean;
  /** Last error message before trip. */
  lastError: string | null;
  /** Timeout handle for auto-cleanup. */
  cleanupTimeout: ReturnType<typeof setTimeout> | null;
}

// ─── Configuration ───────────────────────────────────────────────────────────

const MAX_LOOPS = 5;
const STATE_TTL_MS = 60_000; // Auto-clean state after 60s
const MAX_CONCURRENT_AGENTS = 10; // Max simultaneous agent loops globally

// ─── State Tracking ──────────────────────────────────────────────────────────

const activeStates = new Map<string, CircuitBreakerState>();

// ─── Alert Queue Hook ────────────────────────────────────────────────────────

type AlertCallback = (alert: {
  interactionId: string;
  userId: string;
  guildId: string;
  loopCount: number;
  tokensConsumed: number;
  error: string;
  timestamp: number;
}) => void;

let alertDispatcher: AlertCallback | null = null;

/**
 * Register a callback that receives alerts when the circuit breaker trips.
 * The alert system (Module 4) hooks into this.
 */
export function registerAlertDispatcher(cb: AlertCallback): void {
  alertDispatcher = cb;
}

// ─── Core API ────────────────────────────────────────────────────────────────

/**
 * Begin tracking a new agent interaction.
 * Returns the initial state. Throws if too many concurrent agents are running.
 */
export function beginInteraction(userId: string, guildId: string): CircuitBreakerState {
  const interactionId = `${userId}-${Date.now()}`;

  // Enforce global concurrency limit
  if (activeStates.size >= MAX_CONCURRENT_AGENTS) {
    // Evict the oldest state (likely stale/timed out)
    const oldest = [...activeStates.values()].sort((a, b) => a.startedAt - b.startedAt)[0];
    if (oldest) {
      cleanupState(oldest.interactionId);
    }
  }

  const state: CircuitBreakerState = {
    interactionId,
    userId,
    guildId,
    loopCount: 0,
    phase: "REASON",
    tokensConsumed: 0,
    startedAt: Date.now(),
    tripped: false,
    lastError: null,
    cleanupTimeout: setTimeout(() => cleanupState(interactionId), STATE_TTL_MS),
  };

  activeStates.set(interactionId, state);
  return state;
}

/**
 * Record a loop iteration (REASON → ACT transition).
 * Returns true if the loop can continue, false if the breaker has tripped.
 */
export function recordLoop(state: CircuitBreakerState, tokensThisLoop: number): boolean {
  if (state.tripped) return false;

  state.loopCount++;
  state.tokensConsumed += tokensThisLoop;
  state.phase = state.loopCount >= MAX_LOOPS ? "TRIPPED" : "ACT";

  if (state.loopCount >= MAX_LOOPS) {
    tripBreaker(state, `Max loops (${MAX_LOOPS}) exceeded without final reply`);
    return false;
  }

  logger.info(
    `[CircuitBreaker] Loop ${state.loopCount}/${MAX_LOOPS} — ${state.tokensConsumed} tokens consumed`,
  );
  return true;
}

/**
 * Update the current phase of the agent loop.
 */
export function setPhase(state: CircuitBreakerState, phase: AgentPhase): void {
  if (state.tripped) return;
  state.phase = phase;
}

/**
 * Mark the interaction as completed successfully (REPLY emitted).
 */
export function completeInteraction(state: CircuitBreakerState): void {
  state.phase = "REPLY";
  cleanupState(state.interactionId);
}

/**
 * Trip the circuit breaker. Halts execution, fires alert, logs error.
 */
export function tripBreaker(state: CircuitBreakerState, reason: string): void {
  if (state.tripped) return;

  state.tripped = true;
  state.phase = "TRIPPED";
  state.lastError = reason;

  logger.error(
    `[CircuitBreaker] 🚨 TRIPPED — Interaction ${state.interactionId}: ${reason} (loops: ${state.loopCount}, tokens: ${state.tokensConsumed})`,
  );

  // Fire alert to the alert queue
  if (alertDispatcher) {
    try {
      alertDispatcher({
        interactionId: state.interactionId,
        userId: state.userId,
        guildId: state.guildId,
        loopCount: state.loopCount,
        tokensConsumed: state.tokensConsumed,
        error: reason,
        timestamp: Date.now(),
      });
    } catch (err) {
      logger.error(
        `[CircuitBreaker] Alert dispatcher error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Schedule cleanup
  setTimeout(() => cleanupState(state.interactionId), 5_000);
}

/**
 * Generate a graceful, immersive Discord error embed for a tripped breaker.
 */
export function createTrippedEmbed(state: CircuitBreakerState): EmbedBuilder {
  const boxLine = (text: string) => `| ${text.padEnd(36)} |`;
  const line = "+" + "-".repeat(38) + "+";

  return new EmbedBuilder()
    .setTitle("🚨 CIRCUIT BREAKER ACTIVATED — EXECUTION HALTED")
    .setColor(0xff4444)
    .setDescription(
      "```\n" +
        line +
        "\n" +
        boxLine("SUPER-EARTH HIGH COMMAND — ALERT") +
        "\n" +
        line +
        "\n" +
        boxLine(`Agent loop exceeded safety threshold`) +
        "\n" +
        boxLine(`Max loops: ${MAX_LOOPS} | Reached: ${state.loopCount}`) +
        "\n" +
        boxLine(`Tokens consumed: ${state.tokensConsumed}`) +
        "\n" +
        boxLine(`Status: EXECUTION POOL HALTED`) +
        "\n" +
        line +
        "\n" +
        "```",
    )
    .addFields(
      {
        name: "📋 Diagnostic",
        value: `\`\`\`${state.lastError || "Unknown failure"}\`\`\``,
        inline: false,
      },
      {
        name: "🛡️ Action Taken",
        value: "Execution pool halted. Alert dispatched to `/alert pending`.",
        inline: false,
      },
      {
        name: "🔄 Recovery",
        value: "The agent will recover automatically. Please retry your request.",
        inline: false,
      },
    )
    .setFooter({ text: "Shadow Broker Intelligence Network • Circuit Breaker v2.0" })
    .setTimestamp();
}

/**
 * Get the number of currently active agent interactions.
 */
export function getActiveCount(): number {
  return activeStates.size;
}

/**
 * Get all active states (for monitoring/dashboard).
 */
export function getActiveStates(): CircuitBreakerState[] {
  return [...activeStates.values()];
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

function cleanupState(interactionId: string): void {
  const state = activeStates.get(interactionId);
  if (!state) return;

  if (state.cleanupTimeout) {
    clearTimeout(state.cleanupTimeout);
    state.cleanupTimeout = null;
  }

  activeStates.delete(interactionId);
}

/**
 * Cleanup all states (called on shutdown).
 */
export function cleanupAllStates(): void {
  for (const state of activeStates.values()) {
    if (state.cleanupTimeout) clearTimeout(state.cleanupTimeout);
  }
  activeStates.clear();
  logger.info("[CircuitBreaker] All states cleaned up");
}
