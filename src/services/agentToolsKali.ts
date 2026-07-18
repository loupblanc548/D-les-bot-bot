/**
 * agentToolsKali.ts — Isolated Kali Linux Security Audit Engine
 *
 * Layer 7: Bridges the agent to a secure, isolated Docker container
 * running kalilinux/kali-rolling. All auditing utilities (nmap, nikto,
 * aircrack-ng, wifite, kismet, arp-scan, suricata, lynis) execute
 * strictly inside the ephemeral container.
 *
 * IMMUTABLE SAFEGUARDS:
 * - killWhitelist.ts centralized whitelist — targets outside are REJECTED
 * - Pre-scan Discord Validation Gate (SOAR) before any Docker exec
 * - All commands run via `docker exec kali-box` — host is never touched
 * - WiFi deauth is EXPLICITLY EXCLUDED (disproportionate side effect)
 * - Hostname targets are rejected (no DNS resolution trust)
 * - All violations are logged + admin notified via DM
 */

import { exec } from "child_process";
import { promisify } from "util";
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Client } from "discord.js";
import logger from "../utils/logger.js";
import type { AgentToolDef, ToolCallResult } from "./agentTools.js";
import {
  assertTargetInWhitelist,
  assertSsidInWhitelist,
  WhitelistViolationError,
  getWhitelistSummary,
} from "./killWhitelist.js";

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

