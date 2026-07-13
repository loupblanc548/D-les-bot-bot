/**
 * infraWatchdog.ts — MODULE 5: Scaled Systemd/PM2 Monitor & Infrastructure Watchdog
 *
 * Background memory monitor aligned with 4GB V8 allocation (--max-old-space-size=4096).
 * Checks process.memoryUsage().heapUsed every 60 seconds.
 *
 * Thresholds:
 *   3.2GB → Automated global.gc() call + warning log
 *   3.8GB → Critical channel alert
 *   4.0GB → Graceful shutdown (process.exit(1)) so PM2/systemd restarts cleanly
 *
 * Memory-safe: interval is unref'd, all timers cleaned on shutdown.
 */

import { Client, EmbedBuilder, TextChannel } from "discord.js";
import logger from "../utils/logger.js";

// ─── Configuration ───────────────────────────────────────────────────────────

const CHECK_INTERVAL_MS = 60_000; // 60 seconds
const THRESHOLD_GC_GB = 3.2; // Trigger gc()
const THRESHOLD_CRITICAL_GB = 3.8; // Critical alert
const THRESHOLD_SHUTDOWN_GB = 4.0; // Graceful shutdown

const BYTES_PER_GB = 1024 * 1024 * 1024;

// ─── State ───────────────────────────────────────────────────────────────────

let monitorInterval: ReturnType<typeof setInterval> | null = null;
let discordClient: Client | null = null;
let alertChannelId: string | null = null;
let isShuttingDown = false;
let lastGcTime = 0;
const GC_COOLDOWN_MS = 30_000; // Don't gc() more than once per 30s

// ─── Stats ───────────────────────────────────────────────────────────────────

let checksPerformed = 0;
let gcTriggered = 0;
let criticalAlerts = 0;

export interface WatchdogStats {
  checksPerformed: number;
  gcTriggered: number;
  criticalAlerts: number;
  currentHeapGB: number;
  currentRssGB: number;
  monitoring: boolean;
}

export function getWatchdogStats(): WatchdogStats {
  const mem = process.memoryUsage();
  return {
    checksPerformed,
    gcTriggered,
    criticalAlerts,
    currentHeapGB: mem.heapUsed / BYTES_PER_GB,
    currentRssGB: mem.rss / BYTES_PER_GB,
    monitoring: monitorInterval !== null,
  };
}

// ─── Core Monitor ────────────────────────────────────────────────────────────

/**
 * Start the infrastructure watchdog.
 * @param client Discord client for sending alerts
 * @param channelId Channel ID for critical alerts (optional)
 */
export function startInfraWatchdog(client: Client, channelId?: string): void {
  if (monitorInterval) {
    logger.warn("[InfraWatchdog] Already running");
    return;
  }

  discordClient = client;
  alertChannelId = channelId ?? process.env.ALERT_CHANNEL_ID ?? null;

  monitorInterval = setInterval(checkMemory, CHECK_INTERVAL_MS);
  monitorInterval.unref?.(); // Don't keep process alive for monitor

  logger.info(
    `[InfraWatchdog] Started — thresholds: GC@${THRESHOLD_GC_GB}GB, Critical@${THRESHOLD_CRITICAL_GB}GB, Shutdown@${THRESHOLD_SHUTDOWN_GB}GB`,
  );
}

/**
 * Stop the watchdog.
 */
export function stopInfraWatchdog(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
  discordClient = null;
  logger.info("[InfraWatchdog] Stopped");
}

// ─── Memory Check Logic ──────────────────────────────────────────────────────

async function checkMemory(): Promise<void> {
  checksPerformed++;
  const mem = process.memoryUsage();
  const heapGB = mem.heapUsed / BYTES_PER_GB;
  const rssGB = mem.rss / BYTES_PER_GB;

  // Log at debug level for routine checks
  logger.debug(`[InfraWatchdog] Heap: ${heapGB.toFixed(2)}GB | RSS: ${rssGB.toFixed(2)}GB`);

  // Threshold 1: 3.2GB — trigger GC
  if (heapGB >= THRESHOLD_GC_GB) {
    await handleGcThreshold(heapGB);
  }

  // Threshold 2: 3.8GB — critical alert
  if (heapGB >= THRESHOLD_CRITICAL_GB) {
    await handleCriticalThreshold(heapGB, rssGB);
  }

  // Threshold 3: 4.0GB — graceful shutdown
  if (heapGB >= THRESHOLD_SHUTDOWN_GB) {
    await handleShutdownThreshold(heapGB, rssGB);
  }
}

