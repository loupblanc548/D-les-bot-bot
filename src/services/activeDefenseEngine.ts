/**
 * activeDefenseEngine.ts — Human-in-the-Loop SOAR Retaliation Engine
 *
 * Processes validated critical threats from Wazuh. FREEZES execution
 * and enters a pending state until admin approval via Discord DM.
 *
 * Pipeline:
 * 1. Threat detected → Build validation request embed
 * 2. Send DM to admin with [⚔️ AUTORISER] / [❌ IGNORER] buttons
 * 3. WAIT for admin interaction (5-minute timeout auto-abort)
 * 4a. On APPROVE → Execute retaliation → Edit DM with results + [🔓 UNDO]
 * 4b. On REJECT → Log as DISMISSED_BY_ADMIN → Edit DM
 * 4c. On TIMEOUT → Auto-abort → Edit DM
 *
 * IMMUTABLE SAFEGUARDS: Never touches DB PIDs, Node.js runtime PID,
 * Wazuh Manager PID, or the admin home IP.
 */

import { exec } from "child_process";
import { promisify } from "util";
import dns from "dns";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  Message,
} from "discord.js";
import logger from "../utils/logger.js";
import prisma from "../prisma.js";
import type { WazuhAlert } from "./wazuhClient.js";

const execAsync = promisify(exec);
const reverseDns = promisify(dns.reverse);

// ─── OSINT Enrichment ────────────────────────────────────────────────────────

interface OsintEnrichment {
  ip: string;
  country?: string;
  city?: string;
  isp?: string;
  org?: string;
  as?: string;
  hostname?: string;
  lat?: number;
  lon?: number;
}

/**
 * Enrich an IP address with OSINT data (geolocation + reverse DNS).
 */
async function enrichIP(ip: string): Promise<OsintEnrichment | null> {
  if (!ip || isProtectedIP(ip)) return null;

  const enrichment: OsintEnrichment = { ip };

  // 1. IP geolocation via ip-api.com (free, no key)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,message,country,city,isp,org,as,lat,lon,timezone`,
      { signal: controller.signal },
    );
    clearTimeout(timeout);
    if (res.ok) {
      const data = (await res.json()) as Record<string, unknown>;
      if (data.status !== "fail") {
        enrichment.country = String(data.country ?? "");
        enrichment.city = String(data.city ?? "");
        enrichment.isp = String(data.isp ?? "");
        enrichment.org = String(data.org ?? "");
        enrichment.as = String(data.as ?? "");
        enrichment.lat = data.lat as number | undefined;
        enrichment.lon = data.lon as number | undefined;
      }
    }
  } catch {
    // Non-fatal — geolocation may fail
  }

  // 2. Reverse DNS
  try {
    const hostnames = await reverseDns(ip);
    if (hostnames && hostnames.length > 0) {
      enrichment.hostname = hostnames[0];
    }
  } catch {
    // No PTR record — normal
  }

  return enrichment;
}

/**
 * Build OSINT enrichment fields for the validation embed.
 */
function buildOsintFields(enr: OsintEnrichment | null): { name: string; value: string; inline: boolean }[] {
  if (!enr) return [];
  const fields: { name: string; value: string; inline: boolean }[] = [];
  if (enr.country) fields.push({ name: "🌍 Pays", value: enr.country, inline: true });
  if (enr.city) fields.push({ name: "🏙️ Ville", value: enr.city, inline: true });
  if (enr.isp) fields.push({ name: "📡 ISP", value: enr.isp, inline: true });
  if (enr.org) fields.push({ name: "🏢 Org", value: enr.org, inline: true });
  if (enr.as) fields.push({ name: "🔗 AS", value: enr.as, inline: true });
  if (enr.hostname) fields.push({ name: "🔄 Reverse DNS", value: enr.hostname, inline: true });
  if (enr.lat && enr.lon) fields.push({ name: "📍 GPS", value: `${enr.lat}, ${enr.lon}`, inline: true });
  return fields;
}

// ─── Immutable Safeguards ────────────────────────────────────────────────────

const ADMIN_DISCORD_ID = process.env.ADMIN_DISCORD_ID ?? "";
const ADMIN_HOME_IP = process.env.ADMIN_HOME_IP ?? "";
const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

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

type DefenseAction = "NETWORK_BAN" | "PROCESS_TERMINATION" | "LOG_ONLY";

