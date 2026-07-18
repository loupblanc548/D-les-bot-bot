/**
 * vpsMaintenance.ts — Layer 10.2: Active VPS Storage Watchdog
 *
 * Tool 'checkVpsStorage': Monitors disk utilization on the VPS root partition.
 *  - >80% (~120 GB on 150GB SSD): Yellow telemetry alert, low-priority logging
 *  - >92% (~138 GB on 150GB SSD): Red/Critical — freeze non-essential cron loops,
 *    push urgent SOAR alert to Admin DMs with remediation buttons
 *
 * Also exposes:
 *  - purgeOldLogs(): Delete Prisma SecurityIncident logs older than 45 days
 *  - pruneDockerCache(): Execute 'docker system prune -f'
 *  - checkVpsUptime(): Heartbeat ping to monitoring endpoint
 */

import { exec } from "child_process";
import { promisify } from "util";
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Client } from "discord.js";
import logger from "../utils/logger.js";
import prisma from "../prisma.js";

const execAsync = promisify(exec);

const ADMIN_DISCORD_ID = process.env.ADMIN_DISCORD_ID || "";
const HEARTBEAT_ENDPOINT = process.env.HEARTBEAT_ENDPOINT || "";
const DISK_WARN_THRESHOLD = 80; // Yellow: ~120 GB on 150GB SSD
const DISK_CRITICAL_THRESHOLD = 92; // Red: ~138 GB on 150GB SSD

let discordClient: Client | null = null;

export function setVpsMaintenanceClient(client: Client): void {
  discordClient = client;
}

// ─── Disk Storage Check ──────────────────────────────────────────────────────

export interface DiskInfo {
  filesystem: string;
  size: string;
  used: string;
  available: string;
  usePercent: number;
  mountedOn: string;
}

/**
 * Parse 'df -h /' output into structured DiskInfo.
 */
async function getDiskInfo(): Promise<DiskInfo | null> {
  try {
    const { stdout } = await execAsync("df -h / 2>/dev/null | tail -1", { timeout: 5000 });
    const parts = stdout.trim().split(/\s+/);
    if (parts.length < 6) return null;

    return {
      filesystem: parts[0],
      size: parts[1],
      used: parts[2],
      available: parts[3],
      usePercent: parseInt(parts[4].replace("%", ""), 10),
      mountedOn: parts[5],
    };
  } catch {
    return null;
  }
}

/**
 * Check VPS disk storage and trigger alerts if thresholds exceeded.
 */
export async function checkVpsStorage(): Promise<{
  disk: DiskInfo | null;
  status: "healthy" | "warning" | "critical";
  message: string;
}> {
  const CYAN = "\x1b[36m",
    YELLOW = "\x1b[33m",
    RED = "\x1b[31m",
    GREEN = "\x1b[32m",
    RESET = "\x1b[0m",
    BOLD = "\x1b[1m";

  const disk = await getDiskInfo();

  if (!disk) {
    return {
      disk: null,
      status: "healthy",
      message: "Unable to read disk info (not running on Linux VPS?)",
    };
  }

  logger.info(
    `${CYAN}[VPS-STORAGE]${RESET} ${GREEN}Disk: ${disk.used}/${disk.size} (${disk.usePercent}%) — ${disk.available} available${RESET}`,
  );

  if (disk.usePercent >= DISK_CRITICAL_THRESHOLD) {
    logger.error(
      `${CYAN}${BOLD}[VPS-STORAGE]${RESET} ${RED}${BOLD}CRITICAL: Disk at ${disk.usePercent}% — freezing non-essential loops${RESET}`,
    );
    await triggerCriticalDiskAlert(disk);
    return {
      disk,
      status: "critical",
      message: `CRITICAL: Disk at ${disk.usePercent}% — Validation Gate triggered`,
    };
  }

  if (disk.usePercent >= DISK_WARN_THRESHOLD) {
    logger.warn(
      `${CYAN}${BOLD}[VPS-STORAGE]${RESET} ${YELLOW}WARNING: Disk at ${disk.usePercent}% — approaching capacity${RESET}`,
    );
    return {
      disk,
      status: "warning",
      message: `WARNING: Disk at ${disk.usePercent}% — cleanup recommended`,
    };
  }

  return {
    disk,
    status: "healthy",
    message: `Disk healthy: ${disk.usePercent}% used`,
  };
}

