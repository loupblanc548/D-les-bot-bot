/**
 * agentSoarGate.ts — Directive 2: SOAR Validation Gate for restricted agent tools
 *
 * When the AI agent invokes a restricted tool (ssh_command, db_query,
 * docker_manage, git_operations, file_read, cron_create, system_stats,
 * http_request) even in a DM context, the execution is FROZEN and an
 * interactive approval embed is sent to the admin's private DM.
 *
 * Execution only proceeds after explicit administrator sign-off via
 * cryptographic button callbacks.
 */

import {
  Client,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Message,
} from "discord.js";
import logger from "../utils/logger.js";
import { RESTRICTED_TOOLS } from "./agentToolRouter.js";
import { requiresApproval, getRiskLevel } from "./toolRiskRegistry.js";

const CYAN = "\x1b[36m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

const ADMIN_DISCORD_ID = process.env.ADMIN_DISCORD_ID || "";
const APPROVAL_TIMEOUT_MS = 120_000; // 2 minutes

let discordClient: Client | null = null;

export function setSoarGateClient(client: Client): void {
  discordClient = client;
}

interface PendingToolApproval {
  toolName: string;
  args: Record<string, unknown>;
  resolve: (approved: boolean) => void;
  dmMessage: Message | null;
  timeoutHandle: NodeJS.Timeout;
  createdAt: number;
}

const pendingToolApprovals = new Map<string, PendingToolApproval>();

function generateApprovalId(): string {
  return `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Check if a tool requires SOAR validation gate.
 * A tool requires approval if:
 *  1. It's in the RESTRICTED_TOOLS set (context guard), OR
 *  2. It's classified as medium/high risk in the centralized toolRiskRegistry
 *
 * Low-risk tools are NEVER gated — they execute autonomously.
 */
export function isRestrictedTool(toolName: string): boolean {
  if (RESTRICTED_TOOLS.has(toolName)) return true;
  if (requiresApproval(toolName)) return true;
  return false;
}

/**
 * Send an approval embed to the admin's DM and wait for sign-off.
 * Returns true if approved, false if rejected or timeout.
 */
export async function requestToolApproval(
  toolName: string,
  args: Record<string, unknown>,
  invokedBy: string,
): Promise<boolean> {
  if (!discordClient || !ADMIN_DISCORD_ID) {
    logger.warn(
      `${CYAN}${BOLD}[SOAR-GATE]${RESET} ${YELLOW}No admin/client — blocking restricted tool ${toolName}${RESET}`,
    );
    return false;
  }

  const approvalId = generateApprovalId();

  logger.warn(
    `${CYAN}${BOLD}[SOAR-GATE]${RESET} ${RED}Restricted tool ${toolName} invoked by ${invokedBy} — freezing execution, sending approval DM${RESET}`,
  );

  const argsSummary = JSON.stringify(args, null, 2).slice(0, 1024);
  const riskLevel = getRiskLevel(toolName) ?? "unclassified";

  const embed = new EmbedBuilder()
    .setTitle("🔒 [SOAR GATE — VALIDATION REQUISE]")
    .setColor(0xff6600)
    .setDescription(`L'agent IA tente d'exécuter un outil restreint.`)
    .addFields(
      { name: "🛠️ Outil", value: `\`${toolName}\``, inline: true },
      { name: "👤 Demandé par", value: `<@${invokedBy}>`, inline: true },
      { name: "⚠️ Niveau de risque", value: `\`${riskLevel}\``, inline: true },
      { name: "⏱️ Timeout", value: "2 minutes", inline: true },
      { name: "📋 Arguments", value: `\`\`\`json\n${argsSummary}\n\`\`\``, inline: false },
    )
    .setTimestamp()
    .setFooter({ text: "Directive 2 — SOAR Validation Gate" });

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`soar_tool_approve_${approvalId}`)
      .setLabel("✅ AUTORISER")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`soar_tool_reject_${approvalId}`)
      .setLabel("❌ REJETER")
      .setStyle(ButtonStyle.Danger),
  );

  let dmMessage: Message | null = null;
  try {
    const adminUser = await discordClient.users.fetch(ADMIN_DISCORD_ID);
    dmMessage = await adminUser.send({ embeds: [embed], components: [buttons] });
  } catch (err) {
    logger.error(
      `${CYAN}${BOLD}[SOAR-GATE]${RESET} ${RED}Failed to send approval DM: ${err instanceof Error ? err.message : String(err)}${RESET}`,
    );
    return false;
  }

  return new Promise<boolean>((resolve) => {
    const timeoutHandle = setTimeout(() => {
      pendingToolApprovals.delete(approvalId);
      logger.warn(
        `${CYAN}[SOAR-GATE]${RESET} ${YELLOW}Approval timeout for ${toolName} — auto-rejected${RESET}`,
      );
      resolve(false);
    }, APPROVAL_TIMEOUT_MS);

    pendingToolApprovals.set(approvalId, {
      toolName,
      args,
      resolve,
      dmMessage,
      timeoutHandle,
      createdAt: Date.now(),
    });
  });
}

/**
 * Handle SOAR tool approval button interaction.
 * Called from the interaction handler.
 */
export async function handleSoarToolInteraction(
  interactionId: string,
  approved: boolean,
): Promise<boolean> {
  // Extract approval ID from customId: soar_tool_approve_xxx or soar_tool_reject_xxx
  const match = interactionId.match(/^soar_tool_(approve|reject)_(.+)$/);
  if (!match) return false;

  const action = match[1];
  const approvalId = match[2];
  const isApproved = action === "approve";

  const pending = pendingToolApprovals.get(approvalId);
  if (!pending) {
    logger.warn(
      `${CYAN}[SOAR-GATE]${RESET} ${YELLOW}No pending approval for ${approvalId} — already resolved or expired${RESET}`,
    );
    return false;
  }

  clearTimeout(pending.timeoutHandle);
  pendingToolApprovals.delete(approvalId);

  if (isApproved) {
    logger.info(
      `${CYAN}${BOLD}[SOAR-GATE]${RESET} ${GREEN}Admin APPROVED tool ${pending.toolName}${RESET}`,
    );
  } else {
    logger.warn(
      `${CYAN}${BOLD}[SOAR-GATE]${RESET} ${RED}Admin REJECTED tool ${pending.toolName}${RESET}`,
    );
  }

  // Update the DM embed
  if (pending.dmMessage) {
    try {
      const updatedEmbed = EmbedBuilder.from(pending.dmMessage.embeds[0])
        .setColor(isApproved ? 0x00ff00 : 0xff0000)
        .setTitle(isApproved ? "✅ [SOAR GATE — AUTORISÉ]" : "❌ [SOAR GATE — REJETÉ]");
      await pending.dmMessage.edit({ embeds: [updatedEmbed], components: [] });
    } catch {
      // non-fatal
    }
  }

  pending.resolve(isApproved);
  return true;
}

/**
 * Get count of pending tool approvals.
 */
export function getPendingApprovalCount(): number {
  return pendingToolApprovals.size;
}