interface DefenseResult {
  action: DefenseAction;
  command: string;
  output: string;
  latencyMs: number;
  success: boolean;
}

interface ProposedAction {
  action: DefenseAction;
  command: string;
  targetIp?: string;
  targetPid?: string;
  description: string;
}

function proposeAction(alert: WazuhAlert): ProposedAction {
  if (alert.level >= 14) {
    if (alert.data?.pid) {
      return { action: "PROCESS_TERMINATION", command: `kill -9 ${alert.data.pid}`, targetPid: alert.data.pid, description: `Terminer le processus malveillant PID ${alert.data.pid} via kill -9` };
    }
    if (alert.data?.srcip) {
      return { action: "NETWORK_BAN", command: `sudo ufw deny from ${alert.data.srcip} to any`, targetIp: alert.data.srcip, description: `Bannir l'IP source ${alert.data.srcip} via UFW` };
    }
  }
  if (alert.level >= 12 && alert.data?.srcip) {
    return { action: "NETWORK_BAN", command: `sudo ufw deny from ${alert.data.srcip} to any`, targetIp: alert.data.srcip, description: `Bannir l'IP source ${alert.data.srcip} via UFW (brute-force/network attack)` };
  }
  return { action: "LOG_ONLY", command: "none", description: "Journalisation uniquement — aucune action pour ce niveau" };
}

async function executeApprovedAction(proposal: ProposedAction): Promise<DefenseResult> {
  const start = Date.now();
  switch (proposal.action) {
    case "NETWORK_BAN": {
      const ip = proposal.targetIp ?? "";
      if (!ip || isProtectedIP(ip)) return { action: "NETWORK_BAN", command: "BLOCKED (protected IP)", output: `IP ${ip} is whitelisted — action refused`, latencyMs: 0, success: false };
      try {
        const { stdout, stderr } = await execAsync(`sudo ufw deny from ${ip} to any 2>&1 || sudo iptables -A INPUT -s ${ip} -j DROP 2>&1`, { timeout: 5000 });
        const latency = Date.now() - start;
        logger.info(`[SOAR] 🔒 IP banned: ${ip} (${latency}ms)`);
        return { action: "NETWORK_BAN", command: `ufw deny from ${ip} / iptables -A INPUT -s ${ip} -j DROP`, output: (stdout + stderr).trim().slice(0, 200), latencyMs: latency, success: true };
      } catch (err) {
        return { action: "NETWORK_BAN", command: proposal.command, output: (err instanceof Error ? err.message : String(err)).slice(0, 200), latencyMs: Date.now() - start, success: false };
      }
    }
    case "PROCESS_TERMINATION": {
      const pid = proposal.targetPid ?? "";
      if (!pid || (await isProtectedPID(pid))) return { action: "PROCESS_TERMINATION", command: "BLOCKED (protected process)", output: `PID ${pid} belongs to a protected system process — action refused`, latencyMs: 0, success: false };
      try {
        const { stdout, stderr } = await execAsync(`kill -9 ${pid} 2>&1`, { timeout: 3000 });
        const latency = Date.now() - start;
        logger.info(`[SOAR] 💀 Process terminated: PID ${pid} (${latency}ms)`);
        return { action: "PROCESS_TERMINATION", command: `kill -9 ${pid}`, output: (stdout + stderr).trim().slice(0, 200) || `Process ${pid} killed`, latencyMs: latency, success: true };
      } catch (err) {
        return { action: "PROCESS_TERMINATION", command: proposal.command, output: (err instanceof Error ? err.message : String(err)).slice(0, 200), latencyMs: Date.now() - start, success: false };
      }
    }
    default:
      return { action: "LOG_ONLY", command: "none", output: "Threat logged — no action taken", latencyMs: 0, success: true };
  }
}

// ─── Pending Approval State ──────────────────────────────────────────────────

interface PendingApproval {
  alert: WazuhAlert;
  dmMessage: Message;
  proposedAction: DefenseAction;
  proposedCommand: string;
  targetIp?: string;
  targetPid?: string;
  timeoutHandle: NodeJS.Timeout;
  resolved: boolean;
}

const pendingApprovals = new Map<string, PendingApproval>();

// ─── Embed Builders ──────────────────────────────────────────────────────────