async function handleGcThreshold(heapGB: number): Promise<void> {
  const now = Date.now();
  if (now - lastGcTime < GC_COOLDOWN_MS) return; // Cooldown

  lastGcTime = now;
  gcTriggered++;

  logger.warn(`[InfraWatchdog] ⚠️ Heap at ${heapGB.toFixed(2)}GB — triggering garbage collection`);

  // Attempt GC if --expose-gc was passed
  if (typeof global.gc === "function") {
    const before = process.memoryUsage().heapUsed;
    global.gc();
    const after = process.memoryUsage().heapUsed;
    const freed = (before - after) / BYTES_PER_GB;
    logger.info(
      `[InfraWatchdog] GC freed ${freed.toFixed(3)}GB (heap: ${heapGB.toFixed(2)}GB → ${(after / BYTES_PER_GB).toFixed(2)}GB)`,
    );
  } else {
    logger.warn(
      "[InfraWatchdog] global.gc() not available — start Node with --expose-gc to enable",
    );
  }
}

async function handleCriticalThreshold(heapGB: number, rssGB: number): Promise<void> {
  criticalAlerts++;

  logger.error(
    `[InfraWatchdog] 🚨 INFRASTRUCTURE OVERLOAD — MEMORY PURGE REQUIRED (Heap: ${heapGB.toFixed(2)}GB, RSS: ${rssGB.toFixed(2)}GB)`,
  );

  // Send Discord alert
  if (discordClient && alertChannelId) {
    try {
      const channel = await discordClient.channels.fetch(alertChannelId);
      if (channel?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setTitle("🚨 INFRASTRUCTURE OVERLOAD — MEMORY PURGE REQUIRED")
          .setColor(0xe74c3c)
          .setDescription(
            "```\n" +
              `HEAP USAGE: ${heapGB.toFixed(2)} GB / 4.00 GB\n` +
              `RSS USAGE:  ${rssGB.toFixed(2)} GB\n` +
              `STATUS:     CRITICAL — APPROACHING OOM\n` +
              "```",
          )
          .addFields(
            {
              name: "Action",
              value:
                "Garbage collection triggered. PM2/systemd will restart if threshold reaches 4.0GB.",
              inline: false,
            },
            { name: "Timestamp", value: new Date().toISOString(), inline: false },
          )
          .setFooter({ text: "Super-Earth Infrastructure Watchdog v2.0" })
          .setTimestamp();

        await (channel as TextChannel).send({ embeds: [embed] });
      }
    } catch (err) {
      logger.error(
        `[InfraWatchdog] Failed to send Discord alert: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Aggressive GC attempt
  if (typeof global.gc === "function") {
    global.gc();
  }
}

async function handleShutdownThreshold(heapGB: number, rssGB: number): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.error(
    `[InfraWatchdog] 💀 GRACEFUL SHUTDOWN — Heap at ${heapGB.toFixed(2)}GB (threshold: ${THRESHOLD_SHUTDOWN_GB}GB). PM2/systemd will restart.`,
  );

  // Final Discord alert
  if (discordClient && alertChannelId) {
    try {
      const channel = await discordClient.channels.fetch(alertChannelId);
      if (channel?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setTitle("💀 GRACEFUL SHUTDOWN INITIATED — OOM PREVENTION")
          .setColor(0x2f3136)
          .setDescription(
            "```\n" +
              `HEAP USAGE: ${heapGB.toFixed(2)} GB / 4.00 GB\n` +
              `RSS USAGE:  ${rssGB.toFixed(2)} GB\n` +
              `STATUS:     SHUTDOWN — PM2 RESTART IMMINENT\n` +
              "```",
          )
          .setFooter({ text: "Super-Earth Infrastructure Watchdog v2.0" })
          .setTimestamp();

        await (channel as TextChannel).send({ embeds: [embed] });
      }
    } catch {
      // Ignore — we're shutting down anyway
    }
  }

  // Stop the watchdog
  stopInfraWatchdog();

  // Graceful exit — PM2/systemd will restart
  setTimeout(() => process.exit(1), 2000);
}
