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
  userId?: string | null;
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
  userId?: string | null;
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

const TYPE_EMOJI: Record<string, string> = {
  WARN: "⚠️",
  TIMEOUT: "⏳",
  KICK: "👢",
  BAN: "🔨",
  MUTE: "🔇",
  TEMPBAN: "⏲️",
  UNBAN: "♻️",
};

export function emojiCasierType(type: string): string {
  const key = normalizeType(type);
  return TYPE_EMOJI[key] ?? "📋";
}

export function formatCasierTypeCell(type: string): string {
  return `${emojiCasierType(type)} ${labelCasierType(type)}`;
}

export function formatModeratorCell(moderatorId: string | null | undefined): string {
  if (!moderatorId || moderatorId === "UNKNOWN") return "—";
  if (moderatorId === "AI_AGENT") return "John";
  return `<@${moderatorId}>`;
}

export function formatCasierDateCell(date: Date): string {
  if (!Number.isFinite(date.getTime()) || date.getTime() <= 0) return "—";
  return date
    .toLocaleString("fr-FR", {
      timeZone: "Europe/Paris",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
    .replace(",", "");
}

export function escapeMarkdownTableCell(value: string, max = 72): string {
  const compact = value.replace(/\s+/g, " ").replace(/\|/g, "/").trim();
  if (!compact) return "—";
  if (compact.length <= max) return compact;
  return `${compact.slice(0, Math.max(1, max - 1))}…`;
}

export function casierTypeColor(type: string): number {
  const key = normalizeType(type);
  if (key === "BAN" || key === "TEMPBAN") return 0xed4245;
  if (key === "KICK") return 0xe67e22;
  if (key === "TIMEOUT" || key === "MUTE") return 0xfee75c;
  if (key === "WARN") return 0xf0b232;
  if (key === "UNBAN") return 0x3ba55d;
  return 0x5865f2;
}

export function formatCasierDiscordTime(date: Date): string {
  const unix = Math.floor(date.getTime() / 1000);
  if (!Number.isFinite(unix) || unix <= 0) return "—";
  return `<t:${unix}:f>`;
}

export function casierAccentColor(items: CasierItem[]): number {
  const types = new Set(items.map((item) => normalizeType(item.type)));
  if (types.has("BAN") || types.has("TEMPBAN")) return 0xe74c3c;
  if (types.has("KICK")) return 0xe67e22;
  if (types.has("TIMEOUT") || types.has("MUTE")) return 0xf1c40f;
  if (types.has("WARN")) return 0xe67e22;
  return 0x5865f2;
}

export function summarizeCasierTypes(items: CasierItem[]): string {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = normalizeType(item.type);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const order = ["BAN", "TEMPBAN", "KICK", "TIMEOUT", "MUTE", "WARN", "UNBAN"];
  const parts: string[] = [];
  for (const key of order) {
    const n = counts.get(key);
    if (!n) continue;
    parts.push(`${emojiCasierType(key)} ${n}× ${labelCasierType(key)}`);
    counts.delete(key);
  }
  for (const [key, n] of counts) {
    parts.push(`${emojiCasierType(key)} ${n}× ${labelCasierType(key)}`);
  }
  return parts.join(" · ");
}

function casierTableHeaders(withUser: boolean): string[] {
  return withUser
    ? ["Date", "Membre", "Type", "Durée", "Raison", "Par"]
    : ["Date", "Type", "Durée", "Raison", "Par"];
}

function casierItemToCells(item: CasierItem, withUser: boolean): string[] {
  const duration = formatDurationSeconds(item.duration) ?? "—";
  const cells = [
    formatCasierDateCell(item.date),
    formatCasierTypeCell(item.type),
    duration,
    escapeMarkdownTableCell(item.reason || "Aucune raison"),
    formatModeratorCell(item.moderatorId),
  ];
  if (withUser) {
    cells.splice(1, 0, item.userId ? `<@${item.userId}>` : "—");
  }
  return cells;
}

export function renderMarkdownTable(headers: string[], rows: string[][]): string {
  const header = `| ${headers.join(" | ")} |`;
  const divider = `| ${headers.map(() => "---").join(" | ")} |`;
  if (rows.length === 0) return `${header}\n${divider}`;
  const body = rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
  return `${header}\n${divider}\n${body}`;
}

export function paginateMarkdownTable(
  headers: string[],
  rows: string[][],
  maxChars: number,
): string[] {
  const headerBlock = renderMarkdownTable(headers, []);
  if (rows.length === 0) return [headerBlock];

  const pages: string[] = [];
  let batch: string[][] = [];

  const render = (part: string[][]) => renderMarkdownTable(headers, part);

  for (const row of rows) {
    const candidate = render([...batch, row]);
    if (candidate.length > maxChars && batch.length > 0) {
      pages.push(render(batch));
      batch = [row];
    } else {
      batch.push(row);
    }
  }
  if (batch.length > 0) pages.push(render(batch));
  return pages;
}

export function formatCasierTable(items: CasierItem[], withUser: boolean): string {
  return renderMarkdownTable(
    casierTableHeaders(withUser),
    items.map((item) => casierItemToCells(item, withUser)),
  );
}

export function paginateCasierTable(
  items: CasierItem[],
  withUser: boolean,
  maxChars: number,
): string[] {
  return paginateMarkdownTable(
    casierTableHeaders(withUser),
    items.map((item) => casierItemToCells(item, withUser)),
    maxChars,
  );
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
    userId: s.userId ?? null,
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
      userId: log.targetId || log.userId || null,
    });
  }

  items.sort((a, b) => b.date.getTime() - a.date.getTime());
  return items;
}

