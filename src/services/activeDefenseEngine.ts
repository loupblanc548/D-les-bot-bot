/**
 * activeDefenseEngine.ts — Autonomous Retaliation (SOAR) Engine
 *
 * Processes validated critical threats from Wazuh and executes
 * immediate system-level counter-measures with DM notification,
 * dynamic editing, and interactive rollback buttons.
 *
 * IMMUTABLE SAFEGUARDS: Never touches DB PIDs, Node.js runtime PID,
 * Wazuh Manager PID, or the admin home IP.
 */

import { exec } from "child_process";
import { promisify } from "util";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  Message,
  ChannelType,
} from "discord.js";
import logger from "../utils/logger.js";
import prisma from "../prisma.js";
import type { WazuhAlert } from "./wazuhClient.js";

const execAsync = promisify(exec);

// ─── Immutable Safeguards ────────────────────────────────────────────────────

const ADMIN_DISCORD_ID = process.env.ADMIN_DISCORD_ID ?? "";
const ADMIN_HOME_IP = process.env.ADMIN_HOME_IP ?? "";

// PIDs that must NEVER be killed
const PROTECTED_PROCESS_NAMES = [
  "node", "postgres", "wazuh-manager", "wazuh-agent",
  "redis-server", "prisma", "nginx",
];

// IPs that must NEVER be banned
const PROTECTED_IPS = new Set<string>([
  ADMIN_HOME_IP,
  "127.0.0.1",
  "::1",
  "localhost",
]);

/**
 * Check if an IP is protected (admin or localhost).
 */
function isProtectedIP(ip: string): boolean {
  if (!ip) return false;
  const lower = ip.toLowerCase().trim();
  for (const protectedIp of PROTECTED_IPS) {
    if (protectedIp && lower === protectedIp.toLowerCase()) return true;
  }
  // Allow local network ranges
  if (lower.startsWith("10.") || lower.startsWith("192.168.") || lower.startsWith("172.16.")) {
    return true;
  }
  return false;
}

/**
 * Check if a PID belongs to a protected process.
 */
async function isProtectedPID(pid: string): Promise<boolean> {
  if (!pid) return false;
  try {
    const { stdout } = await execAsync(`ps -p ${pid} -o comm= 2>/dev/null`);
    const procName = stdout.trim();
    return PROTECTED_PROCESS_NAMES.some((name) => procName.includes(name));
  } catch {
    return false; // PID doesn't exist — safe to attempt
  }
}

// ─── Rules of Engagement ─────────────────────────────────────────────────────

type DefenseAction = "NETWORK_BAN" | "PROCESS_TERMINATION" | "CLOUDFLARE_BLOCK" | "LOG_ONLY";

interface DefenseResult {
  action: DefenseAction;
  command: string;
  output: string;
  latencyMs: number;
  success: boolean;
}

/**
 * Determine the appropriate defense action based on alert severity.
 */
function determineAction(alert: WazuhAlert): DefenseAction {
  if (alert.level >= 14) {
    // System intrusion / FIM unauthorized edits
    if (alert.data?.pid) return "PROCESS_TERMINATION";
    return "NETWORK_BAN";
  }
  if (alert.level >= 12) {
    // Brute-force / network attacks
    if (alert.data?.srcip) return "NETWORK_BAN";
    return "LOG_ONLY";
  }
  return "LOG_ONLY";
}

/**
 * Execute a network ban via UFW or iptables.
 */
async function executeNetworkBan(ip: string): Promise<DefenseResult> {
  const start = Date.now();

  if (isProtectedIP(ip)) {
    logger.warn(`[SOAR] ⛔ Refusing to ban protected IP: ${ip}`);
    return {
      action: "NETWORK_BAN",
      command: "BLOCKED (protected IP)",
      output: `IP ${ip} is whitelisted — action refused`,
      latencyMs: 0,
      success: false,
    };
  }

  const command = `sudo ufw deny from ${ip} to any 2>&1 || sudo iptables -A INPUT -s ${ip} -j DROP 2>&1`;

  try {
    const { stdout, stderr } = await execAsync(command, { timeout: 5000 });
    const latency = Date.now() - start;

    logger.info(`[SOAR] 🔒 IP banned: ${ip} (${latency}ms)`);

    return {
      action: "NETWORK_BAN",
      command: `ufw deny from ${ip} / iptables -A INPUT -s ${ip} -j DROP`,
      output: (stdout + stderr).trim().slice(0, 200),
      latencyMs: latency,
      success: true,
    };
  } catch (err) {
    const latency = Date.now() - start;
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`[SOAR] Network ban failed for ${ip}: ${errMsg}`);
    return {
      action: "NETWORK_BAN",
      command,
      output: errMsg.slice(0, 200),
      latencyMs: latency,
      success: false,
    };
  }
}

