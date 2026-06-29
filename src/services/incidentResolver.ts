/**
 * incidentResolver.ts — Résolution d'Incidents assistée par IA
 *
 * En cas d'erreur critique de log système ou de scraper, l'IA analyse
 * l'erreur, propose un correctif ou une commande de rollback, et soumet
 * la validation à l'administrateur via le composant Discord confirm.ts.
 *
 * Flow :
 *  1. analyzeError(errorLog) — catégorise l'erreur et propose une action
 *  2. proposeFix(analysis) — génère une description du correctif
 *  3. submitForValidation(proposal, interaction) — utilise requestConfirmation()
 */

import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";
import { requestConfirmation } from "../utils/confirm.js";
import { createLog } from "./logs.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ErrorCategory =
  | "SCRAPER_TIMEOUT"
  | "SCRAPER_RATE_LIMIT"
  | "SCRAPER_PARSE_ERROR"
  | "DATABASE_CONNECTION"
  | "DISCORD_API_ERROR"
  | "MEMORY_LEAK"
  | "MODULE_CRASH"
  | "UNKNOWN";

export type FixAction =
  | "RESTART_SCRAPER"
  | "RELOAD_MODULE"
  | "CLEAR_CACHE"
  | "ROLLBACK_CONFIG"
  | "RESTART_BOT"
  | "ESCALATE_MANUAL"
  | "NO_ACTION";

export interface ErrorAnalysis {
  category: ErrorCategory;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  source: string;
  message: string;
  stack?: string;
  detectedAt: Date;
  occurrences: number;
}

export interface FixProposal {
  analysis: ErrorAnalysis;
  action: FixAction;
  description: string;
  command: string | null;
  riskLevel: "SAFE" | "MODERATE" | "RISKY";
  autoExecutable: boolean;
}

export interface ResolutionResult {
  proposal: FixProposal;
  approved: boolean;
  executedAt: Date | null;
  result: string | null;
}

// ─── Analyse d'erreur ────────────────────────────────────────────────────────

const ERROR_PATTERNS: {
  pattern: RegExp;
  category: ErrorCategory;
  severity: ErrorAnalysis["severity"];
}[] = [
  { pattern: /timeout|ETIMEDOUT|timed?\s*out/i, category: "SCRAPER_TIMEOUT", severity: "MEDIUM" },
  {
    pattern: /rate.?limit|429|too\s*many\s*requests/i,
    category: "SCRAPER_RATE_LIMIT",
    severity: "MEDIUM",
  },
  {
    pattern: /parse|json|syntax|unexpected\s*token/i,
    category: "SCRAPER_PARSE_ERROR",
    severity: "LOW",
  },
  {
    pattern: /prisma|database|connection|ECONNREFUSED|postgres/i,
    category: "DATABASE_CONNECTION",
    severity: "HIGH",
  },
  {
    pattern: /discord.*api|403|401|invalid\s*token/i,
    category: "DISCORD_API_ERROR",
    severity: "HIGH",
  },
  { pattern: /heap|memory|oom|out\s*of\s*memory/i, category: "MEMORY_LEAK", severity: "CRITICAL" },
  {
    pattern: /cannot\s*find\s*module|import\s*error|module\s*crash/i,
    category: "MODULE_CRASH",
    severity: "HIGH",
  },
];

const errorOccurrenceMap = new Map<string, number>();

export function analyzeError(errorLog: string, source: string): ErrorAnalysis {
  const now = new Date();
  let category: ErrorCategory = "UNKNOWN";
  let severity: ErrorAnalysis["severity"] = "MEDIUM";

  for (const { pattern, category: cat, severity: sev } of ERROR_PATTERNS) {
    if (pattern.test(errorLog)) {
      category = cat;
      severity = sev;
      break;
    }
  }

  // Tracker les occurrences pour détecter les erreurs répétées
  const occKey = `${source}:${category}`;
  const occurrences = (errorOccurrenceMap.get(occKey) ?? 0) + 1;
  errorOccurrenceMap.set(occKey, occurrences);

  // Escalader la sévérité si répétition
  if (occurrences >= 5 && severity === "MEDIUM") severity = "HIGH";
  if (occurrences >= 10 && severity === "HIGH") severity = "CRITICAL";

  return {
    category,
    severity,
    source,
    message: errorLog.slice(0, 500),
    detectedAt: now,
    occurrences,
  };
}

// ─── Proposition de correctif ────────────────────────────────────────────────