export function formatCasierEmbedRows(items: CasierItem[], withUser: boolean): string {
  return items
    .slice(0, 15)
    .map((item) => {
      const who = withUser && item.userId ? `<@${item.userId}> · ` : "";
      const dur = formatDurationSeconds(item.duration);
      return (
        `**${formatCasierDateCell(item.date)}** · ${labelCasierType(item.type)}` +
        `${dur ? ` · ${dur}` : ""}\n${who}${item.reason} · ${formatModeratorCell(item.moderatorId)}`
      );
    })
    .join("\n\n");
}

function formatCasierHeader(title: string, count: number, extra?: string): string {
  const countBit = count === 0 ? "aucune entrée" : `${count} entrée${count > 1 ? "s" : ""}`;
  const extraBit = extra ? ` · ${extra}` : "";
  return `**${title}** — ${countBit}${extraBit}`;
}

export function formatCasierForAgent(snapshot: CasierSnapshot): string {
  const watch = snapshot.underWatch ? "oui" : "non";
  const risk = `Risque **${snapshot.riskScore}** (${snapshot.riskLevel}) · Surveillance ${watch}`;
  if (snapshot.items.length === 0) {
    return [
      formatCasierHeader(`Casier judiciaire de <@${snapshot.userId}>`, 0),
      "Casier vierge. Aucune sanction ni log (ban, timeout, kick, mute) trouvé.",
      risk,
    ].join("\n");
  }

  return [
    formatCasierHeader(
      `Casier judiciaire de <@${snapshot.userId}>`,
      snapshot.items.length,
      summarizeCasierTypes(snapshot.items),
    ),
    risk,
    "La fiche Discord a été envoyée dans le salon. Réponds en une courte phrase en français. N'écris PAS de tableau markdown (| col |).",
  ].join("\n");
}

export function formatGuildSanctionLog(items: CasierItem[]): string {
  if (items.length === 0) {
    return "Aucun log de sanction (ban, timeout, kick, mute, warn) trouvé sur ce serveur.";
  }
  return [
    formatCasierHeader("Logs de sanctions du serveur", items.length, summarizeCasierTypes(items)),
    "La fiche Discord a été envoyée dans le salon. Réponds en une courte phrase en français. N'écris PAS de tableau markdown (| col |).",
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
        userId: true,
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

export async function loadGuildSanctionLog(guildId: string, limit = 40): Promise<CasierItem[]> {
  const take = Math.min(100, Math.max(1, limit));
  const [sanctions, logs] = await Promise.all([
    prisma.sanction.findMany({
      where: { guildId },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        type: true,
        reason: true,
        createdAt: true,
        moderatorId: true,
        duration: true,
        userId: true,
      },
    }),
    prisma.log.findMany({
      where: { type: { in: [...CASIER_LOG_TYPES] } },
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
  ]);
  return mergeCasierItems(sanctions, logs).slice(0, take);
}
