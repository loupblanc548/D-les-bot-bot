/**
 * casierQuery.ts — Lecture du casier judiciaire (sanctions Prisma + logs).
 */

import prisma from "../prisma.js";

export const CASIER_LOG_TYPES = [
  "ban",
  "unban",
  "kick",
  "timeout",
  "mute",
  "tempban",
  "warn",
] as const;

const TYPE_LABELS: Record<string, string> = {
  WARN: "Avertissement",
  TIMEOUT: "Timeout",
  KICK: "Expulsion",
  BAN: "Bannissement",
  MUTE: "Mute vocal serveur",
  TEMPBAN: "Bannissement temporaire",
  UNBAN: "Débannissement",
  warn: "Avertissement",
  timeout: "Timeout",
  kick: "Expulsion",
  ban: "Bannissement",
  mute: "Mute vocal serveur",
  tempban: "Bannissement temporaire",
  unban: "Débannissement",
};

export interface CasierItem {
  source: "sanction" | "log";
  type: string;
  reason: string;
  date: Date;
  moderatorId: string | null;
  duration: number | null;
}

export interface CasierSnapshot {
  userId: string;
  guildId: string;
  items: CasierItem[];
  riskScore: number;
  riskLevel: string;
  underWatch: boolean;
}

interface SanctionLike {
  type: string;
  reason?: string | null;
  createdAt: Date;
  moderatorId?: string | null;
  duration?: number | null;
}

interface LogLike {
  type?: string | null;
  action?: string | null;
  details?: string | null;
  createdAt: Date | string;
  moderator?: string | null;
  userId?: string | null;
  targetId?: string | null;
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function normalizeType(type: string): string {
  return type.trim().toUpperCase();
}

export function formatDurationSeconds(seconds?: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86400)} j`;
}

export function labelCasierType(type: string): string {
  return TYPE_LABELS[type] ?? TYPE_LABELS[type.toLowerCase()] ?? type;
}

function typesOverlap(sanctionType: string, logType: string): boolean {
  const a = normalizeType(sanctionType);
  const b = normalizeType(logType);
  if (a === b) return true;
  if (a === "TEMPBAN" && b === "BAN") return true;
  if (a === "TIMEOUT" && (b === "MUTE" || b === "TIMEOUT")) return true;
  return false;
}

export function mergeCasierItems(sanctions: SanctionLike[], logs: LogLike[]): CasierItem[] {
  const items: CasierItem[] = sanctions.map((s) => ({
    source: "sanction" as const,
    type: s.type,
    reason: s.reason?.trim() || "Aucune raison fournie",
    date: s.createdAt,
    moderatorId: s.moderatorId ?? null,
    duration: s.duration ?? null,
  }));

  for (const log of logs) {
    const date = asDate(log.createdAt);
    const logType = log.type || "ban";
    const duplicate = items.some(
      (item) =>
        item.source === "sanction" &&
        typesOverlap(item.type, logType) &&
        Math.abs(item.date.getTime() - date.getTime()) < 60_000,
    );
    if (duplicate) continue;
    items.push({
      source: "log",
      type: logType,
      reason: (log.details || log.action || "Log de modération").trim(),
      date,
      moderatorId: log.moderator ?? null,
      duration: null,
    });
  }

  items.sort((a, b) => b.date.getTime() - a.date.getTime());
  return items;
}

export function formatCasierForAgent(snapshot: CasierSnapshot): string {
  const header = `🗂️ Casier judiciaire de <@${snapshot.userId}>`;
  if (snapshot.items.length === 0) {
    return (
      `${header}\nCasier vierge. Aucune sanction ni log (ban, timeout, kick, mute, exclusion) trouvé.\n` +
      `Risque: ${snapshot.riskScore} (${snapshot.riskLevel}). Surveillance: ${snapshot.underWatch ? "oui" : "non"}.`
    );
  }

  const lines = snapshot.items.map((item, i) => {
    const when = item.date.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
    const dur = formatDurationSeconds(item.duration);
    const durBit = dur ? ` (${dur})` : "";
    const mod = item.moderatorId
      ? item.moderatorId === "AI_AGENT" || item.moderatorId === "UNKNOWN"
        ? item.moderatorId === "AI_AGENT"
          ? "John (agent)"
          : "modo inconnu"
        : `<@${item.moderatorId}>`
      : "modo inconnu";
    return `${i + 1}. ${when} — ${labelCasierType(item.type)}${durBit} — ${item.reason} — par ${mod}`;
  });

  return [
    `${header} — ${snapshot.items.length} entrée(s)`,
    "",
    ...lines,
    "",
    `Risque: ${snapshot.riskScore} (${snapshot.riskLevel}). Surveillance: ${snapshot.underWatch ? "oui" : "non"}.`,
  ].join("\n");
}

export async function loadCasier(
  guildId: string,
  userId: string,
  limit = 50,
): Promise<CasierSnapshot> {
  const take = Math.min(100, Math.max(1, limit));

  const [sanctions, logs, riskProfile] = await Promise.all([
    prisma.sanction.findMany({
      where: { userId, guildId },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        type: true,
        reason: true,
        createdAt: true,
        moderatorId: true,
        duration: true,
      },
    }),
    prisma.log.findMany({
      where: {
        type: { in: [...CASIER_LOG_TYPES] },
        OR: [{ userId }, { targetId: userId }],
      },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        type: true,
        action: true,
        details: true,
        createdAt: true,
        moderator: true,
        userId: true,
        targetId: true,
      },
    }),
    prisma.riskProfile.findUnique({
      where: { userId_guildId: { userId, guildId } },
      select: { riskScore: true, riskLevel: true, underWatch: true },
    }),
  ]);

  return {
    userId,
    guildId,
    items: mergeCasierItems(sanctions, logs).slice(0, take),
    riskScore: riskProfile?.riskScore ?? 0,
    riskLevel: riskProfile?.riskLevel ?? "INCONNU",
    underWatch: riskProfile?.underWatch ?? false,
  };
}