function buildValidationRequestEmbed(alert: WazuhAlert, proposal: ProposedAction, osintFields: { name: string; value: string; inline: boolean }[] = []): EmbedBuilder {
  const baseFields = [
    { name: "🔴 Niveau", value: `Level ${alert.level}`, inline: true },
    { name: "🖥️ Endpoint", value: alert.agent?.name ?? "unknown", inline: true },
    { name: "📝 Description", value: alert.description.slice(0, 200), inline: false },
    { name: "🌐 Source IP", value: alert.data?.srcip ?? "N/A", inline: true },
    { name: "🔧 PID", value: alert.data?.pid ?? "N/A", inline: true },
    { name: "📁 FIM File", value: alert.data?.file ?? "N/A", inline: true },
  ];

  const allFields = [...baseFields, ...osintFields];
  allFields.push({ name: "⚔️ Action Proposée", value: proposal.description, inline: false });
  allFields.push({ name: "💻 Commande", value: `\`\`\`bash\n${proposal.command}\n\`\`\``, inline: false });

  return new EmbedBuilder()
    .setTitle("🚨 [ATTENTE DE VALIDATION - RIPOSTE REQUISE]")
    .setColor(0xFF8C00)
    .addFields(...allFields)
    .setFooter({ text: "⏱️ Auto-abort dans 5 minutes sans réponse" })
    .setTimestamp();
}

function buildApprovalButtons(wazuhAlertId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`soar_approve_${wazuhAlertId}`).setLabel("⚔️ AUTORISER LA RIPOSTE").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`soar_reject_${wazuhAlertId}`).setLabel("❌ IGNORER / REJETER").setStyle(ButtonStyle.Secondary),
  );
}

function buildPostExecutionEmbed(alert: WazuhAlert, result: DefenseResult): EmbedBuilder {
  const fields = [
    { name: "🔴 Niveau", value: `Level ${alert.level}`, inline: true },
    { name: "🖥️ Endpoint", value: alert.agent?.name ?? "unknown", inline: true },
    { name: "⚔️ Action", value: result.action, inline: true },
    { name: "⚡ Latence", value: `${result.latencyMs}ms`, inline: true },
    { name: "✅ Statut", value: result.success ? "Exécuté" : "Échec/Refusé", inline: true },
    { name: "💻 Commande", value: `\`\`\`bash\n${result.command}\n\`\`\``, inline: false },
  ];
  if (result.output) fields.push({ name: "📋 Output", value: `\`\`\`\n${result.output.slice(0, 200)}\n\`\`\``, inline: false });
  return new EmbedBuilder().setTitle("⚔️ [RIPOSTE APPROUVÉE ET EXÉCUTÉE]").setColor(0xDC143C).addFields(...fields).setTimestamp();
}

function buildRejectedEmbed(alert: WazuhAlert): EmbedBuilder {
  return new EmbedBuilder().setTitle("❌ [RIPOSTE REJETÉE PAR L'ADMIN]").setColor(0x808080)
    .addFields(
      { name: "🔴 Niveau", value: `Level ${alert.level}`, inline: true },
      { name: "📝 Description", value: alert.description.slice(0, 200), inline: false },
      { name: "📋 Statut", value: "DISMISSED_BY_ADMIN", inline: false },
    ).setTimestamp();
}

function buildTimeoutEmbed(alert: WazuhAlert): EmbedBuilder {
  return new EmbedBuilder().setTitle("⏱️ [VALIDATION EXPIRÉE - RIPOSTE AUTO-ABORTÉE]").setColor(0x808080)
    .addFields(
      { name: "🔴 Niveau", value: `Level ${alert.level}`, inline: true },
      { name: "📝 Description", value: alert.description.slice(0, 200), inline: false },
      { name: "📋 Statut", value: "TIMEOUT — No admin response within 5 minutes", inline: false },
    ).setTimestamp();
}

function buildUndoButton(wazuhAlertId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`soar_undo_${wazuhAlertId}`).setLabel("🔓 UNDO / ROLLBACK").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`soar_investigate_${wazuhAlertId}`).setLabel("🟡 INVESTIGATE").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`soar_falsepos_${wazuhAlertId}`).setLabel("🟢 FALSE POSITIVE").setStyle(ButtonStyle.Success),
  );
}

// ─── Discord Client Reference ────────────────────────────────────────────────

let discordClient: Client | null = null;

export function setDiscordClient(client: Client): void {
  discordClient = client;
}

// ─── Main Entry Point — Human-in-the-Loop Validation Gate ────────────────────