export function proposeFix(analysis: ErrorAnalysis): FixProposal {
  const fixes: Record<ErrorCategory, FixProposal> = {
    SCRAPER_TIMEOUT: {
      analysis,
      action: "RESTART_SCRAPER",
      description: "Le scraper a timeout. Redémarrage du scraper recommandé.",
      command: "hotreload reload",
      riskLevel: "SAFE",
      autoExecutable: true,
    },
    SCRAPER_RATE_LIMIT: {
      analysis,
      action: "CLEAR_CACHE",
      description: "Rate limit atteint. Vider le cache OSINT et attendre avant retry.",
      command: null,
      riskLevel: "SAFE",
      autoExecutable: true,
    },
    SCRAPER_PARSE_ERROR: {
      analysis,
      action: "NO_ACTION",
      description: "Erreur de parsing non critique. Le scraper continuera au prochain cycle.",
      command: null,
      riskLevel: "SAFE",
      autoExecutable: true,
    },
    DATABASE_CONNECTION: {
      analysis,
      action: "RESTART_BOT",
      description: "Connexion DB perdue. Redémarrage du bot recommandé pour rétablir la connexion.",
      command: "restart",
      riskLevel: "RISKY",
      autoExecutable: false,
    },
    DISCORD_API_ERROR: {
      analysis,
      action: "RELOAD_MODULE",
      description: "Erreur API Discord. Rechargement du module concerné recommandé.",
      command: "hotreload reload",
      riskLevel: "MODERATE",
      autoExecutable: true,
    },
    MEMORY_LEAK: {
      analysis,
      action: "RESTART_BOT",
      description: "Fuite mémoire détectée. Redémarrage immédiat du bot requis.",
      command: "restart",
      riskLevel: "RISKY",
      autoExecutable: false,
    },
    MODULE_CRASH: {
      analysis,
      action: "RELOAD_MODULE",
      description: "Module crashé. Rechargement du module via hotreload recommandé.",
      command: "hotreload reload",
      riskLevel: "MODERATE",
      autoExecutable: true,
    },
    UNKNOWN: {
      analysis,
      action: "ESCALATE_MANUAL",
      description: "Erreur non catégorisée. Escalade vers intervention manuelle requise.",
      command: null,
      riskLevel: "SAFE",
      autoExecutable: false,
    },
  };

  return fixes[analysis.category];
}

// ─── Validation via confirm.ts ───────────────────────────────────────────────

export async function submitForValidation(
  proposal: FixProposal,
  interaction: ChatInputCommandInteraction,
): Promise<ResolutionResult> {
  const embed = buildFixProposalEmbed(proposal);

  const approved = await requestConfirmation(
    interaction,
    `🔧 **Correctif proposé par l'IA**\n\n` +
      `**Catégorie:** ${proposal.analysis.category}\n` +
      `**Sévérité:** ${proposal.analysis.severity}\n` +
      `**Action:** ${proposal.action}\n` +
      `**Risque:** ${proposal.riskLevel}\n\n` +
      `**Description:** ${proposal.description}\n` +
      (proposal.command ? `**Commande:** \`${proposal.command}\`` : ""),
  );

  const result: ResolutionResult = {
    proposal,
    approved,
    executedAt: approved ? new Date() : null,
    result: approved
      ? "Correctif approuvé — exécution en cours"
      : "Correctif rejeté par l'administrateur",
  };

  // Logger la décision
  try {
    await createLog({
      type: "INCIDENT_RESOLUTION",
      action: `Correctif ${approved ? "approuvé" : "rejeté"}: ${proposal.action}`,
      userId: interaction.user.id,
      details: JSON.stringify({
        category: proposal.analysis.category,
        severity: proposal.analysis.severity,
        action: proposal.action,
        source: proposal.analysis.source,
      }),
    });
  } catch {
    // Non-critique
  }

  logger.info(
    `[IncidentResolver] Correctif ${approved ? "approuvé" : "rejeté"} — ${proposal.action} pour ${proposal.analysis.category}`,
  );

  return result;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildFixProposalEmbed(proposal: FixProposal): EmbedBuilder {
  const colorMap: Record<string, number> = {
    LOW: 0x53fc18,
    MEDIUM: 0xffaa00,
    HIGH: 0xff6600,
    CRITICAL: 0xff3344,
  };

  const embed = new EmbedBuilder()
    .setTitle("🔧 Correctif Proposé par l'IA")
    .setColor(colorMap[proposal.analysis.severity] ?? 0x808080)
    .addFields(
      { name: "Catégorie", value: proposal.analysis.category, inline: true },
      { name: "Sévérité", value: proposal.analysis.severity, inline: true },
      { name: "Occurrences", value: `${proposal.analysis.occurrences}`, inline: true },
      { name: "Action", value: proposal.action, inline: true },
      { name: "Risque", value: proposal.riskLevel, inline: true },
      { name: "Auto-exécutable", value: proposal.autoExecutable ? "Oui" : "Non", inline: true },
      { name: "Description", value: proposal.description, inline: false },
    )
    .setFooter({ text: `Source: ${proposal.analysis.source}` })
    .setTimestamp();

  if (proposal.command) {
    embed.addFields({ name: "Commande", value: `\`${proposal.command}\``, inline: false });
  }

  return embed;
}

// ─── API publique pour tests ─────────────────────────────────────────────────

export function resetOccurrenceTracking(): void {
  errorOccurrenceMap.clear();
}

export function getOccurrences(source: string, category: ErrorCategory): number {
  return errorOccurrenceMap.get(`${source}:${category}`) ?? 0;
}
