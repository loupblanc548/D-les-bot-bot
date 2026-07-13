/**
 * loreAlertDispatcher.ts — MODULE 4: Lore-Infused Alert Dispatcher (Immersion Engine)
 *
 * Intercepts security system logs (riskscore, riskyusers, spam-analysis)
 * and formats them through a Super-Earth high-command / Shadow Broker
 * intelligence network theme.
 *
 * Produces colored Discord embeds with military command log styling.
 */

import { EmbedBuilder, ColorResolvable } from "discord.js";
import logger from "../utils/logger.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ThreatLevel = "GREEN" | "YELLOW" | "ORANGE" | "RED" | "BLACK";

export interface SecurityAlertInput {
  type:
    "riskscore" | "riskyusers" | "spam-analysis" | "circuit-breaker" | "infrastructure" | "custom";
  userId?: string;
  guildId?: string;
  riskIndex?: number;
  spamPercentage?: number;
  title?: string;
  details: string;
  telemetry?: Record<string, string | number>;
}

export interface FormattedAlert {
  embed: EmbedBuilder;
  threatLevel: ThreatLevel;
  summary: string;
}

// ─── Threat Level Configuration ──────────────────────────────────────────────

const THREAT_CONFIG: Record<
  ThreatLevel,
  {
    color: ColorResolvable;
    emoji: string;
    label: string;
    codename: string;
  }
> = {
  GREEN: {
    color: 0x2ecc71,
    emoji: "🟢",
    label: "THREAT LEVEL GREEN — ALL CLEAR",
    codename: "OPERATION NOMINAL",
  },
  YELLOW: {
    color: 0xf1c40f,
    emoji: "🟡",
    label: "THREAT LEVEL YELLOW — ELEVATED",
    codename: "HEIGHTENED VIGILANCE",
  },
  ORANGE: {
    color: 0xe67e22,
    emoji: "🟠",
    label: "THREAT LEVEL ORANGE — HIGH RISK",
    codename: "TACTICAL ALERT",
  },
  RED: {
    color: 0xe74c3c,
    emoji: "🚨",
    label: "THREAT LEVEL RED — MALICIOUS ACTIVITY DETECTED",
    codename: "CRITICAL ENGAGEMENT",
  },
  BLACK: {
    color: 0x2f3136,
    emoji: "⚫",
    label: "THREAT LEVEL BLACK — CATASTROPHIC",
    codename: "OMEGA PROTOCOL",
  },
};

// ─── Threat Assessment ───────────────────────────────────────────────────────

function assessThreatLevel(input: SecurityAlertInput): ThreatLevel {
  if (input.type === "circuit-breaker") return "RED";
  if (input.type === "infrastructure") return "RED";

  const risk = input.riskIndex ?? 0;
  const spam = input.spamPercentage ?? 0;
  const combined = Math.max(risk, spam / 2);

  if (combined >= 80) return "RED";
  if (combined >= 60) return "ORANGE";
  if (combined >= 30) return "YELLOW";
  return "GREEN";
}

// ─── Telemetry Formatter ─────────────────────────────────────────────────────

function formatTelemetry(input: SecurityAlertInput): string {
  const lines: string[] = [];

  if (input.userId) lines.push(`TARGET ID     : ${input.userId}`);
  if (input.guildId) lines.push(`SECTOR ID     : ${input.guildId}`);
  if (input.riskIndex !== undefined) lines.push(`RISK INDEX    : ${input.riskIndex}/100`);
  if (input.spamPercentage !== undefined) lines.push(`SPAM VECTOR   : ${input.spamPercentage}%`);
  if (input.telemetry) {
    for (const [key, value] of Object.entries(input.telemetry)) {
      const paddedKey = key.toUpperCase().padEnd(13, " ");
      lines.push(`${paddedKey}: ${value}`);
    }
  }

  return lines.length > 0 ? "```\n" + lines.join("\n") + "\n```" : "```— NO TELEMETRY —```";
}

// ─── Lore Message Generator ──────────────────────────────────────────────────

function generateLoreMessage(input: SecurityAlertInput, level: ThreatLevel): string {
  const config = THREAT_CONFIG[level];

  const messages: Record<SecurityAlertInput["type"], string> = {
    riskscore: `Super-Earth High Command has flagged a user with an elevated risk profile. Intelligence suggests potential hostile activity. Shadow Broker is monitoring.`,
    riskyusers: `Multiple high-risk individuals detected in sector. Tactical assessment recommends increased surveillance protocols. Liberty above all.`,
    "spam-analysis": `Automated spam vectors detected. Defensive countermeasures engaged. Super-Earth communications infrastructure protected.`,
    "circuit-breaker": `Autonomous agent exceeded safety parameters. Execution pool halted by circuit breaker. Shadow Broker has contained the anomaly.`,
    infrastructure: `Critical infrastructure overload detected. Super-Earth command is initiating emergency protocols. System integrity at risk.`,
    custom: input.details,
  };

  return `${config.emoji} **${config.label}**\n\n${messages[input.type]}`;
}

// ─── Main Formatter ──────────────────────────────────────────────────────────

export function formatSecurityAlert(input: SecurityAlertInput): FormattedAlert {
  const level = assessThreatLevel(input);
  const config = THREAT_CONFIG[level];
  const loreMsg = generateLoreMessage(input, level);
  const telemetry = formatTelemetry(input);

  const embed = new EmbedBuilder()
    .setTitle(`${config.emoji} ${input.title ?? config.label}`)
    .setColor(config.color)
    .setDescription(loreMsg)
    .addFields(
      { name: "TELEMETRY", value: telemetry, inline: false },
      { name: "ASSESSMENT", value: `\`\`\`${input.details}\`\`\``, inline: false },
      { name: "CODENAME", value: `\`${config.codename}\``, inline: true },
      { name: "SECTOR", value: `\`${input.guildId ?? "N/A"}\``, inline: true },
    )
    .setFooter({ text: "Super-Earth High Command - Shadow Broker Intelligence Network" })
    .setTimestamp();

  const summary = `[${level}] ${input.type}: ${input.details.slice(0, 100)}`;
  logger.info(`[LoreAlert] Formatted alert: ${summary}`);

  return { embed, threatLevel: level, summary };
}

// ─── Quick Helpers ───────────────────────────────────────────────────────────

export function createCriticalAlert(
  title: string,
  details: string,
  telemetry?: Record<string, string | number>,
): FormattedAlert {
  return formatSecurityAlert({ type: "custom", title, details, telemetry });
}

export function createRiskScoreAlert(
  userId: string,
  guildId: string,
  riskIndex: number,
  details: string,
): FormattedAlert {
  return formatSecurityAlert({ type: "riskscore", userId, guildId, riskIndex, details });
}

export function createSpamAlert(
  guildId: string,
  spamPercentage: number,
  details: string,
): FormattedAlert {
  return formatSecurityAlert({ type: "spam-analysis", guildId, spamPercentage, details });
}