export async function executeActiveDefense(alert: WazuhAlert): Promise<void> {
  const CYAN = "\x1b[36m", RED = "\x1b[31m", YELLOW = "\x1b[33m", RESET = "\x1b[0m", BOLD = "\x1b[1m";

  logger.warn(`${CYAN}${BOLD}[SOAR]${RESET} ${RED}Critical threat L${alert.level}: ${alert.description}${RESET}\n${YELLOW}→ Entering Human-in-the-Loop validation gate${RESET}`);

  const proposal = proposeAction(alert);

  if (proposal.action === "LOG_ONLY") {
    logger.info(`[SOAR] Threat L${alert.level} — log only, no validation needed`);
    try { await prisma.securityIncident.update({ where: { wazuhAlertId: alert.id }, data: { status: "OPEN", agentAssessment: `Logged only — level ${alert.level} below retaliation threshold` } }).catch(() => {}); } catch { /* non-fatal */ }
    return;
  }

  // OSINT enrichment — auto-investigate source IP
  const srcIp = alert.data?.srcip ?? "";
  let osintFields: { name: string; value: string; inline: boolean }[] = [];
  if (srcIp) {
    logger.info(`[SOAR] 🔍 OSINT enrichment for source IP: ${srcIp}`);
    const enrichment = await enrichIP(srcIp);
    osintFields = buildOsintFields(enrichment);
    if (enrichment) {
      logger.info(`[SOAR] 🔍 OSINT: ${srcIp} → ${enrichment.country ?? "?"} / ${enrichment.isp ?? "?"} / ${enrichment.hostname ?? "no PTR"}`);
    }
  }

  const validationEmbed = buildValidationRequestEmbed(alert, proposal, osintFields);
  const approvalButtons = buildApprovalButtons(alert.id);

  let dmMessage: Message | null = null;
  if (discordClient && ADMIN_DISCORD_ID) {
    try {
      const adminUser = await discordClient.users.fetch(ADMIN_DISCORD_ID);
      dmMessage = await adminUser.send({ embeds: [validationEmbed], components: [approvalButtons] });
      logger.info(`[SOAR] 📨 Validation request DM sent to admin — awaiting approval`);
    } catch (err) {
      logger.error(`[SOAR] Failed to send validation DM: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
  } else {
    logger.warn(`[SOAR] No admin Discord ID configured — cannot request validation. Threat logged only.`);
    return;
  }

  // FREEZE — register pending approval with 5-min timeout
  const timeoutHandle = setTimeout(() => { void handleApprovalTimeout(alert.id).catch(() => {}); }, APPROVAL_TIMEOUT_MS);

  pendingApprovals.set(alert.id, { alert, dmMessage, proposedAction: proposal.action, proposedCommand: proposal.command, targetIp: proposal.targetIp, targetPid: proposal.targetPid, timeoutHandle, resolved: false });

  try { await prisma.securityIncident.update({ where: { wazuhAlertId: alert.id }, data: { status: "OPEN", agentAssessment: `PENDING_ADMIN_APPROVAL — Proposed: ${proposal.description}` } }).catch(() => {}); } catch { /* non-fatal */ }
}

// ─── Approval Resolution Handlers ────────────────────────────────────────────

export async function handleApproval(alertId: string): Promise<void> {
  const pending = pendingApprovals.get(alertId);
  if (!pending || pending.resolved) return;
  pending.resolved = true;
  clearTimeout(pending.timeoutHandle);
  pendingApprovals.delete(alertId);

  const { alert, dmMessage, targetIp, targetPid } = pending;
  const proposal: ProposedAction = { action: pending.proposedAction, command: pending.proposedCommand, targetIp, targetPid, description: pending.proposedCommand };

  logger.info(`[SOAR] ⚔️ Admin APPROVED retaliation for alert ${alertId}`);
  const result = await executeApprovedAction(proposal);
  logger.info(`[SOAR] ✅ Action executed: ${result.action} | Latency: ${result.latencyMs}ms | Success: ${result.success}`);

  if (dmMessage) {
    try {
      const postEmbed = buildPostExecutionEmbed(alert, result);
      const undoRow = buildUndoButton(alertId);
      await dmMessage.edit({ embeds: [postEmbed], components: [undoRow] });
      logger.info(`[SOAR] ✏️ DM edited with execution results + undo buttons`);
    } catch (err) {
      logger.error(`[SOAR] Failed to edit DM: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  try { await prisma.securityIncident.update({ where: { wazuhAlertId: alertId }, data: { status: result.success ? "MUTATED_AND_CONTAINED" : "OPEN", agentAssessment: `APPROVED & EXECUTED — Action: ${result.action} | Latency: ${result.latencyMs}ms | Output: ${result.output.slice(0, 200)}` } }).catch(() => {}); } catch { /* non-fatal */ }
}

export async function handleRejection(alertId: string): Promise<void> {
  const pending = pendingApprovals.get(alertId);
  if (!pending || pending.resolved) return;
  pending.resolved = true;
  clearTimeout(pending.timeoutHandle);
  pendingApprovals.delete(alertId);

  const { alert, dmMessage } = pending;
  logger.info(`[SOAR] ❌ Admin REJECTED retaliation for alert ${alertId}`);

  if (dmMessage) {
    try { await dmMessage.edit({ embeds: [buildRejectedEmbed(alert)], components: [] }); } catch (err) { logger.error(`[SOAR] Failed to edit DM on rejection: ${err instanceof Error ? err.message : String(err)}`); }
  }

  try { await prisma.securityIncident.update({ where: { wazuhAlertId: alertId }, data: { status: "FALSE_POSITIVE", agentAssessment: "DISMISSED_BY_ADMIN — Admin rejected the proposed retaliation" } }).catch(() => {}); } catch { /* non-fatal */ }
}

async function handleApprovalTimeout(alertId: string): Promise<void> {
  const pending = pendingApprovals.get(alertId);
  if (!pending || pending.resolved) return;
  pending.resolved = true;
  pendingApprovals.delete(alertId);

  const { alert, dmMessage } = pending;
  logger.warn(`[SOAR] ⏱️ Approval timeout for alert ${alertId} — auto-aborting`);

  if (dmMessage) {
    try { await dmMessage.edit({ embeds: [buildTimeoutEmbed(alert)], components: [] }); } catch (err) { logger.error(`[SOAR] Failed to edit DM on timeout: ${err instanceof Error ? err.message : String(err)}`); }
  }

  try { await prisma.securityIncident.update({ where: { wazuhAlertId: alertId }, data: { status: "OPEN", agentAssessment: "VALIDATION_TIMEOUT — No admin response within 5 minutes. Auto-aborted." } }).catch(() => {}); } catch { /* non-fatal */ }
}

// ─── Rollback & Investigation ────────────────────────────────────────────────

export async function undoNetworkBan(ip: string): Promise<boolean> {
  if (!ip) return false;
  try { await execAsync(`sudo ufw delete deny from ${ip} 2>&1 || sudo iptables -D INPUT -s ${ip} -j DROP 2>&1`, { timeout: 5000 }); logger.info(`[SOAR] ↩️ Undo: IP ${ip} unbanned`); return true; } catch { return false; }
}

export async function markFalsePositive(wazuhAlertId: string): Promise<void> {
  try { await prisma.securityIncident.update({ where: { wazuhAlertId }, data: { status: "FALSE_POSITIVE" } }).catch(() => {}); logger.info(`[SOAR] Alert ${wazuhAlertId} marked as FALSE POSITIVE`); } catch { /* non-fatal */ }
}

export async function investigateAlert(wazuhAlertId: string, srcIp?: string): Promise<string> {
  try {
    let output = "";
    if (srcIp) { const { stdout } = await execAsync(`ss -tunap | grep "${srcIp}" 2>/dev/null || netstat -tunap | grep "${srcIp}" 2>/dev/null`, { timeout: 5000 }); output += `Connections from ${srcIp}:\n${stdout}\n\n`; }
    const { stdout: psOut } = await execAsync("ps aux --sort=-%cpu | head -20", { timeout: 5000 });
    output += `Top processes:\n${psOut}`;
    logger.info(`[SOAR] 🔍 Investigation completed for ${wazuhAlertId}`);
    return output.slice(0, 2000);
  } catch (err) { return `Investigation failed: ${err instanceof Error ? err.message : String(err)}`; }
}

export function purgeAllPendingApprovals(): void {
  for (const [id, pending] of pendingApprovals) { if (!pending.resolved) { clearTimeout(pending.timeoutHandle); pending.resolved = true; logger.info(`[SOAR] Purged pending approval ${id} on shutdown`); } }
  pendingApprovals.clear();
}
