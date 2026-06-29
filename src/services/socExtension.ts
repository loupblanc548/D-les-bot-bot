/**
 * socExtension.ts — SOC (Security Operations Center) Extension
 *
 * Extension du centre d'opérations de sécurité pour le bot :
 *  - Dashboard unifié de sécurité (métriques temps réel)
 *  - Corrélation d'événements multi-source (raid, spam, phishing, honeypot)
 *  - Score de menace global par guilde
 *  - Escalade automatique (LOW → MEDIUM → HIGH → CRITICAL)
 *  - Timeline d'incidents pour audit post-mortem
 *  - Intégration avec alertcenter, shadowBroker, cyberDefense, risk-engine
 *
 * Intégration Electron : expose les données via l'API dashboard existante
 * pour affichage dans le desktop app.
 */

import { Client, EmbedBuilder } from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";
import { createLog } from "./logs.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ThreatLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface SecurityMetric {
  key: string;
  label: string;
  value: number;
  unit: string;
  trend: "up" | "down" | "stable";
  threatLevel: ThreatLevel;
}

export interface SecurityEvent {
  id: string;
  guildId: string;
  type: string;
  severity: ThreatLevel;
  source: string;
  message: string;
  timestamp: Date;
  relatedUserId?: string;
  metadata: Record<string, unknown>;
}

export interface IncidentTimeline {
  guildId: string;
  events: SecurityEvent[];
  totalThreats: number;
  globalThreatLevel: ThreatLevel;
  generatedAt: Date;
}

export interface GuildSecurityPosture {
  guildId: string;
  globalThreatLevel: ThreatLevel;
  threatScore: number;
  metrics: SecurityMetric[];
  activeIncidents: number;
  resolvedIncidents: number;
  honeypotsTriggered: number;
  raidsDetected: number;
  usersQuarantined: number;
  lastIncidentAt: Date | null;
}

// ─── Event Tracking ──────────────────────────────────────────────────────────

const eventStore = new Map<string, SecurityEvent[]>();
const MAX_EVENTS_PER_GUILD = 500;

/**
 * Enregistre un événement de sécurité dans le SOC.
 */
