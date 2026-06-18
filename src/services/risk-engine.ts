import prisma from "../prisma.js";
import logger from "../utils/logger.js";

// ============================================================
// Types
// ============================================================
import { RiskLevel } from "@prisma/client";
export { RiskLevel };
export type SanctionType = "WARN" | "TIMEOUT" | "KICK" | "TEMPBAN" | "BAN" | "SOFTBAN";
export type EventType = "ANTI_RAID" | "ANTI_SPAM" | "ANTI_PHISHING" | "SUSPICIOUS_ACCOUNT" | "AI_MODERATION";

export interface RiskProfile {
  userId: string;
  guildId: string;
  riskScore: number;
  riskLevel: RiskLevel;
  warnCount: number;
  timeoutCount: number;
  kickCount: number;
  tempbanCount: number;
  banCount: number;
  totalSanctions: number;
  underWatch: boolean;
  lastSanctionAt: Date | null;
  lastAlertAt: Date | null;
}

// ============================================================
// Pondération des sanctions et événements
// ============================================================
const SANCTION_WEIGHTS: Record<SanctionType, number> = {
  WARN: 10,
  TIMEOUT: 15,
  KICK: 25,
  SOFTBAN: 30,
  TEMPBAN: 35,
  BAN: 50,
};

const EVENT_WEIGHTS: Record<EventType, number> = {
  ANTI_RAID: 20,
  ANTI_SPAM: 15,
  ANTI_PHISHING: 30,
  SUSPICIOUS_ACCOUNT: 25,
  AI_MODERATION: 20,
};

// Décroissance temporelle : -5% par jour sans incident
const DECAY_RATE_PER_DAY = 0.05;

// Seuils de risque
const THRESHOLDS: Record<string, number> = {
  MOYEN: 30,
  "ELEVE": 60,
  CRITIQUE: 100,
};

// ============================================================
// Fonctions de calcul
// ============================================================
function getRiskLevel(score: number): RiskLevel {
  if (score >= THRESHOLDS.CRITIQUE) return "CRITIQUE";
  if (score >= THRESHOLDS["ELEVE"]) return "ELEVE";
  if (score >= THRESHOLDS.MOYEN) return "MOYEN";
  return "FAIBLE";
}

export function calculateRiskScore(
  counts: { warn: number; timeout: number; kick: number; tempban: number; ban: number; softban: number },
  events: { antiRaid: number; antiSpam: number; antiPhishing: number; suspicious: number },
  lastSanctionAt: Date | null
): number {
  let score = 0;
  score += counts.warn * SANCTION_WEIGHTS.WARN;
  score += counts.timeout * SANCTION_WEIGHTS.TIMEOUT;
  score += counts.kick * SANCTION_WEIGHTS.KICK;
  score += counts.tempban * SANCTION_WEIGHTS.TEMPBAN;
  score += counts.ban * SANCTION_WEIGHTS.BAN;
  score += counts.softban * SANCTION_WEIGHTS.SOFTBAN;
  score += events.antiRaid * EVENT_WEIGHTS.ANTI_RAID;
  score += events.antiSpam * EVENT_WEIGHTS.ANTI_SPAM;
  score += events.antiPhishing * EVENT_WEIGHTS.ANTI_PHISHING;
  score += events.suspicious * EVENT_WEIGHTS.SUSPICIOUS_ACCOUNT;

  // Bonus récidive : +20% si sanction dans les 7 derniers jours
  if (lastSanctionAt) {
    const daysSinceLast = (Date.now() - lastSanctionAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLast <= 7) {
      score = Math.floor(score * 1.2);
    }
    // Décroissance : -5% par jour au-delà de 7 jours
    if (daysSinceLast > 7) {
      const decayDays = Math.min(daysSinceLast - 7, 60);
      score = Math.floor(score * Math.pow(1 - DECAY_RATE_PER_DAY, decayDays));
    }
  }

  return Math.max(0, score);
}

// ============================================================
// Gestion du profil de risque
// ============================================================
export async function getOrCreateRiskProfile(
  userId: string,
  guildId: string
): Promise<RiskProfile> {
  let profile = await prisma.riskProfile.findUnique({
    where: { userId_guildId: { userId, guildId } },
  });

  if (!profile) {
    profile = await prisma.riskProfile.create({
      data: { userId, guildId },
    });
  }

  return profile as unknown as RiskProfile;
}

