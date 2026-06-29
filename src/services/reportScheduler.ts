/**
 * reportScheduler.ts — Periodic Security Report Scheduler
 *
 * Génère et envoie automatiquement des rapports de sécurité périodiques :
 *  - Rapport quotidien (résumé des incidents, métriques, anomalies)
 *  - Rapport hebdomadaire (tendances, top menaces, recommandations)
 *  - Rapport mensuel (bilan, évolutions, audit complet)
 *
 * Les rapports sont envoyés via l'alertDispatcher (Discord, email, etc.)
 * et stockés en base pour audit.
 */

import { Client, EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";
import { createLog } from "./logs.js";
import { getGuildSecurityPosture, getEvents, calculateThreatScore } from "./socExtension.js";
import { getAnomalies, generateAnalysisReport } from "./aiLogAnalyzer.js";
import { getUnhealthyScrapers } from "./autoDefense.js";
import { getAllPatches, getPatchesByStatus } from "./aiHotPatcher.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ReportFrequency = "DAILY" | "WEEKLY" | "MONTHLY";

export interface ReportConfig {
  enabled: boolean;
  frequency: ReportFrequency;
  guildId: string;
  channelId: string | null;
  sendAt: string; // HH:MM format
  lastSentAt: Date | null;
}

export interface SecurityReport {
  id: string;
  frequency: ReportFrequency;
  guildId: string;
  period: { from: Date; to: Date };
  summary: string;
  metrics: {
    totalEvents: number;
    criticalEvents: number;
    raidsDetected: number;
    honeypotsTriggered: number;
    usersQuarantined: number;
    anomaliesDetected: number;
    patchesApplied: number;
    scrapersUnhealthy: number;
  };
  topThreats: { type: string; count: number; severity: string }[];
  recommendations: string[];
  generatedAt: Date;
}

// ─── State ───────────────────────────────────────────────────────────────────

const reportConfigs = new Map<string, ReportConfig>();
const reportHistory: SecurityReport[] = [];
const MAX_HISTORY = 100;
let schedulerTimer: ReturnType<typeof setInterval> | null = null;

// ─── Configuration ───────────────────────────────────────────────────────────

export function addReportSchedule(config: Omit<ReportConfig, "lastSentAt">): void {
  const fullConfig: ReportConfig = { ...config, lastSentAt: null };
  reportConfigs.set(`${config.guildId}_${config.frequency}`, fullConfig);
  logger.info(
    `[ReportScheduler] Schedule added: ${config.frequency} for ${config.guildId} at ${config.sendAt}`,
  );
}

export function removeReportSchedule(guildId: string, frequency: ReportFrequency): boolean {
  const key = `${guildId}_${frequency}`;
  const deleted = reportConfigs.delete(key);
  if (deleted) logger.info(`[ReportScheduler] Schedule removed: ${frequency} for ${guildId}`);
  return deleted;
}

export function getReportConfigs(): ReportConfig[] {
  return Array.from(reportConfigs.values());
}

// ─── Génération de rapports ──────────────────────────────────────────────────

/**
 * Génère un rapport de sécurité complet pour une guilde.
 */
export async function generateSecurityReport(
  guildId: string,
  frequency: ReportFrequency,
): Promise<SecurityReport> {
  const now = new Date();
  const periodMs =
    frequency === "DAILY"
      ? 24 * 60 * 60 * 1000
      : frequency === "WEEKLY"
        ? 7 * 24 * 60 * 60 * 1000
        : 30 * 24 * 60 * 60 * 1000;
  const from = new Date(now.getTime() - periodMs);

  // Récupérer les données
  const posture = await getGuildSecurityPosture(guildId);
  const events = getEvents(guildId, 200);
  const anomalies = getAnomalies(20);
  const analysisReport = generateAnalysisReport();
  const unhealthyScrapers = getUnhealthyScrapers();
  const appliedPatches = getPatchesByStatus("APPLIED");

  // Calculer les métriques
  const periodEvents = events.filter((e) => e.timestamp >= from);
  const criticalEvents = periodEvents.filter((e) => e.severity === "CRITICAL");
  const raidsDetected = periodEvents.filter((e) => e.type === "RAID").length;
  const honeypotsTriggered = periodEvents.filter((e) => e.type === "HONEYPOT").length;
  const usersQuarantined = periodEvents.filter((e) => e.type === "QUARANTINE").length;

  // Top menaces par type
  const typeCounts = new Map<string, { count: number; severity: string }>();
  for (const e of periodEvents) {
    const existing = typeCounts.get(e.type);
    if (existing) {
      existing.count++;
    } else {
      typeCounts.set(e.type, { count: 1, severity: e.severity });
    }
  }
  const topThreats = Array.from(typeCounts.entries())
    .map(([type, data]) => ({ type, count: data.count, severity: data.severity }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Recommandations automatiques
  const recommendations = generateRecommendations(
    posture,
    topThreats,
    anomalies,
    unhealthyScrapers,
  );

  const report: SecurityReport = {
    id: `report_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    frequency,
    guildId,
    period: { from, to: now },
    summary: `Rapport ${frequency.toLowerCase()} — ${periodEvents.length} événements, ${criticalEvents.length} critiques, niveau de menace: ${posture.globalThreatLevel}`,
    metrics: {
      totalEvents: periodEvents.length,
      criticalEvents: criticalEvents.length,
      raidsDetected,
      honeypotsTriggered,
      usersQuarantined,
      anomaliesDetected: anomalies.length,
      patchesApplied: appliedPatches.length,
      scrapersUnhealthy: unhealthyScrapers.length,
    },
    topThreats,
    recommendations,
    generatedAt: now,
  };

  // Stocker en historique
  reportHistory.unshift(report);
  if (reportHistory.length > MAX_HISTORY) {
    reportHistory.length = MAX_HISTORY;
  }

  // Logger
  try {
    await createLog({
      type: "SECURITY_REPORT",
      action: `Rapport ${frequency} généré: ${report.summary}`,
      targetId: guildId,
      details: JSON.stringify({ reportId: report.id, metrics: report.metrics }),
    });
  } catch {
    // Non-critique
  }

  logger.info(
    `[ReportScheduler] Rapport ${frequency} généré pour ${guildId}: ${periodEvents.length} événements`,
  );
  return report;
}

function generateRecommendations(
  posture: { globalThreatLevel: string; threatScore: number },
  topThreats: { type: string; count: number }[],
  anomalies: { type: string; severity: string }[],
  unhealthyScrapers: { scraperId: string }[],
): string[] {
  const recs: string[] = [];

  if (posture.globalThreatLevel === "CRITICAL") {
    recs.push("⚠️ Niveau de menace CRITICAL — envisager un lockdown temporaire");
  } else if (posture.globalThreatLevel === "HIGH") {
    recs.push("⚠️ Niveau de menace HIGH — renforcer la surveillance");
  }

  if (topThreats.some((t) => t.type === "RAID" && t.count > 3)) {
    recs.push("🛡️ Raids fréquents détectés — activer le Raid Shield permanent");
  }

  if (topThreats.some((t) => t.type === "HONEYPOT" && t.count > 5)) {
    recs.push("🪤 Honeypots souvent déclenchés — envisager un ban wave");
  }

  if (anomalies.some((a) => a.severity === "CRITICAL")) {
    recs.push("🤖 Anomalies critiques dans les logs — vérifier l'incident resolver");
  }

  if (unhealthyScrapers.length > 0) {
    recs.push(`🔧 ${unhealthyScrapers.length} scraper(s) en panne — redémarrage recommandé`);
  }

  if (recs.length === 0) {
    recs.push("✅ Aucune action requise — système sain");
  }

  return recs;
}

// ─── Envoi de rapports ───────────────────────────────────────────────────────

/**
 * Construit un embed Discord pour un rapport.
 */
export function buildReportEmbed(report: SecurityReport): EmbedBuilder {
  const colorMap = {
    DAILY: 0x3498db,
    WEEKLY: 0x9b59b6,
    MONTHLY: 0xe67e22,
  };

  const embed = new EmbedBuilder()
    .setTitle(`📊 Rapport de Sécurité ${report.frequency}`)
    .setColor(colorMap[report.frequency])
    .setDescription(report.summary)
    .addFields(
      {
        name: "Période",
        value: `<t:${Math.floor(report.period.from.getTime() / 1000)}:d> → <t:${Math.floor(report.period.to.getTime() / 1000)}:d>`,
        inline: false,
      },
      { name: "Événements", value: `${report.metrics.totalEvents}`, inline: true },
      { name: "Critiques", value: `${report.metrics.criticalEvents}`, inline: true },
      { name: "Raids", value: `${report.metrics.raidsDetected}`, inline: true },
      { name: "Honeypots", value: `${report.metrics.honeypotsTriggered}`, inline: true },
      { name: "Quarantaines", value: `${report.metrics.usersQuarantined}`, inline: true },
      { name: "Anomalies", value: `${report.metrics.anomaliesDetected}`, inline: true },
    )
    .setFooter({ text: `Report ID: ${report.id}` })
    .setTimestamp(report.generatedAt);

  if (report.topThreats.length > 0) {
    embed.addFields({
      name: "Top menaces",
      value: report.topThreats
        .slice(0, 5)
        .map((t) => `• **${t.type}**: ${t.count} (${t.severity})`)
        .join("\n"),
      inline: false,
    });
  }

  if (report.recommendations.length > 0) {
    embed.addFields({
      name: "Recommandations",
      value: report.recommendations.map((r) => `• ${r}`).join("\n"),
      inline: false,
    });
  }

  return embed;
}

/**
 * Envoie un rapport vers le channel Discord configuré.
 */
export async function sendReport(client: Client, report: SecurityReport): Promise<void> {
  const config = reportConfigs.get(`${report.guildId}_${report.frequency}`);
  if (!config?.channelId) return;

  try {
    const channel = await client.channels.fetch(config.channelId).catch(() => null);
    if (channel?.isTextBased()) {
      const embed = buildReportEmbed(report);
      await (channel as any).send({ embeds: [embed] });
      logger.info(`[ReportScheduler] Rapport ${report.frequency} envoyé à ${config.channelId}`);
    }
  } catch (error) {
    logger.error(
      `[ReportScheduler] Erreur envoi rapport: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

/**
 * Démarre le scheduler de rapports périodiques.
 * Vérifie toutes les minutes si un rapport doit être envoyé.
 */
export function startReportScheduler(client: Client): void {
  if (schedulerTimer) return;

  schedulerTimer = setInterval(async () => {
    const now = new Date();
    const currentHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    for (const config of reportConfigs.values()) {
      if (!config.enabled) continue;
      if (config.sendAt !== currentHHMM) continue;

      // Vérifier qu'on n'a pas déjà envoyé aujourd'hui
      if (config.lastSentAt) {
        const hoursSinceLast = (now.getTime() - config.lastSentAt.getTime()) / (1000 * 60 * 60);
        if (config.frequency === "DAILY" && hoursSinceLast < 23) continue;
        if (config.frequency === "WEEKLY" && hoursSinceLast < 167) continue;
        if (config.frequency === "MONTHLY" && hoursSinceLast < 720) continue;
      }

      try {
        const report = await generateSecurityReport(config.guildId, config.frequency);
        await sendReport(client, report);
        config.lastSentAt = now;
      } catch (error) {
        logger.error(
          `[ReportScheduler] Erreur génération rapport: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }, 60_000); // Check every minute

  if (schedulerTimer.unref) schedulerTimer.unref();
  logger.info("[ReportScheduler] Scheduler démarré");
}

/**
 * Arrête le scheduler.
 */
export function stopReportScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    logger.info("[ReportScheduler] Scheduler arrêté");
  }
}

// ─── API publique ────────────────────────────────────────────────────────────

export function getReportHistory(limit?: number): SecurityReport[] {
  return limit ? reportHistory.slice(0, limit) : [...reportHistory];
}

export function clearReportHistory(): void {
  reportHistory.length = 0;
}