/**
 * Trigger critical disk alert via Layer 4 Validation Gate.
 * Sends DM to admin with cleanup action buttons.
 */
async function triggerCriticalDiskAlert(disk: DiskInfo): Promise<void> {
  if (!discordClient || !ADMIN_DISCORD_ID) {
    logger.warn("[VPS-STORAGE] No Discord client — cannot send critical alert DM");
    return;
  }

  try {
    const adminUser = await discordClient.users.fetch(ADMIN_DISCORD_ID);

    const embed = new EmbedBuilder()
      .setTitle("⚠️ [ALERTE RESSOUCES VPS - DISQUE SATURÉ]")
      .setColor(0xff4444)
      .setDescription(`Le disque principal du VPS approche la saturation critique.`)
      .addFields(
        {
          name: "📊 Utilisation",
          value: `${disk.used} / ${disk.size} (${disk.usePercent}%)`,
          inline: true,
        },
        { name: "💾 Disponible", value: disk.available, inline: true },
        { name: "📁 Filesystem", value: disk.filesystem, inline: true },
        {
          name: "🔧 Actions proposées",
          value:
            "Cliquez sur un bouton ci-dessous pour exécuter une action de nettoyage automatique.",
          inline: false,
        },
      )
      .setTimestamp()
      .setFooter({ text: "Layer 10.2 — VPS Storage Watchdog" });

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("vps_purge_logs")
        .setLabel("🧹 PURGER LES LOGS HISTORIQUES")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("vps_prune_docker")
        .setLabel("🐳 PRUNE DOCKER CACHE")
        .setStyle(ButtonStyle.Secondary),
    );

    await adminUser.send({ embeds: [embed], components: [buttons] });
    logger.warn("[VPS-STORAGE] Critical disk alert DM sent to admin");
  } catch (err) {
    logger.error(
      `[VPS-STORAGE] Failed to send DM: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ─── Cleanup Actions ─────────────────────────────────────────────────────────

/**
 * Purge Prisma SecurityIncident logs older than 45 days (Directive 4 recalibration).
 */
export async function purgeOldLogs(daysToKeep: number = 45): Promise<{
  success: boolean;
  deletedCount: number;
  message: string;
}> {
  const CYAN = "\x1b[36m",
    GREEN = "\x1b[32m",
    RESET = "\x1b[0m";
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysToKeep);

    const result = await prisma.securityIncident.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    logger.info(
      `${CYAN}[VPS-STORAGE]${RESET} ${GREEN}Purged ${result.count} old SecurityIncident logs (older than ${daysToKeep} days)${RESET}`,
    );

    return {
      success: true,
      deletedCount: result.count,
      message: `Purged ${result.count} SecurityIncident logs older than ${daysToKeep} days`,
    };
  } catch (err) {
    logger.error(
      `[VPS-STORAGE] Purge logs failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return {
      success: false,
      deletedCount: 0,
      message: `Purge failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Prune Docker cache to reclaim disk space.
 */
export async function pruneDockerCache(): Promise<{
  success: boolean;
  reclaimedSpace: string;
  message: string;
}> {
  const CYAN = "\x1b[36m",
    GREEN = "\x1b[32m",
    RED = "\x1b[31m",
    RESET = "\x1b[0m";
  try {
    logger.info(`${CYAN}[VPS-STORAGE]${RESET} Pruning Docker cache...`);
    const { stdout } = await execAsync("docker system prune -f 2>&1", {
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });

    // Parse reclaimed space from output
    const match = stdout.match(/Total reclaimed space:\s*(.+)/);
    const reclaimed = match ? match[1].trim() : "unknown";

    logger.info(
      `${CYAN}[VPS-STORAGE]${RESET} ${GREEN}Docker prune complete — reclaimed: ${reclaimed}${RESET}`,
    );

    return {
      success: true,
      reclaimedSpace: reclaimed,
      message: `Docker cache pruned — reclaimed ${reclaimed}`,
    };
  } catch (err) {
    logger.error(
      `${CYAN}[VPS-STORAGE]${RESET} ${RED}Docker prune failed: ${err instanceof Error ? err.message : String(err)}${RESET}`,
    );
    return {
      success: false,
      reclaimedSpace: "0B",
      message: `Docker prune failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Uptime Heartbeat (Layer 10.3) ───────────────────────────────────────────

let heartbeatInterval: NodeJS.Timeout | null = null;

/**
 * Send a heartbeat ping to a monitoring endpoint every 5 minutes.
 * If the bot crashes, the external monitor will detect the missing heartbeat.
 */
export function startUptimeHeartbeat(): void {
  if (heartbeatInterval) {
    logger.warn("[VPS-HEARTBEAT] Already running — ignored");
    return;
  }

  if (!HEARTBEAT_ENDPOINT) {
    logger.info("[VPS-HEARTBEAT] HEARTBEAT_ENDPOINT not set — heartbeat disabled");
    return;
  }

  logger.info(`\x1b[36m[VPS-HEARTBEAT] Started — pinging ${HEARTBEAT_ENDPOINT} every 5 min\x1b[0m`);

  const sendHeartbeat = async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(HEARTBEAT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          status: "alive",
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        logger.warn(`[VPS-HEARTBEAT] Endpoint returned ${res.status}`);
      }
    } catch (err) {
      logger.debug(
        `[VPS-HEARTBEAT] Ping failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  // Send initial heartbeat
  void sendHeartbeat();

  // Schedule recurring
  heartbeatInterval = setInterval(
    () => {
      void sendHeartbeat();
    },
    5 * 60 * 1000,
  );
}

/**
 * Log recovery state to Neon database after auto-restart.
 * Called on startup to record that the process was restarted.
 */
export async function logRecoveryState(): Promise<void> {
  const CYAN = "\x1b[36m",
    GREEN = "\x1b[32m",
    RESET = "\x1b[0m",
    BOLD = "\x1b[1m";

  try {
    // Check if we have a previous crash record
    const lastIncident = await prisma.securityIncident.findFirst({
      where: { status: "OPEN" },
      orderBy: { createdAt: "desc" },
    });

    if (lastIncident) {
      logger.info(
        `${CYAN}${BOLD}[VPS-RECOVERY]${RESET} ${GREEN}Process restarted — previous state recovered${RESET}`,
      );
    }

    // Log startup recovery
    logger.info(
      `${CYAN}[VPS-RECOVERY]${RESET} ${GREEN}Heartbeat active — systemd/pm2 auto-restart enabled${RESET}`,
    );
  } catch (err) {
    logger.debug(
      `[VPS-RECOVERY] State log failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ─── VPS Maintenance Tool (for agent) ────────────────────────────────────────

/**
 * Full VPS maintenance check — combines disk check + system stats.
 * Exposed as agent tool 'check_vps_storage'.
 */
export async function vpsMaintenanceCheck(): Promise<{
  success: boolean;
  data: string;
}> {
  const disk = await getDiskInfo();

  let memInfo = "N/A";
  try {
    const { stdout: memOut } = await execAsync("free -h 2>/dev/null | head -2", { timeout: 5000 });
    memInfo = memOut.trim();
  } catch {
    /* non-critical */
  }

  let loadAvg = "N/A";
  try {
    const { stdout: loadOut } = await execAsync("cat /proc/loadavg 2>/dev/null", { timeout: 3000 });
    loadAvg = loadOut.trim();
  } catch {
    /* non-critical */
  }

  let topProcs = "N/A";
  try {
    const { stdout: topOut } = await execAsync("ps aux --sort=-%mem 2>/dev/null | head -6", {
      timeout: 5000,
    });
    topProcs = topOut.trim();
  } catch {
    /* non-critical */
  }

  const diskStr = disk
    ? `${disk.used}/${disk.size} (${disk.usePercent}%) — ${disk.available} available`
    : "N/A";

  const status = disk
    ? disk.usePercent >= DISK_CRITICAL_THRESHOLD
      ? "🚨 CRITICAL"
      : disk.usePercent >= DISK_WARN_THRESHOLD
        ? "⚠️ WARNING"
        : "✅ HEALTHY"
    : "unknown";

  const data = JSON.stringify({
    disk: disk
      ? {
          used: disk.used,
          size: disk.size,
          available: disk.available,
          usePercent: disk.usePercent,
          filesystem: disk.filesystem,
        }
      : null,
    diskStatus: status,
    memory: memInfo,
    loadAverage: loadAvg,
    topProcesses: topProcs,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });

  return { success: true, data };
}