export function recordSecurityEvent(event: Omit<SecurityEvent, "id" | "timestamp">): SecurityEvent {
  const fullEvent: SecurityEvent = {
    ...event,
    id: `soc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date(),
  };

  const guildEvents = eventStore.get(event.guildId) ?? [];
  guildEvents.unshift(fullEvent);
  if (guildEvents.length > MAX_EVENTS_PER_GUILD) {
    guildEvents.length = MAX_EVENTS_PER_GUILD;
  }
  eventStore.set(event.guildId, guildEvents);

  logger.info(`[SOC] Événement ${event.type} (${event.severity}) enregistré pour ${event.guildId}`);
  return fullEvent;
}

// ─── Calcul du score de menace global ────────────────────────────────────────

const SEVERITY_WEIGHTS: Record<ThreatLevel, number> = {
  LOW: 1,
  MEDIUM: 5,
  HIGH: 15,
  CRITICAL: 50,
};

/**
 * Calcule le score de menace global pour une guilde.
 */
export function calculateThreatScore(guildId: string): { score: number; level: ThreatLevel } {
  const events = eventStore.get(guildId) ?? [];
  const now = Date.now();
  const WINDOW_MS = 60 * 60 * 1000; // 1h

  let score = 0;
  for (const event of events) {
    if (now - event.timestamp.getTime() > WINDOW_MS) continue;
    score += SEVERITY_WEIGHTS[event.severity] ?? 0;
  }

  let level: ThreatLevel = "LOW";
  if (score >= 100) level = "CRITICAL";
  else if (score >= 40) level = "HIGH";
  else if (score >= 10) level = "MEDIUM";

  return { score, level };
}

// ─── Métriques temps réel ────────────────────────────────────────────────────

/**
 * Récupère les métriques de sécurité temps réel pour une guilde.
 */
export async function getSecurityMetrics(guildId: string): Promise<SecurityMetric[]> {
  const events = eventStore.get(guildId) ?? [];
  const now = Date.now();
  const WINDOW_MS = 60 * 60 * 1000;
  const recentEvents = events.filter((e) => now - e.timestamp.getTime() < WINDOW_MS);

  const metrics: SecurityMetric[] = [];

  // Total événements
  metrics.push({
    key: "total_events",
    label: "Événements (1h)",
    value: recentEvents.length,
    unit: "",
    trend: recentEvents.length > 10 ? "up" : "stable",
    threatLevel: recentEvents.length > 20 ? "HIGH" : recentEvents.length > 5 ? "MEDIUM" : "LOW",
  });

  // Événements par type
  const typeCounts = new Map<string, number>();
  for (const e of recentEvents) {
    typeCounts.set(e.type, (typeCounts.get(e.type) ?? 0) + 1);
  }

  for (const [type, count] of typeCounts) {
    metrics.push({
      key: `type_${type}`,
      label: type,
      value: count,
      unit: "",
      trend: count > 3 ? "up" : "stable",
      threatLevel: count > 10 ? "HIGH" : count > 3 ? "MEDIUM" : "LOW",
    });
  }

  // Risk profiles critiques
  try {
    const criticalCount = await prisma.riskProfile.count({
      where: { guildId, riskLevel: "CRITIQUE" },
    });
    metrics.push({
      key: "critical_profiles",
      label: "Profils critiques",
      value: criticalCount,
      unit: "",
      trend: criticalCount > 0 ? "up" : "stable",
      threatLevel: criticalCount > 5 ? "CRITICAL" : criticalCount > 0 ? "HIGH" : "LOW",
    });

    const elevatedCount = await prisma.riskProfile.count({
      where: { guildId, riskLevel: "ELEVE" },
    });
    metrics.push({
      key: "elevated_profiles",
      label: "Profils élevés",
      value: elevatedCount,
      unit: "",
      trend: elevatedCount > 5 ? "up" : "stable",
      threatLevel: elevatedCount > 10 ? "HIGH" : elevatedCount > 0 ? "MEDIUM" : "LOW",
    });
  } catch {
    // Non-critique
  }

  // Alertes en attente
  try {
    const pendingAlerts = await prisma.alert.count({
      where: { guildId, status: "PENDING" },
    });
    metrics.push({
      key: "pending_alerts",
      label: "Alertes en attente",
      value: pendingAlerts,
      unit: "",
      trend: pendingAlerts > 5 ? "up" : "stable",
      threatLevel: pendingAlerts > 10 ? "HIGH" : pendingAlerts > 0 ? "MEDIUM" : "LOW",
    });
  } catch {
    // Non-critique
  }

  return metrics;
}

// ─── Posture de sécurité ─────────────────────────────────────────────────────

/**
 * Génère un rapport complet de posture de sécurité pour une guilde.
 */
export async function getGuildSecurityPosture(guildId: string): Promise<GuildSecurityPosture> {
  const { score, level } = calculateThreatScore(guildId);
  const metrics = await getSecurityMetrics(guildId);

  const events = eventStore.get(guildId) ?? [];
  const activeIncidents = events.filter(
    (e) => e.severity === "HIGH" || e.severity === "CRITICAL",
  ).length;

  let raidsDetected = 0;
  let usersQuarantined = 0;
  let honeypotsTriggered = 0;
  let lastIncidentAt: Date | null = null;

  for (const e of events) {
    if (e.type === "RAID") raidsDetected++;
    if (e.type === "QUARANTINE") usersQuarantined++;
    if (e.type === "HONEYPOT") honeypotsTriggered++;
    if (e.severity === "CRITICAL" && (!lastIncidentAt || e.timestamp > lastIncidentAt)) {
      lastIncidentAt = e.timestamp;
    }
  }

  return {
    guildId,
    globalThreatLevel: level,
    threatScore: score,
    metrics,
    activeIncidents,
    resolvedIncidents: Math.max(0, events.length - activeIncidents),
    honeypotsTriggered,
    raidsDetected,
    usersQuarantined,
    lastIncidentAt,
  };
}

// ─── Timeline d'incidents ────────────────────────────────────────────────────

/**
 * Génère une timeline d'incidents pour audit post-mortem.
 */
export function getIncidentTimeline(guildId: string, limit: number = 50): IncidentTimeline {
  const events = (eventStore.get(guildId) ?? []).slice(0, limit);
  const { score, level } = calculateThreatScore(guildId);

  return {
    guildId,
    events,
    totalThreats: events.length,
    globalThreatLevel: level,
    generatedAt: new Date(),
  };
}

// ─── Escalade automatique ────────────────────────────────────────────────────

/**
 * Vérifie si une escalade est nécessaire et la déclenche.
 */
export async function checkEscalation(
  client: Client,
  guildId: string,
): Promise<ThreatLevel | null> {
  const { score, level } = calculateThreatScore(guildId);

  if (level === "CRITICAL" && score >= 150) {
    logger.warn(`[SOC] Escalade CRITICAL pour ${guildId} (score=${score})`);
    recordSecurityEvent({
      guildId,
      type: "ESCALATION",
      severity: "CRITICAL",
      source: "SOC",
      message: `Escalade automatique — score de menace ${score}`,
      metadata: { score, previousLevel: level },
    });

    try {
      await createLog({
        type: "SOC_ESCALATION",
        action: `Escalade CRITICAL déclenchée (score=${score})`,
        targetId: guildId,
        details: JSON.stringify({ score, level }),
      });
    } catch {
      // Non-critique
    }

    return "CRITICAL";
  }

  return null;
}

// ─── API publique ────────────────────────────────────────────────────────────

export function getEvents(guildId: string, limit?: number): SecurityEvent[] {
  const events = eventStore.get(guildId) ?? [];
  return limit ? events.slice(0, limit) : [...events];
}

export function clearEvents(guildId?: string): void {
  if (guildId) {
    eventStore.delete(guildId);
  } else {
    eventStore.clear();
  }
}

export function buildSOCEmbed(posture: GuildSecurityPosture): EmbedBuilder {
  const colorMap: Record<ThreatLevel, number> = {
    LOW: 0x53fc18,
    MEDIUM: 0xffaa00,
    HIGH: 0xff6600,
    CRITICAL: 0xff3344,
  };

  const embed = new EmbedBuilder()
    .setTitle("🛡️ Security Operations Center")
    .setColor(colorMap[posture.globalThreatLevel])
    .setDescription(`Posture de sécurité pour \`${posture.guildId}\``)
    .addFields(
      {
        name: "Niveau de menace",
        value: `**${posture.globalThreatLevel}** (score: ${posture.threatScore})`,
        inline: true,
      },
      { name: "Incidents actifs", value: `${posture.activeIncidents}`, inline: true },
      { name: "Incidents résolus", value: `${posture.resolvedIncidents}`, inline: true },
      { name: "Raids détectés", value: `${posture.raidsDetected}`, inline: true },
      { name: "Honeypots déclenchés", value: `${posture.honeypotsTriggered}`, inline: true },
      { name: "Utilisateurs quarantinés", value: `${posture.usersQuarantined}`, inline: true },
    )
    .setFooter({ text: `SOC Extension • ${posture.metrics.length} métriques` })
    .setTimestamp();

  if (posture.lastIncidentAt) {
    embed.addFields({
      name: "Dernier incident",
      value: `<t:${Math.floor(posture.lastIncidentAt.getTime() / 1000)}:R>`,
      inline: true,
    });
  }

  return embed;
}
