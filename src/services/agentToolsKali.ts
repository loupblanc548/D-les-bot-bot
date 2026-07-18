/**
 * agentToolsKali.ts — Isolated Kali Linux Security Audit Engine
 *
 * Layer 7: Bridges the agent to a secure, isolated Docker container
 * running kalilinux/kali-rolling. All auditing utilities (nmap, nikto)
 * execute strictly inside the ephemeral container.
 *
 * IMMUTABLE SAFEGUARDS:
 * - ALLOWED_AUDIT_TARGETS whitelist — targets outside these are REJECTED
 * - Pre-scan Discord Validation Gate before any Docker exec
 * - All commands run via `docker exec kali-box` — host is never touched
 */

import { exec } from "child_process";
import { promisify } from "util";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
} from "discord.js";
import logger from "../utils/logger.js";
import type { AgentToolDef, ToolCallResult } from "./agentTools.js";

const execAsync = promisify(exec);

const PURPLE = "\x1b[35m";
const CYAN = "\x1b[36m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const BOLD = "\x1b[1m";
const INVERT = "\x1b[7m";
const RESET = "\x1b[0m";

const ADMIN_DISCORD_ID = process.env.ADMIN_DISCORD_ID ?? "";
const MY_VPS_IP = process.env.MY_VPS_IP ?? process.env.VPS_IP ?? "";

// ─── IMMUTABLE: Network Target Whitelist ─────────────────────────────────────

const ALLOWED_AUDIT_TARGETS: string[] = [
  "127.0.0.1",
  "localhost",
  "192.168.1.",
  MY_VPS_IP,
].filter(Boolean);

/**
 * Validate that a target is within the allowed audit scope.
 * Returns true if the target matches any whitelist entry.
 */
function isTargetAllowed(target: string): boolean {
  const normalized = target.trim().toLowerCase();
  if (!normalized) return false;

  for (const allowed of ALLOWED_AUDIT_TARGETS) {
    const allowedLower = allowed.toLowerCase();
    // Exact match
    if (normalized === allowedLower) return true;
    // Prefix match (e.g., "192.168.1." matches "192.168.1.100")
    if (allowedLower.endsWith(".") && normalized.startsWith(allowedLower)) return true;
  }

  return false;
}

// ─── Discord Client for Validation Gate ──────────────────────────────────────

let kaliDiscordClient: Client | null = null;

export function setKaliClient(client: Client): void {
  kaliDiscordClient = client;
}

// ─── Pending Kali Audit Approvals ────────────────────────────────────────────

interface PendingKaliAudit {
  auditId: string;
  tool: string;
  target: string;
  command: string;
  resolve: (approved: boolean) => void;
  timeoutHandle: NodeJS.Timeout;
}

const pendingKaliAudits = new Map<string, PendingKaliAudit>();
const KALI_APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;

// ─── Pre-Scan Validation Gate ────────────────────────────────────────────────

async function requestKaliAuditApproval(
  tool: string,
  target: string,
  command: string,
): Promise<boolean> {
  if (!kaliDiscordClient || !ADMIN_DISCORD_ID) {
    logger.warn(`${PURPLE}[KALI]${RESET} No Discord client — auto-denying audit request`);
    return false;
  }

  const auditId = `kali_${tool}_${Date.now()}`;

  const embed = new EmbedBuilder()
    .setTitle("🔍 [DEMANDE D'AUDIT RÉSEAU - COUCHE KALI]")
    .setColor(0x8b5cf6)
    .addFields(
      { name: "🛠️ Outil Demandé", value: tool, inline: true },
      { name: "🎯 Hôte Cible", value: target, inline: true },
      { name: "📋 Contexte", value: "Audit sécurité isolé via conteneur Docker Kali Linux", inline: false },
      { name: "💻 Commande", value: `\`\`\`bash\n${command}\n\`\`\``, inline: false },
      { name: "🐳 Environnement", value: "Container: `kalilinux/kali-rolling` (ephemeral, isolated)", inline: false },
    )
    .setFooter({ text: "⏱️ Auto-annulation dans 5 minutes sans réponse" })
    .setTimestamp();

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`kali_approve_${auditId}`)
      .setLabel("🟢 LANCER L'AUDIT")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`kali_reject_${auditId}`)
      .setLabel("❌ ANNULER")
      .setStyle(ButtonStyle.Danger),
  );

  try {
    const adminUser = await kaliDiscordClient.users.fetch(ADMIN_DISCORD_ID);
    await adminUser.send({ embeds: [embed], components: [buttons] });

    logger.info(
      `${PURPLE}${BOLD}[KALI-GATE]${RESET} ${CYAN}🔍 Audit validation request sent — tool: ${tool}, target: ${target}${RESET}`,
    );
  } catch (err) {
    logger.error(`[KALI-GATE] Failed to send validation DM: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }

  // Wait for approval
  return new Promise<boolean>((resolve) => {
    const timeoutHandle = setTimeout(() => {
      pendingKaliAudits.delete(auditId);
      logger.warn(`${PURPLE}[KALI-GATE]${RESET} ⏱️ Audit ${auditId} auto-cancelled (timeout)`);
      resolve(false);
    }, KALI_APPROVAL_TIMEOUT_MS);

    pendingKaliAudits.set(auditId, {
      auditId,
      tool,
      target,
      command,
      resolve,
      timeoutHandle,
    });
  });
}

// ─── Approval/Rejection Handlers (called from interactions.ts) ──────────────

export async function handleKaliApprove(auditId: string): Promise<void> {
  const pending = pendingKaliAudits.get(auditId);
  if (!pending) return;

  clearTimeout(pending.timeoutHandle);
  pendingKaliAudits.delete(auditId);
  pending.resolve(true);
}

export async function handleKaliReject(auditId: string): Promise<void> {
  const pending = pendingKaliAudits.get(auditId);
  if (!pending) return;

  clearTimeout(pending.timeoutHandle);
  pendingKaliAudits.delete(auditId);
  pending.resolve(false);
}

// ─── Docker Exec Helper ──────────────────────────────────────────────────────

async function dockerExec(command: string, timeout = 60_000): Promise<string> {
  const fullCommand = `docker exec kali-box ${command}`;
  logger.info(`${PURPLE}${INVERT}[KALI-DOCKER]${RESET} ${PURPLE}${fullCommand}${RESET}`);

  try {
    const { stdout } = await execAsync(fullCommand, { timeout, maxBuffer: 1024 * 1024 });
    return stdout;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error(`${RED}[KALI-DOCKER]${RESET} Command failed: ${errorMsg}`);
    throw new Error(`Kali Docker exec failed: ${errorMsg}`);
  }
}

// ─── Tool Definitions ────────────────────────────────────────────────────────

export const KALI_TOOLS: AgentToolDef[] = [
  {
    type: "function",
    function: {
      name: "runKaliPortAudit",
      description:
        "Audit de ports via nmap dans un conteneur Kali Linux isolé. ⚠️ REQUIERT validation admin avant exécution. Cible doit être dans la whitelist (localhost, 127.0.0.1, 192.168.1.*, ou VPS IP).",
      parameters: {
        type: "object",
        properties: {
          target: {
            type: "string",
            description: "Adresse IP ou hostname à auditer (doit être dans ALLOWED_AUDIT_TARGETS)",
          },
          speed: {
            type: "string",
            enum: ["fast", "intense"],
            description: "Vitesse du scan: 'fast' (-F, top 100 ports) ou 'intense' (-sV -p 1-65535)",
          },
        },
        required: ["target"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "runKaliWebAudit",
      description:
        "Audit web via nikto dans un conteneur Kali Linux isolé. Inspecte les serveurs web locaux ou VPS pour en-têtes obsolètes, config flaws. ⚠️ REQUIERT validation admin.",
      parameters: {
        type: "object",
        properties: {
          targetUrl: {
            type: "string",
            description: "URL à auditer (ex: http://localhost:3000, http://VPS_IP:8080)",
          },
        },
        required: ["targetUrl"],
      },
    },
  },
];

// ─── Tool Implementations ────────────────────────────────────────────────────

export async function executeKaliTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult | null> {
  switch (toolName) {
    case "runKaliPortAudit":
      return await tRunKaliPortAudit(args);
    case "runKaliWebAudit":
      return await tRunKaliWebAudit(args);
    default:
      return null;
  }
}

// ─── Port Audit ──────────────────────────────────────────────────────────────

async function tRunKaliPortAudit(args: Record<string, unknown>): Promise<ToolCallResult> {
  const target = String(args.target || "").trim();
  const speed = String(args.speed || "fast").trim() as "fast" | "intense";

  // ── IMMUTABLE WHITELIST CHECK ──
  if (!isTargetAllowed(target)) {
    logger.error(`${RED}${BOLD}[KALI-GUARD]${RESET} ${RED}SECURITY VIOLATION: Target "${target}" is outside ALLOWED_AUDIT_TARGETS${RESET}`);
    return {
      success: false,
      data: `🚫 SECURITY VIOLATION: Target "${target}" is not in the allowed audit whitelist. Allowed targets: ${ALLOWED_AUDIT_TARGETS.join(", ")}. This incident has been logged.`,
    };
  }

  // Build nmap command
  const nmapFlags = speed === "intense" ? "-sV -p 1-65535 --max-rate 1000" : "-sV -F";
  const command = `nmap ${nmapFlags} ${target}`;

  // ── PRE-SCAN VALIDATION GATE ──
  logger.info(`${PURPLE}[KALI-GATE]${RESET} Requesting admin approval for port audit on ${target}`);
  const approved = await requestKaliAuditApproval("nmap (port audit)", target, command);

  if (!approved) {
    return {
      success: false,
      data: `❌ Audit annulé — non approuvé par l'administrateur ou timeout (5 min).`,
    };
  }

  // ── EXECUTE ──
  try {
    logger.info(`${GREEN}${BOLD}[KALI-EXEC]${RESET} ${GREEN}Launching nmap audit on ${target} (${speed})${RESET}`);
    const output = await dockerExec(command, 120_000);

    // Parse nmap output into structured markdown
    const report = parseNmapOutput(output, target);

    logger.info(`${GREEN}[KALI-EXEC]${RESET} ✅ Port audit completed for ${target}`);

    return {
      success: true,
      data: report,
    };
  } catch (err) {
    return {
      success: false,
      data: `❌ Kali port audit failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Web Audit ───────────────────────────────────────────────────────────────

async function tRunKaliWebAudit(args: Record<string, unknown>): Promise<ToolCallResult> {
  const targetUrl = String(args.targetUrl || "").trim();

  if (!targetUrl || !targetUrl.startsWith("http")) {
    return { success: false, data: "URL invalide — doit commencer par http:// ou https://" };
  }

  // Extract host from URL for whitelist check
  const hostMatch = targetUrl.match(/https?:\/\/([^:/]+)/);
  const host = hostMatch?.[1] ?? "";

  // ── IMMUTABLE WHITELIST CHECK ──
  if (!isTargetAllowed(host)) {
    logger.error(`${RED}${BOLD}[KALI-GUARD]${RESET} ${RED}SECURITY VIOLATION: Web audit target "${host}" is outside ALLOWED_AUDIT_TARGETS${RESET}`);
    return {
      success: false,
      data: `🚫 SECURITY VIOLATION: Host "${host}" is not in the allowed audit whitelist. Allowed targets: ${ALLOWED_AUDIT_TARGETS.join(", ")}.`,
    };
  }

  const command = `nikto -h ${targetUrl} -Format text`;

  // ── PRE-SCAN VALIDATION GATE ──
  logger.info(`${PURPLE}[KALI-GATE]${RESET} Requesting admin approval for web audit on ${targetUrl}`);
  const approved = await requestKaliAuditApproval("nikto (web audit)", targetUrl, command);

  if (!approved) {
    return {
      success: false,
      data: `❌ Web audit annulé — non approuvé par l'administrateur ou timeout (5 min).`,
    };
  }

  // ── EXECUTE ──
  try {
    logger.info(`${GREEN}${BOLD}[KALI-EXEC]${RESET} ${GREEN}Launching nikto web audit on ${targetUrl}${RESET}`);
    const output = await dockerExec(command, 120_000);

    const report = parseNiktoOutput(output, targetUrl);

    logger.info(`${GREEN}[KALI-EXEC]${RESET} ✅ Web audit completed for ${targetUrl}`);

    return {
      success: true,
      data: report,
    };
  } catch (err) {
    return {
      success: false,
      data: `❌ Kali web audit failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Output Parsers ──────────────────────────────────────────────────────────

function parseNmapOutput(output: string, target: string): string {
  const lines = output.split("\n").filter((l) => l.trim());
  const portLines = lines.filter((l) => /PORT\s+STATE\s+SERVICE/i.test(l) || /\d+\/(tcp|udp)\s+open/i.test(l));

  let report = `# 🔍 Nmap Port Audit Report\n\n`;
  report += `**Target:** ${target}\n`;
  report += `**Timestamp:** ${new Date().toISOString()}\n\n`;
  report += `## Open Ports\n\n`;
  report += "| Port | Protocol | State | Service | Version |\n";
  report += "|------|----------|-------|---------|----------|\n";

  for (const line of portLines) {
    if (/^\s*PORT/i.test(line)) continue;
    const match = line.match(/(\d+)\/(tcp|udp)\s+(\w+)\s+(\S+)\s*(.*)/);
    if (match) {
      report += `| ${match[1]} | ${match[2]} | ${match[3]} | ${match[4]} | ${match[5] || "N/A"} |\n`;
    }
  }

  report += `\n## Raw Output\n\`\`\`\n${output.slice(0, 3000)}\n\`\`\`\n`;
  return report;
}

function parseNiktoOutput(output: string, targetUrl: string): string {
  let report = `# 🌐 Nikto Web Audit Report\n\n`;
  report += `**Target:** ${targetUrl}\n`;
  report += `**Timestamp:** ${new Date().toISOString()}\n\n`;

  const findings = output.split("\n").filter((l) => /^\+/.test(l.trim()));
  report += `## Findings (${findings.length})\n\n`;

  for (const finding of findings.slice(0, 50)) {
    report += `- ${finding.trim()}\n`;
  }

  report += `\n## Raw Output\n\`\`\`\n${output.slice(0, 3000)}\n\`\`\`\n`;
  return report;
}

// ─── Container Health Check ──────────────────────────────────────────────────

export async function checkKaliContainer(): Promise<boolean> {
  try {
    const { stdout } = await execAsync("docker inspect --format '{{.State.Running}}' kali-box 2>/dev/null", {
      timeout: 5_000,
    });
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

export async function ensureKaliContainer(): Promise<void> {
  const running = await checkKaliContainer();
  if (!running) {
    logger.info(`${PURPLE}[KALI]${RESET} Starting Kali container...`);
    try {
      await execAsync(
        "docker run -d --name kali-box --rm --network host kalilinux/kali-rolling tail -f /dev/null",
        { timeout: 60_000 },
      );
      // Install tools
      logger.info(`${PURPLE}[KALI]${RESET} Installing nmap and nikto...`);
      await execAsync("docker exec kali-box bash -c 'apt-get update -qq && apt-get install -y -qq nmap nikto 2>/dev/null'", {
        timeout: 120_000,
      });
      logger.info(`${GREEN}[KALI]${RESET} ✅ Kali container ready with nmap + nikto`);
    } catch (err) {
      logger.error(`[KALI] Failed to start container: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    logger.info(`${GREEN}[KALI]${RESET} ✅ Kali container already running`);
  }
}