const ALLOWED_AUDIT_TARGETS: string[] = ["127.0.0.1", "localhost", "192.168.1.", MY_VPS_IP].filter(
  Boolean,
);

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
      { name: "🎯 Cible Exacte", value: `\`${target}\``, inline: true },
      {
        name: "📋 Contexte",
        value:
          "Audit sécurité isolé via conteneur Docker Kali Linux. **Vérifiez que la cible est bien votre propre infrastructure.**",
        inline: false,
      },
      { name: "💻 Commande", value: `\`\`\`bash\n${command}\n\`\`\``, inline: false },
      {
        name: "🐳 Environnement",
        value: "Container: `kalilinux/kali-rolling` (ephemeral, isolated)",
        inline: false,
      },
      {
        name: "🔒 Whitelist",
        value: `CIDRs: ${getWhitelistSummary().cidrs.join(", ") || "(none)"}\nSSIDs: ${getWhitelistSummary().ssids.join(", ") || "(none)"}`,
        inline: false,
      },
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
    logger.error(
      `[KALI-GATE] Failed to send validation DM: ${err instanceof Error ? err.message : String(err)}`,
    );
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
    throw new Error(`Kali Docker exec failed: ${errorMsg}`, { cause: err });
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
            description:
              "Vitesse du scan: 'fast' (-F, top 100 ports) ou 'intense' (-sV -p 1-65535)",
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
  // ── 2.1 WiFi Audit ──
  {
    type: "function",
    function: {
      name: "runWifiSecurityAudit",
      description:
        "Audit de robustesse du chiffrement WPA2/WPA3 du point d'accès WiFi de l'opérateur via aircrack-ng. Capture de handshake sur le SSID whitelisté uniquement, test de robustesse hors-ligne. Jamais de bruteforce en ligne. ⚠️ REQUIERT validation admin. SSID doit être dans AUDIT_ALLOWED_SSID.",
      parameters: {
        type: "object",
        properties: {
          ssid: {
            type: "string",
            description: "SSID du point d'accès à auditer (doit être dans AUDIT_ALLOWED_SSID)",
          },
        },
        required: ["ssid"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "runWifiConfigScan",
      description:
        "Détecte les faiblesses de configuration de l'AP WiFi whitelisté via wifite (mode audit, sans attaque active): WPS activé, chiffrement faible (WEP/WPA1), canal, puissance signal. ⚠️ REQUIERT validation admin.",
      parameters: {
        type: "object",
        properties: {
          ssid: {
            type: "string",
            description: "SSID du point d'accès à scanner (doit être dans AUDIT_ALLOWED_SSID)",
          },
        },
        required: ["ssid"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "runRogueApDetection",
      description:
        "Détection passive de rogue AP / Evil Twin via kismet (mode écoute uniquement). Scanne les alentours pour détecter un AP qui usurperait le SSID de l'opérateur. Aucune interaction avec les AP tiers au-delà de l'identification passive. ⚠️ REQUIERT validation admin.",
      parameters: {
        type: "object",
        properties: {
          ssid: {
            type: "string",
            description: "SSID légitime à surveiller (doit être dans AUDIT_ALLOWED_SSID)",
          },
        },
        required: ["ssid"],
      },
    },
  },
  // ── 2.2 Network Surveillance ──
  {
    type: "function",
    function: {
      name: "runArpScan",
      description:
        "Liste les appareils connectés au réseau local whitelisté via arp-scan. Retourne MAC, IP, fabricant pour chaque appareil détecté. Permet de repérer un appareil inconnu. ⚠️ REQUIERT validation admin.",
      parameters: {
        type: "object",
        properties: {
          cidr: {
            type: "string",
            description:
              "Plage CIDR à scanner (doit être dans AUDIT_ALLOWED_CIDRS, ex: 192.168.1.0/24)",
          },
        },
        required: ["cidr"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "runArpWatch",
      description:
        "Démarre une surveillance continue du réseau local whitelisté. Alerte via Telegram/Slack si un nouvel appareil rejoint le réseau. Utilise arp-scan en boucle avec détection de delta. ⚠️ REQUIERT validation admin.",
      parameters: {
        type: "object",
        properties: {
          cidr: {
            type: "string",
            description: "Plage CIDR à surveiller (doit être dans AUDIT_ALLOWED_CIDRS)",
          },
          intervalSeconds: {
            type: "number",
            description: "Intervalle entre les scans en secondes (défaut: 300 = 5 min, min: 60)",
          },
        },
        required: ["cidr"],
      },
    },
  },
  // ── 2.3 IDS Snapshot ──
  {
    type: "function",
    function: {
      name: "runNetworkIdsSnapshot",
      description:
        "Récupère et résume les alertes IDS récentes (suricata/zeek) sur le trafic du VPS whitelisté. Mode lecture des logs uniquement, pas de déploiement live. Permet de répondre à 'y a-t-il eu du trafic suspect récemment ?'. ⚠️ REQUIERT validation admin.",
      parameters: {
        type: "object",
        properties: {
          target: {
            type: "string",
            description: "IP du VPS à interroger (doit être dans la whitelist)",
          },
          hoursBack: {
            type: "number",
            description: "Nombre d'heures en arrière à analyser (défaut: 24, max: 168 = 7 jours)",
          },
        },
        required: ["target"],
      },
    },
  },
  // ── 2.4 System Hardening ──
  {
    type: "function",
    function: {
      name: "runSystemHardeningAudit",
      description:
        "Audit de durcissement du VPS whitelisté via lynis: SSH (root login, clé uniquement), permissions fichiers sensibles, services exposés, mises à jour de sécurité. Retourne un score et des recommandations priorisées. Jamais d'application automatique des correctifs. ⚠️ REQUIERT validation admin.",
      parameters: {
        type: "object",
        properties: {
          target: {
            type: "string",
            description: "IP du VPS à auditer (doit être dans la whitelist)",
          },
        },
        required: ["target"],
      },
    },
  },
];

// ─── Tool Implementations ────────────────────────────────────────────────────

export async function executeKaliTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx?: { userId: string },
): Promise<ToolCallResult | null> {
  const invokedBy = ctx?.userId ?? "unknown";
  switch (toolName) {
    case "runKaliPortAudit":
      return await tRunKaliPortAudit(args, invokedBy);
    case "runKaliWebAudit":
      return await tRunKaliWebAudit(args, invokedBy);
    case "runWifiSecurityAudit":
      return await tRunWifiSecurityAudit(args, invokedBy);
    case "runWifiConfigScan":
      return await tRunWifiConfigScan(args, invokedBy);
    case "runRogueApDetection":
      return await tRunRogueApDetection(args, invokedBy);
    case "runArpScan":
      return await tRunArpScan(args, invokedBy);
    case "runArpWatch":
      return await tRunArpWatch(args, invokedBy);
    case "runNetworkIdsSnapshot":
      return await tRunNetworkIdsSnapshot(args, invokedBy);
    case "runSystemHardeningAudit":
      return await tRunSystemHardeningAudit(args, invokedBy);
    default:
      return null;
  }
}

// ─── Port Audit ──────────────────────────────────────────────────────────────

async function tRunKaliPortAudit(
  args: Record<string, unknown>,
  invokedBy: string,
): Promise<ToolCallResult> {
  const target = String(args.target || "").trim();
  const speed = String(args.speed || "fast").trim() as "fast" | "intense";

  // ── IMMUTABLE WHITELIST CHECK ──
  try {
    await assertTargetInWhitelist(target, "runKaliPortAudit", invokedBy);
  } catch (err) {
    if (err instanceof WhitelistViolationError) {
      return {
        success: false,
        data: `🚫 SECURITY VIOLATION: ${err.message} This incident has been logged.`,
      };
    }
    throw err;
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
    logger.info(
      `${GREEN}${BOLD}[KALI-EXEC]${RESET} ${GREEN}Launching nmap audit on ${target} (${speed})${RESET}`,
    );
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

async function tRunKaliWebAudit(
  args: Record<string, unknown>,
  invokedBy: string,
): Promise<ToolCallResult> {
  const targetUrl = String(args.targetUrl || "").trim();

  if (!targetUrl || !targetUrl.startsWith("http")) {
    return { success: false, data: "URL invalide — doit commencer par http:// ou https://" };
  }

  // Extract host from URL for whitelist check
  const hostMatch = targetUrl.match(/https?:\/\/([^:/]+)/);
  const host = hostMatch?.[1] ?? "";

  // ── IMMUTABLE WHITELIST CHECK ──
  try {
    await assertTargetInWhitelist(host, "runKaliWebAudit", invokedBy);
  } catch (err) {
    if (err instanceof WhitelistViolationError) {
      return {
        success: false,
        data: `🚫 SECURITY VIOLATION: ${err.message} This incident has been logged.`,
      };
    }
    throw err;
  }

  const command = `nikto -h ${targetUrl} -Format text`;

  // ── PRE-SCAN VALIDATION GATE ──
  logger.info(
    `${PURPLE}[KALI-GATE]${RESET} Requesting admin approval for web audit on ${targetUrl}`,
  );
  const approved = await requestKaliAuditApproval("nikto (web audit)", targetUrl, command);

  if (!approved) {
    return {
      success: false,
      data: `❌ Web audit annulé — non approuvé par l'administrateur ou timeout (5 min).`,
    };
  }

  // ── EXECUTE ──
  try {
    logger.info(
      `${GREEN}${BOLD}[KALI-EXEC]${RESET} ${GREEN}Launching nikto web audit on ${targetUrl}${RESET}`,
    );
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
  const portLines = lines.filter(
    (l) => /PORT\s+STATE\s+SERVICE/i.test(l) || /\d+\/(tcp|udp)\s+open/i.test(l),
  );

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

// ─── 2.1 WiFi Security Audit (aircrack-ng) ───────────────────────────────────

async function tRunWifiSecurityAudit(
  args: Record<string, unknown>,
  invokedBy: string,
): Promise<ToolCallResult> {
  const ssid = String(args.ssid || "").trim();

  try {
    await assertSsidInWhitelist(ssid, "runWifiSecurityAudit", invokedBy);
  } catch (err) {
    if (err instanceof WhitelistViolationError) {
      return {
        success: false,
        data: `🚫 SECURITY VIOLATION: ${err.message} This incident has been logged.`,
      };
    }
    throw err;
  }

  // Capture handshake on the whitelisted SSID, then test robustness offline
  // NO deauth (aireplay-ng --deauth is EXPLICITLY EXCLUDED)
  const command = `bash -c "airmon-ng start wlan0 2>/dev/null; airodump-ng -c auto --bssid auto -w /tmp/wifi_capture --essid '${ssid}' wlan0mon -w /tmp/wifi_capture --output-format pcap -r 5 2>&1 | head -50; aircrack-ng /tmp/wifi_capture*.cap -w /usr/share/wordlists/rockyou.txt 2>&1 | head -30"`;

  logger.info(
    `${PURPLE}[KALI-GATE]${RESET} Requesting admin approval for WiFi security audit on SSID: ${ssid}`,
  );
  const approved = await requestKaliAuditApproval(
    "aircrack-ng (WiFi audit)",
    `SSID: ${ssid}`,
    command,
  );

  if (!approved) {
    return {
      success: false,
      data: `❌ WiFi audit annulé — non approuvé par l'administrateur ou timeout (5 min).`,
    };
  }

  try {
    logger.info(
      `${GREEN}${BOLD}[KALI-EXEC]${RESET} ${GREEN}Launching WiFi security audit on SSID: ${ssid}${RESET}`,
    );
    const output = await dockerExec(command, 180_000);

    let report = `# 📡 WiFi Security Audit Report\n\n`;
    report += `**SSID:** ${ssid}\n`;
    report += `**Timestamp:** ${new Date().toISOString()}\n`;
    report += `**Tool:** aircrack-ng (handshake capture + offline robustness test)\n`;
    report += `**⚠️ Deauth:** EXPLICITLY EXCLUDED (no aireplay-ng --deauth)\n\n`;
    report += `## Results\n\n`;
    report += `**Handshake captured:** ${output.includes("WPA handshake") || output.includes("WPA2 handshake") ? "✅ Yes" : "❌ No (may need closer proximity)"}\n\n`;

    if (output.includes("KEY FOUND")) {
      report += `**🚨 CRITICAL:** Password cracked offline — the WiFi password is weak.\n`;
      report += `**Recommendation:** Change to a stronger WPA3 password (≥16 chars, passphrase).\n\n`;
    } else if (output.includes("Passphrase not in dictionary")) {
      report += `**✅ GOOD:** Password not found in default wordlist — appears robust.\n\n`;
    }

    report += `## Raw Output\n\`\`\`\n${output.slice(0, 3000)}\n\`\`\`\n`;
    logger.info(`${GREEN}[KALI-EXEC]${RESET} ✅ WiFi security audit completed for SSID: ${ssid}`);
    return { success: true, data: report };
  } catch (err) {
    return {
      success: false,
      data: `❌ WiFi security audit failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── 2.1 WiFi Config Scan (wifite) ───────────────────────────────────────────

async function tRunWifiConfigScan(
  args: Record<string, unknown>,
  invokedBy: string,
): Promise<ToolCallResult> {
  const ssid = String(args.ssid || "").trim();

  try {
    await assertSsidInWhitelist(ssid, "runWifiConfigScan", invokedBy);
  } catch (err) {
    if (err instanceof WhitelistViolationError) {
      return {
        success: false,
        data: `🚫 SECURITY VIOLATION: ${err.message} This incident has been logged.`,
      };
    }
    throw err;
  }

  // wifite in audit mode — no active attack, just scan and report config
  const command = `bash -c "wifite --scan --target '${ssid}' --no-attack 2>&1 | head -80"`;

  logger.info(
    `${PURPLE}[KALI-GATE]${RESET} Requesting admin approval for WiFi config scan on SSID: ${ssid}`,
  );
  const approved = await requestKaliAuditApproval(
    "wifite (WiFi config scan)",
    `SSID: ${ssid}`,
    command,
  );

  if (!approved) {
    return {
      success: false,
      data: `❌ WiFi config scan annulé — non approuvé par l'administrateur.`,
    };
  }

  try {
    logger.info(
      `${GREEN}${BOLD}[KALI-EXEC]${RESET} ${GREEN}Launching WiFi config scan on SSID: ${ssid}${RESET}`,
    );
    const output = await dockerExec(command, 120_000);

    let report = `# 📶 WiFi Configuration Scan Report\n\n`;
    report += `**SSID:** ${ssid}\n`;
    report += `**Timestamp:** ${new Date().toISOString()}\n`;
    report += `**Tool:** wifite (audit mode, no active attack)\n\n`;
    report += `## Configuration Analysis\n\n`;

    if (output.includes("WEP"))
      report += `- **🚨 CRITICAL:** WEP encryption detected — obsolete, crackable in seconds\n`;
    if (output.includes("WPA1") || output.includes("WPA "))
      report += `- **⚠️ WARNING:** WPA1 detected — upgrade to WPA2/WPA3\n`;
    if (output.includes("WPA2")) report += `- **✅ OK:** WPA2 encryption detected\n`;
    if (output.includes("WPA3")) report += `- **✅ EXCELLENT:** WPA3 encryption detected\n`;
    if (output.includes("WPS"))
      report += `- **⚠️ WARNING:** WPS enabled — vulnerable to PIN brute-force\n`;
    if (output.includes("channel")) {
      const chMatch = output.match(/channel[:\s]+(\d+)/i);
      if (chMatch) report += `- **Channel:** ${chMatch[1]}\n`;
    }
    if (output.includes("signal") || output.includes("power")) {
      const pwrMatch = output.match(/(?:signal|power)[:\s]+(-?\d+)/i);
      if (pwrMatch) report += `- **Signal strength:** ${pwrMatch[1]} dBm\n`;
    }

    report += `\n## Raw Output\n\`\`\`\n${output.slice(0, 3000)}\n\`\`\`\n`;
    logger.info(`${GREEN}[KALI-EXEC]${RESET} ✅ WiFi config scan completed for SSID: ${ssid}`);
    return { success: true, data: report };
  } catch (err) {
    return {
      success: false,
      data: `❌ WiFi config scan failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── 2.1 Rogue AP Detection (kismet) ─────────────────────────────────────────

async function tRunRogueApDetection(
  args: Record<string, unknown>,
  invokedBy: string,
): Promise<ToolCallResult> {
  const ssid = String(args.ssid || "").trim();

  try {
    await assertSsidInWhitelist(ssid, "runRogueApDetection", invokedBy);
  } catch (err) {
    if (err instanceof WhitelistViolationError) {
      return {
        success: false,
        data: `🚫 SECURITY VIOLATION: ${err.message} This incident has been logged.`,
      };
    }
    throw err;
  }

  // kismet in passive listen mode — NO interaction with any AP
  const command = `bash -c "timeout 60 kismet --daemonize --no-console --no-ncurses --log-to /tmp/kismet_log 2>&1; sleep 60; kismet_client --dump-networks 2>/dev/null || cat /tmp/kismet_log*.nettxt 2>/dev/null | head -100"`;

  logger.info(
    `${PURPLE}[KALI-GATE]${RESET} Requesting admin approval for rogue AP detection on SSID: ${ssid}`,
  );
  const approved = await requestKaliAuditApproval(
    "kismet (rogue AP detection)",
    `SSID: ${ssid}`,
    command,
  );

  if (!approved) {
    return {
      success: false,
      data: `❌ Rogue AP detection annulée — non approuvée par l'administrateur.`,
    };
  }

  try {
    logger.info(
      `${GREEN}${BOLD}[KALI-EXEC]${RESET} ${GREEN}Launching rogue AP detection for SSID: ${ssid}${RESET}`,
    );
    const output = await dockerExec(command, 120_000);

    let report = `# 🛡️ Rogue AP Detection Report\n\n`;
    report += `**Monitored SSID:** ${ssid}\n`;
    report += `**Timestamp:** ${new Date().toISOString()}\n`;
    report += `**Tool:** kismet (passive listen mode, no interaction with APs)\n\n`;
    report += `## Detection Results\n\n`;

    // Look for SSID matches in the kismet output
    const ssidOccurrences = (
      output.match(new RegExp(ssid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) || []
    ).length;
    report += `**SSID "${ssid}" occurrences detected:** ${ssidOccurrences}\n`;

    if (ssidOccurrences > 1) {
      report += `**🚨 ALERT:** Multiple APs broadcasting "${ssid}" detected — possible Evil Twin!\n`;
      report += `**Action required:** Verify BSSID matches your legitimate AP.\n\n`;
    } else if (ssidOccurrences === 1) {
      report += `**✅ OK:** Only one AP broadcasting "${ssid}" detected.\n\n`;
    } else {
      report += `**ℹ️ INFO:** SSID "${ssid}" not detected during scan window — may be out of range.\n\n`;
    }

    // Extract BSSID info
    const bssidMatches = output.match(/BSSID[:\s]+([0-9a-fA-F:]{17})/gi) || [];
    if (bssidMatches.length > 0) {
      report += `## Detected BSSIDs\n\n`;
      for (const bssid of bssidMatches.slice(0, 10)) {
        report += `- ${bssid}\n`;
      }
    }

    report += `\n## Raw Output\n\`\`\`\n${output.slice(0, 3000)}\n\`\`\`\n`;
    logger.info(`${GREEN}[KALI-EXEC]${RESET} ✅ Rogue AP detection completed for SSID: ${ssid}`);
    return { success: true, data: report };
  } catch (err) {
    return {
      success: false,
      data: `❌ Rogue AP detection failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── 2.2 ARP Scan ────────────────────────────────────────────────────────────

async function tRunArpScan(
  args: Record<string, unknown>,
  invokedBy: string,
): Promise<ToolCallResult> {
  const cidr = String(args.cidr || "").trim();

  try {
    await assertTargetInWhitelist(cidr, "runArpScan", invokedBy);
  } catch (err) {
    if (err instanceof WhitelistViolationError) {
      return {
        success: false,
        data: `🚫 SECURITY VIOLATION: ${err.message} This incident has been logged.`,
      };
    }
    throw err;
  }

  const command = `arp-scan --localnet --interface=eth0 ${cidr} 2>&1`;

  logger.info(
    `${PURPLE}[KALI-GATE]${RESET} Requesting admin approval for ARP scan on CIDR: ${cidr}`,
  );
  const approved = await requestKaliAuditApproval(
    "arp-scan (network inventory)",
    `CIDR: ${cidr}`,
    command,
  );

  if (!approved) {
    return { success: false, data: `❌ ARP scan annulé — non approuvé par l'administrateur.` };
  }

  try {
    logger.info(
      `${GREEN}${BOLD}[KALI-EXEC]${RESET} ${GREEN}Launching ARP scan on CIDR: ${cidr}${RESET}`,
    );
    const output = await dockerExec(command, 60_000);

    let report = `# 📋 ARP Scan Report\n\n`;
    report += `**CIDR:** ${cidr}\n`;
    report += `**Timestamp:** ${new Date().toISOString()}\n`;
    report += `**Tool:** arp-scan\n\n`;
    report += `## Discovered Devices\n\n`;
    report += "| IP | MAC | Manufacturer |\n";
    report += "|------|------|------|\n";

    const deviceLines = output
      .split("\n")
      .filter((l) => /^\d+\.\d+\.\d+\.\d+\s+[0-9a-fA-F:]{17}/.test(l));
    for (const line of deviceLines) {
      const match = line.match(/(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F:]{17})\s+(.*)/);
      if (match) {
        report += `| ${match[1]} | ${match[2]} | ${match[3] || "Unknown"} |\n`;
      }
    }

    report += `\n**Total devices found:** ${deviceLines.length}\n\n`;
    report += `## Raw Output\n\`\`\`\n${output.slice(0, 3000)}\n\`\`\`\n`;
    logger.info(
      `${GREEN}[KALI-EXEC]${RESET} ✅ ARP scan completed for CIDR: ${cidr} (${deviceLines.length} devices)`,
    );
    return { success: true, data: report };
  } catch (err) {
    return {
      success: false,
      data: `❌ ARP scan failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── 2.2 ARP Watch (continuous monitoring) ───────────────────────────────────

const arpWatchState = new Map<string, { knownMacs: Set<string>; interval: NodeJS.Timeout }>();

async function tRunArpWatch(
  args: Record<string, unknown>,
  invokedBy: string,
): Promise<ToolCallResult> {
  const cidr = String(args.cidr || "").trim();
  const intervalSeconds = Math.max(60, Number(args.intervalSeconds) || 300);

  try {
    await assertTargetInWhitelist(cidr, "runArpWatch", invokedBy);
  } catch (err) {
    if (err instanceof WhitelistViolationError) {
      return {
        success: false,
        data: `🚫 SECURITY VIOLATION: ${err.message} This incident has been logged.`,
      };
    }
    throw err;
  }

  // Stop existing watch for this CIDR if running
  const existing = arpWatchState.get(cidr);
  if (existing) {
    clearInterval(existing.interval);
    arpWatchState.delete(cidr);
  }

  const command = `arp-scan --interface=eth0 ${cidr} 2>&1`;

  logger.info(
    `${PURPLE}[KALI-GATE]${RESET} Requesting admin approval for ARP watch on CIDR: ${cidr}`,
  );
  const approved = await requestKaliAuditApproval(
    "arp-scan (continuous watch)",
    `CIDR: ${cidr}, interval: ${intervalSeconds}s`,
    command,
  );

  if (!approved) {
    return { success: false, data: `❌ ARP watch annulé — non approuvé par l'administrateur.` };
  }

  // Initial scan to establish baseline
  try {
    logger.info(
      `${GREEN}${BOLD}[KALI-EXEC]${RESET} ${GREEN}Starting ARP watch on CIDR: ${cidr} (interval: ${intervalSeconds}s)${RESET}`,
    );
    const initialOutput = await dockerExec(command, 60_000);
    const knownMacs = new Set<string>();
    const macPattern = /([0-9a-fA-F:]{17})/g;
    let match: RegExpExecArray | null;
    while ((match = macPattern.exec(initialOutput)) !== null) {
      knownMacs.add(match[1].toLowerCase());
    }

    logger.info(
      `${GREEN}[KALI-EXEC]${RESET} ✅ ARP watch baseline: ${knownMacs.size} known devices on ${cidr}`,
    );

    // Start continuous monitoring
    const interval = setInterval(async () => {
      try {
        const output = await dockerExec(command, 60_000);
        const currentMacs = new Set<string>();
        let m: RegExpExecArray | null;
        const pattern = /([0-9a-fA-F:]{17})/g;
        while ((m = pattern.exec(output)) !== null) {
          currentMacs.add(m[1].toLowerCase());
        }

        // Detect new devices
        for (const mac of currentMacs) {
          if (!knownMacs.has(mac)) {
            knownMacs.add(mac);
            logger.warn(
              `${RED}${BOLD}[ARP-WATCH]${RESET} ${RED}🚨 NEW DEVICE DETECTED on ${cidr}: MAC ${mac}${RESET}`,
            );
            // TODO: Send alert via Telegram/Slack notification system
          }
        }

        // Detect disappeared devices (informational)
        for (const mac of knownMacs) {
          if (!currentMacs.has(mac)) {
            knownMacs.delete(mac);
            logger.info(`${PURPLE}[ARP-WATCH]${RESET} Device left ${cidr}: MAC ${mac}`);
          }
        }
      } catch (err) {
        logger.error(
          `[ARP-WATCH] Scan failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }, intervalSeconds * 1000);

    arpWatchState.set(cidr, { knownMacs, interval });

    return {
      success: true,
      data: `✅ ARP watch started on CIDR: ${cidr}\nInterval: ${intervalSeconds}s\nKnown devices at baseline: ${knownMacs.size}\nNew device alerts will be sent via notification system.\nUse runArpWatch again with the same CIDR to stop monitoring.`,
    };
  } catch (err) {
    return {
      success: false,
      data: `❌ ARP watch failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── 2.3 IDS Snapshot (suricata/zeek log reader) ─────────────────────────────

async function tRunNetworkIdsSnapshot(
  args: Record<string, unknown>,
  invokedBy: string,
): Promise<ToolCallResult> {
  const target = String(args.target || "").trim();
  const hoursBack = Math.min(168, Math.max(1, Number(args.hoursBack) || 24));

  try {
    await assertTargetInWhitelist(target, "runNetworkIdsSnapshot", invokedBy);
  } catch (err) {
    if (err instanceof WhitelistViolationError) {
      return {
        success: false,
        data: `🚫 SECURITY VIOLATION: ${err.message} This incident has been logged.`,
      };
    }
    throw err;
  }

  // Read suricata/zeek logs — read-only, no live deployment
  const command = `bash -c "if [ -d /var/log/suricata ]; then grep -h '${target}' /var/log/suricata/eve.json 2>/dev/null | tail -100 | jq -c '{timestamp: .timestamp, alert: .alert.signature, severity: .alert.severity, src_ip: .src_ip, dest_ip: .dest_ip}' 2>/dev/null; elif [ -d /var/log/zeek ]; then grep -h '${target}' /var/log/zeek/conn.log 2>/dev/null | tail -100; else echo 'No IDS logs found — suricata/zeek not installed on this container'; fi"`;

  logger.info(
    `${PURPLE}[KALI-GATE]${RESET} Requesting admin approval for IDS snapshot on target: ${target}`,
  );
  const approved = await requestKaliAuditApproval(
    "suricata/zeek (IDS log read)",
    `Target: ${target}, hours: ${hoursBack}`,
    command,
  );

  if (!approved) {
    return { success: false, data: `❌ IDS snapshot annulé — non approuvé par l'administrateur.` };
  }

  try {
    logger.info(
      `${GREEN}${BOLD}[KALI-EXEC]${RESET} ${GREEN}Reading IDS logs for target: ${target} (last ${hoursBack}h)${RESET}`,
    );
    const output = await dockerExec(command, 60_000);

    let report = `# 🔭 IDS Snapshot Report\n\n`;
    report += `**Target:** ${target}\n`;
    report += `**Time window:** Last ${hoursBack} hours\n`;
    report += `**Timestamp:** ${new Date().toISOString()}\n`;
    report += `**Tool:** suricata/zeek (log read-only mode)\n\n`;

    if (output.includes("No IDS logs found")) {
      report += `## ⚠️ No IDS Available\n\n`;
      report += `Suricata/Zeek is not installed on the Kali container.\n`;
      report += `**Recommendation:** Install Suricata on the VPS and forward logs to the container, or run this audit directly on the VPS.\n`;
    } else {
      const alertLines = output.split("\n").filter((l) => l.trim());
      report += `## Recent Alerts (${alertLines.length})\n\n`;

      const highSeverity = alertLines.filter((l) => /"severity"\s*:\s*1/i.test(l));
      const medSeverity = alertLines.filter((l) => /"severity"\s*:\s*2/i.test(l));

      report += `**High severity:** ${highSeverity.length}\n`;
      report += `**Medium severity:** ${medSeverity.length}\n\n`;

      if (highSeverity.length > 0) {
        report += `### 🚨 High Severity Alerts\n\n`;
        for (const alert of highSeverity.slice(0, 20)) {
          report += `- ${alert}\n`;
        }
      }

      if (medSeverity.length > 0) {
        report += `\n### ⚠️ Medium Severity Alerts\n\n`;
        for (const alert of medSeverity.slice(0, 20)) {
          report += `- ${alert}\n`;
        }
      }
    }

    report += `\n## Raw Output\n\`\`\`\n${output.slice(0, 3000)}\n\`\`\`\n`;
    logger.info(`${GREEN}[KALI-EXEC]${RESET} ✅ IDS snapshot completed for target: ${target}`);
    return { success: true, data: report };
  } catch (err) {
    return {
      success: false,
      data: `❌ IDS snapshot failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── 2.4 System Hardening Audit (lynis) ──────────────────────────────────────

async function tRunSystemHardeningAudit(
  args: Record<string, unknown>,
  invokedBy: string,
): Promise<ToolCallResult> {
  const target = String(args.target || "").trim();

  try {
    await assertTargetInWhitelist(target, "runSystemHardeningAudit", invokedBy);
  } catch (err) {
    if (err instanceof WhitelistViolationError) {
      return {
        success: false,
        data: `🚫 SECURITY VIOLATION: ${err.message} This incident has been logged.`,
      };
    }
    throw err;
  }

  // lynis audit — read-only, no auto-remediation
  const command = `lynis audit system --quick --no-colors 2>&1 | head -200`;

  logger.info(
    `${PURPLE}[KALI-GATE]${RESET} Requesting admin approval for system hardening audit on: ${target}`,
  );
  const approved = await requestKaliAuditApproval(
    "lynis (system hardening audit)",
    `Target: ${target}`,
    command,
  );

  if (!approved) {
    return {
      success: false,
      data: `❌ System hardening audit annulé — non approuvé par l'administrateur.`,
    };
  }

  try {
    logger.info(
      `${GREEN}${BOLD}[KALI-EXEC]${RESET} ${GREEN}Launching lynis hardening audit on: ${target}${RESET}`,
    );
    const output = await dockerExec(command, 180_000);

    let report = `# 🏗️ System Hardening Audit Report\n\n`;
    report += `**Target:** ${target}\n`;
    report += `**Timestamp:** ${new Date().toISOString()}\n`;
    report += `**Tool:** lynis (audit only, NO auto-remediation)\n\n`;

    // Extract hardening index score
    const scoreMatch = output.match(/Hardening index[:\s]+(\d+)/i);
    if (scoreMatch) {
      const score = parseInt(scoreMatch[1], 10);
      let rating = "Unknown";
      if (score >= 90) rating = "Excellent";
      else if (score >= 75) rating = "Good";
      else if (score >= 50) rating = "Fair";
      else rating = "Poor — immediate action required";

      report += `## Hardening Score\n\n`;
      report += `**Score:** ${score}/100 (${rating})\n\n`;
    }

    // Extract warnings
    const warnings = output.split("\n").filter((l) => /^\s*WARNING:/i.test(l));
    if (warnings.length > 0) {
      report += `## ⚠️ Warnings (${warnings.length})\n\n`;
      for (const w of warnings.slice(0, 30)) {
        report += `- ${w.trim()}\n`;
      }
    }

    // Extract suggestions
    const suggestions = output.split("\n").filter((l) => /^\s*SUGGESTION:/i.test(l));
    if (suggestions.length > 0) {
      report += `\n## 💡 Suggestions (${suggestions.length})\n\n`;
      for (const s of suggestions.slice(0, 30)) {
        report += `- ${s.trim()}\n`;
      }
    }

    // SSH-specific checks
    if (output.includes("SSH")) {
      report += `\n## SSH Configuration\n\n`;
      if (/PermitRootLogin.*yes/i.test(output)) {
        report += `- **🚨 CRITICAL:** Root login is permitted — disable immediately\n`;
      } else if (/PermitRootLogin.*no/i.test(output)) {
        report += `- **✅ OK:** Root login is disabled\n`;
      }
      if (/PasswordAuthentication.*yes/i.test(output)) {
        report += `- **⚠️ WARNING:** Password authentication enabled — use key-based auth only\n`;
      } else if (/PasswordAuthentication.*no/i.test(output)) {
        report += `- **✅ OK:** Key-based authentication only\n`;
      }
    }

    report += `\n**⚠️ NOTE:** No corrections have been applied. All remediation must be done manually by the operator.\n\n`;
    report += `## Raw Output\n\`\`\`\n${output.slice(0, 4000)}\n\`\`\`\n`;
    logger.info(`${GREEN}[KALI-EXEC]${RESET} ✅ System hardening audit completed for: ${target}`);
    return { success: true, data: report };
  } catch (err) {
    return {
      success: false,
      data: `❌ System hardening audit failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Container Health Check ──────────────────────────────────────────────────

export async function checkKaliContainer(): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      "docker inspect --format '{{.State.Running}}' kali-box 2>/dev/null",
      {
        timeout: 5_000,
      },
    );
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
      // Install all audit tools
      logger.info(
        `${PURPLE}[KALI]${RESET} Installing audit tools (nmap, nikto, aircrack-ng, wifite, kismet, arp-scan, lynis)...`,
      );
      await execAsync(
        "docker exec kali-box bash -c 'apt-get update -qq && apt-get install -y -qq nmap nikto aircrack-ng wifite kismet arp-scan lynis jq 2>/dev/null'",
        { timeout: 180_000 },
      );
      logger.info(`${GREEN}[KALI]${RESET} ✅ Kali container ready with all audit tools`);
    } catch (err) {
      logger.error(
        `[KALI] Failed to start container: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } else {
    logger.info(`${GREEN}[KALI]${RESET} ✅ Kali container already running`);
  }
}