/**
 * Execute process termination via kill -9.
 */
async function executeProcessTermination(pid: string): Promise<DefenseResult> {
  const start = Date.now();

  if (await isProtectedPID(pid)) {
    logger.warn(`[SOAR] ⛔ Refusing to kill protected PID: ${pid}`);
    return {
      action: "PROCESS_TERMINATION",
      command: "BLOCKED (protected process)",
      output: `PID ${pid} belongs to a protected system process — action refused`,
      latencyMs: 0,
      success: false,
    };
  }

  const command = `kill -9 ${pid} 2>&1`;

  try {
    const { stdout, stderr } = await execAsync(command, { timeout: 3000 });
    const latency = Date.now() - start;

    logger.info(`[SOAR] 💀 Process terminated: PID ${pid} (${latency}ms)`);

    return {
      action: "PROCESS_TERMINATION",
      command,
      output: (stdout + stderr).trim().slice(0, 200) || `Process ${pid} killed`,
      latencyMs: latency,
      success: true,
    };
  } catch (err) {
    const latency = Date.now() - start;
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`[SOAR] Process termination failed for PID ${pid}: ${errMsg}`);
    return {
      action: "PROCESS_TERMINATION",
      command,
      output: errMsg.slice(0, 200),
      latencyMs: latency,
      success: false,
    };
  }
}

// ─── DM Notification Pipeline ────────────────────────────────────────────────

/**
 * Build the initial threat-signature embed (pre-action).
 */
function buildThreatEmbed(alert: WazuhAlert): EmbedBuilder {
  const color = alert.level >= 14 ? 0xDC143C : 0xFF8C00; // Crimson or Dark Orange

  return new EmbedBuilder()
    .setTitle("⚠️ [MENACE DÉTECTÉE - ACTION INBOUND]")
    .setColor(color)
    .addFields(
      { name: "🔴 Niveau", value: `Level ${alert.level}`, inline: true },
      { name: "🖥️ Endpoint", value: alert.agent?.name ?? "unknown", inline: true },
      { name: "📝 Description", value: alert.description.slice(0, 200), inline: false },
      { name: "🔍 Règle", value: alert.rule?.description ?? "N/A", inline: true },
      { name: "🌐 Source IP", value: alert.data?.srcip ?? "N/A", inline: true },
      { name: "⏱️ Timestamp", value: alert.timestamp, inline: true },
    )
    .setTimestamp();
}

/**
 * Build the post-action embed (edited after retaliation executes).
 */
function buildPostActionEmbed(
  alert: WazuhAlert,
  result: DefenseResult,
): EmbedBuilder {
  const color = 0xDC143C; // High-Alert Crimson

  const fields = [
    { name: "🔴 Niveau", value: `Level ${alert.level}`, inline: true },
    { name: "🖥️ Endpoint", value: alert.agent?.name ?? "unknown", inline: true },
    { name: "📝 Description", value: alert.description.slice(0, 200), inline: false },
    { name: "⚔️ Action", value: result.action, inline: true },
    { name: "⚡ Latence", value: `${result.latencyMs}ms`, inline: true },
    { name: "✅ Statut", value: result.success ? "Exécuté" : "Échec/Refusé", inline: true },
  ];

  if (result.output) {
    fields.push({
      name: "📋 Output",
      value: `\`\`\`${result.output.slice(0, 200)}\`\`\``,
      inline: false,
    });
  }

  return new EmbedBuilder()
    .setTitle("⚔️ [RIPOSTE EXÉCUTÉE ET CONTENUE]")
    .setColor(color)
    .addFields(...fields)
    .setTimestamp();
}

/**
 * Build interactive buttons for the post-action DM.
 */
function buildActionButtons(wazuhAlertId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`soar_undo_${wazuhAlertId}`)
      .setLabel("🔓 UNDO / ROLLBACK")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`soar_investigate_${wazuhAlertId}`)
      .setLabel("🟡 INVESTIGATE")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`soar_falsepos_${wazuhAlertId}`)
      .setLabel("🟢 FALSE POSITIVE")
      .setStyle(ButtonStyle.Success),
  );
}

/**
 * Undo a network ban (rollback).
 */