// ============================================================
// Enregistrement d'une sanction
// ============================================================
export async function recordSanction(
  userId: string,
  guildId: string,
  type: SanctionType
): Promise<RiskProfile> {
  const now = new Date();

  // Upsert atomique pour éviter les race conditions
  await prisma.riskProfile.upsert({
    where: { userId_guildId: { userId, guildId } },
    create: { userId, guildId, lastSanctionAt: now },
    update: { lastSanctionAt: now },
  });

  // Incrémenter le compteur approprié avec des opérations atomiques
  const increments: Record<string, { increment: number }> = {
    totalSanctions: { increment: 1 },
  };

  if (type === "WARN") increments.warnCount = { increment: 1 };
  else if (type === "TIMEOUT") increments.timeoutCount = { increment: 1 };
  else if (type === "KICK") increments.kickCount = { increment: 1 };
  else if (type === "TEMPBAN") increments.tempbanCount = { increment: 1 };
  else if (type === "BAN" || type === "SOFTBAN") increments.banCount = { increment: 1 };

  // Mettre à jour avec les increments atomiques
  await prisma.riskProfile.update({
    where: { userId_guildId: { userId, guildId } },
    data: increments,
  });

  // Recalculer le score
  const updated = await prisma.riskProfile.findUniqueOrThrow({
    where: { userId_guildId: { userId, guildId } },
  });

  const score = calculateRiskScore(
    {
      warn: updated.warnCount,
      timeout: updated.timeoutCount,
      kick: updated.kickCount,
      tempban: updated.tempbanCount,
      ban: updated.banCount,
      softban: 0,
    },
    { antiRaid: 0, antiSpam: 0, antiPhishing: 0, suspicious: 0 },
    updated.lastSanctionAt
  );

  const riskLevel = getRiskLevel(score);

  await prisma.riskProfile.update({
    where: { userId_guildId: { userId, guildId } },
    data: { riskScore: score, riskLevel },
  });

  logger.info(`[RiskEngine] Score mis \u00E0 jour pour ${userId}: ${score} (${riskLevel})`);

  return { ...updated, riskScore: score, riskLevel } as unknown as RiskProfile;
}

// ============================================================
// Enregistrement d'un événement de sécurité
// ============================================================
export async function recordSecurityEvent(
  userId: string,
  guildId: string,
  eventType: EventType
): Promise<RiskProfile> {
  const profile = await getOrCreateRiskProfile(userId, guildId);
  const eventWeight = EVENT_WEIGHTS[eventType] || 0;
  const currentScore = profile.riskScore + eventWeight;
  const riskLevel = getRiskLevel(currentScore);

  await prisma.riskProfile.update({
    where: { userId_guildId: { userId, guildId } },
    data: { riskScore: currentScore, riskLevel, lastSanctionAt: new Date() },
  });

  logger.info(`[RiskEngine] \u00C9v\u00E9nement ${eventType} pour ${userId}: score=${currentScore}`);

  return { ...profile, riskScore: currentScore, riskLevel } as unknown as RiskProfile;
}

// ============================================================
// Vérification des seuils d'alerte
// ============================================================
export interface ThresholdCheck {
  shouldAlert: boolean;
  profile: RiskProfile;
  reason: string;
}

export async function checkAlertThreshold(
  profile: RiskProfile,
  guildId: string
): Promise<ThresholdCheck> {
  const now = new Date();

  // Ne pas alerter si déjà une alerte dans les 12 dernières heures
  if (profile.lastAlertAt) {
    const hoursSinceLast = (now.getTime() - new Date(profile.lastAlertAt).getTime()) / (1000 * 60 * 60);
    if (hoursSinceLast < 12) {
      return { shouldAlert: false, profile, reason: "D\u00E9lai minimum entre alertes non atteint" };
    }
  }

  // Alerte critique immédiate
  if (profile.riskLevel === "CRITIQUE") {
    return { shouldAlert: true, profile, reason: `Score de risque critique (${profile.riskScore})` };
  }

  // Alerte élevé avec 5+ sanctions
  if (profile.riskLevel === "ELEVE" && profile.totalSanctions >= 5) {
    return { shouldAlert: true, profile, reason: "Score \u00E9lev\u00E9 avec 5+ sanctions cumul\u00E9es" };
  }

  // 3+ sanctions en 24h
  if (profile.lastSanctionAt) {
    const recentSanctions = await prisma.sanction.count({
      where: {
        userId: profile.userId,
        guildId,
        createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      },
    });
    if (recentSanctions >= 3) {
      return { shouldAlert: true, profile, reason: `3+ sanctions en 24 heures (${recentSanctions})` };
    }
  }

  return { shouldAlert: false, profile, reason: "Aucun seuil atteint" };
}

// ============================================================
// Rapport de risque complet
// ============================================================
export async function getRiskReport(userId: string, guildId: string) {
  const profile = await getOrCreateRiskProfile(userId, guildId);

  const recentSanctions = await prisma.sanction.findMany({
    where: { userId, guildId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return { profile, recentSanctions };
}

// ============================================================
// Fonctions administratives
// ============================================================
export async function resetRiskProfile(
  userId: string,
  guildId: string
): Promise<void> {
  await prisma.riskProfile.deleteMany({ where: { userId, guildId } });
  logger.info(`[RiskEngine] Profil de risque r\u00E9initialis\u00E9 pour ${userId}`);
}

export async function getAllRiskyUsers(
  guildId: string,
  minLevel: RiskLevel = "MOYEN"
) {
  const levels: RiskLevel[] = [minLevel];
  if (minLevel === "MOYEN") levels.push("ELEVE", "CRITIQUE");
  else if (minLevel === "ELEVE") levels.push("CRITIQUE");

  return prisma.riskProfile.findMany({
    where: {
      guildId,
      riskLevel: { in: levels },
      riskScore: { gt: 0 },
    },
    orderBy: { riskScore: "desc" },
  });
}