export async function undoNetworkBan(ip: string): Promise<boolean> {
  if (!ip) return false;
  try {
    await execAsync(`sudo ufw delete deny from ${ip} 2>&1 || sudo iptables -D INPUT -s ${ip} -j DROP 2>&1`, {
      timeout: 5000,
    });
    logger.info(`[SOAR] ↩️ Undo: IP ${ip} unbanned`);
    return true;
  } catch {
    return false;
  }
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

let discordClient: Client | null = null;

/**
 * Set the Discord client reference (called from startup).
 */
export function setDiscordClient(client: Client): void {
  discordClient = client;
}

/**
 * Execute the full SOAR pipeline for a validated critical threat.
 *
 * Order of execution:
 * 1. Build threat embed
 * 2. Send DM to admin
 * 3. Execute retaliation command
 * 4. Calculate latency
 * 5. Edit DM with post-action embed + buttons
 */
export async function executeActiveDefense(alert: WazuhAlert): Promise<void> {
  const CYAN = "\x1b[36m";
  const RED = "\x1b[31m";
  const GREEN = "\x1b[32m";
  const RESET = "\x1b[0m";
  const BOLD = "\x1b[1m";

  logger.warn(
    `${CYAN}${BOLD}[SOAR]${RESET} ${RED}Activating retaliation for L${alert.level} threat: ${alert.description}${RESET}`,
  );

  // Step 1: Build threat embed
  const threatEmbed = buildThreatEmbed(alert);

  // Step 2: Send DM to admin
  let dmMessage: Message | null = null;
  if (discordClient && ADMIN_DISCORD_ID) {
    try {
      const adminUser = await discordClient.users.fetch(ADMIN_DISCORD_ID);
      dmMessage = await adminUser.send({ embeds: [threatEmbed] });
      logger.info(`[SOAR] 📨 Threat DM sent to admin`);
    } catch (err) {
      logger.error(`[SOAR] Failed to send DM: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Step 3: Determine and execute retaliation
  const action = determineAction(alert);
  let result: DefenseResult;

  switch (action) {
    case "NETWORK_BAN": {
      const ip = alert.data?.srcip ?? "";
      if (!ip) {
        result = {
          action: "LOG_ONLY",
          command: "No source IP available",
          output: "Cannot ban — no source IP in alert",
          latencyMs: 0,
          success: false,
        };
      } else {
        result = await executeNetworkBan(ip);
      }
      break;
    }
    case "PROCESS_TERMINATION": {
      const pid = alert.data?.pid ?? "";
      if (!pid) {
        result = {
          action: "LOG_ONLY",
          command: "No PID available",
          output: "Cannot kill — no PID in alert",
          latencyMs: 0,
          success: false,
        };
      } else {
        result = await executeProcessTermination(pid);
      }
      break;
    }
    default:
      result = {
        action: "LOG_ONLY",
        command: "none",
        output: "Threat logged — no automated action for this severity",
        latencyMs: 0,
        success: true,
      };
  }

  // Step 4: Log the result
  logger.info(
    `${CYAN}${BOLD}[SOAR]${RESET} ${GREEN}Action: ${result.action} | Latency: ${result.latencyMs}ms | Success: ${result.success}${RESET}`,
  );

  // Step 5: Edit the DM with post-action embed + buttons
  if (dmMessage) {
    try {
      const postEmbed = buildPostActionEmbed(alert, result);
      const buttons = buildActionButtons(alert.id);
      await dmMessage.edit({ embeds: [postEmbed], components: [buttons] });
      logger.info(`[SOAR] ✏️ DM edited with post-action results + buttons`);
    } catch (err) {
      logger.error(`[SOAR] Failed to edit DM: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Update SecurityIncident in DB
  try {
    await prisma.securityIncident.update({
      where: { wazuhAlertId: alert.id },
      data: {
        status: result.success ? "MUTATED_AND_CONTAINED" : "OPEN",
        agentAssessment: `SOAR Action: ${result.action} | Latency: ${result.latencyMs}ms | Output: ${result.output.slice(0, 200)}`,
      },
    }).catch(() => {});
  } catch {
    // Non-fatal
  }
}

/**
 * Mark an incident as false positive.
 */
export async function markFalsePositive(wazuhAlertId: string): Promise<void> {
  try {
    await prisma.securityIncident.update({
      where: { wazuhAlertId },
      data: { status: "FALSE_POSITIVE" },
    }).catch(() => {});
    logger.info(`[SOAR] Alert ${wazuhAlertId} marked as FALSE POSITIVE`);
  } catch {
    // Non-fatal
  }
}

/**
 * Investigate an alert — dump process tree.
 */
export async function investigateAlert(wazuhAlertId: string, srcIp?: string): Promise<string> {
  try {
    let output = "";
    if (srcIp) {
      const { stdout } = await execAsync(
        `ss -tunap | grep "${srcIp}" 2>/dev/null || netstat -tunap | grep "${srcIp}" 2>/dev/null`,
        { timeout: 5000 },
      );
      output += `Connections from ${srcIp}:\n${stdout}\n\n`;
    }
    const { stdout: psOut } = await execAsync("ps aux --sort=-%cpu | head -20", { timeout: 5000 });
    output += `Top processes:\n${psOut}`;

    logger.info(`[SOAR] 🔍 Investigation completed for ${wazuhAlertId}`);
    return output.slice(0, 2000);
  } catch (err) {
    return `Investigation failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}
