/**
 * casierRecorder.ts — Enregistrement unique des sanctions (casier judiciaire).
 *
 * Sources possibles : commandes slash, tools agent, UI Discord (audit log),
 * événements ban. Un dédoublonnage ~30s évite les triples écritures
 * (commande + audit + guildBanAdd).
 */

import { AuditLogEvent } from "discord.js";
import type { SanctionType } from "@prisma/client";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";
import { createLog } from "./logs.js";
import { recordSanction } from "./risk-engine.js";
import type { SanctionType as RiskSanctionType } from "./risk-engine.js";

export const CASIER_DEDUP_MS = 30_000;

export type CasierSanctionType = Extract<
  SanctionType,
  "WARN" | "TIMEOUT" | "KICK" | "BAN" | "MUTE" | "TEMPBAN" | "UNBAN"
>;

export type CasierSource = "command" | "agent" | "audit" | "event";

export interface RecordCasierInput {
  guildId: string;
  userId: string;
  moderatorId: string;
  type: CasierSanctionType;
  reason: string;
  duration?: number | null;
  source?: CasierSource;
}

export interface RecordCasierResult {
  recorded: boolean;
  duplicate?: boolean;
  id?: number;
}

export interface AuditLogLike {
  action: number;
  guildId: string;
  targetId?: string | null;
  executorId?: string | null;
  reason?: string | null;
  changes?: Array<{ key: string; old?: unknown; new?: unknown }>;
}

const recentWrites = new Map<string, number>();

const LOG_TYPE_BY_SANCTION: Record<CasierSanctionType, string> = {
  WARN: "warn",
  TIMEOUT: "timeout",
  KICK: "kick",
  BAN: "ban",
  MUTE: "mute",
  TEMPBAN: "tempban",
  UNBAN: "unban",
};

/** Types déjà journalisés par guildBanAdd / guildBanRemove — pas de second log. */
const SKIP_LOG_TYPES = new Set<CasierSanctionType>(["BAN", "UNBAN"]);

const RISK_TYPES = new Set<CasierSanctionType>(["WARN", "TIMEOUT", "KICK", "BAN", "TEMPBAN"]);

export function resetCasierDedupForTests(): void {
  recentWrites.clear();
}

function dedupKey(guildId: string, userId: string, type: CasierSanctionType): string {
  return `${guildId}:${userId}:${type}`;
}

function pruneDedup(now: number): void {
  if (recentWrites.size < 200) return;
  for (const [key, ts] of recentWrites) {
    if (now - ts > CASIER_DEDUP_MS) recentWrites.delete(key);
  }
}

function isRecentDuplicate(guildId: string, userId: string, type: CasierSanctionType): boolean {
  const now = Date.now();
  pruneDedup(now);
  const key = dedupKey(guildId, userId, type);
  const last = recentWrites.get(key);
  if (last && now - last < CASIER_DEDUP_MS) return true;
  recentWrites.set(key, now);
  return false;
}

function toRiskType(type: CasierSanctionType): RiskSanctionType | null {
  if (type === "MUTE" || type === "UNBAN") return null;
  if (RISK_TYPES.has(type)) return type as RiskSanctionType;
  return null;
}

/**
 * Mappe une entrée d'audit Discord vers une sanction casier, ou null si hors sujet.
 */
export function mapAuditLogToCasier(entry: AuditLogLike): RecordCasierInput | null {
  const userId = entry.targetId ? String(entry.targetId) : "";
  if (!userId || !entry.guildId) return null;

  const moderatorId = entry.executorId ? String(entry.executorId) : "UNKNOWN";
  const reason = (entry.reason && String(entry.reason).trim()) || "Aucune raison fournie";

  if (entry.action === AuditLogEvent.MemberBanAdd) {
    return { guildId: entry.guildId, userId, moderatorId, type: "BAN", reason, source: "audit" };
  }
  if (entry.action === AuditLogEvent.MemberBanRemove) {
    return { guildId: entry.guildId, userId, moderatorId, type: "UNBAN", reason, source: "audit" };
  }
  if (entry.action === AuditLogEvent.MemberKick) {
    return { guildId: entry.guildId, userId, moderatorId, type: "KICK", reason, source: "audit" };
  }
  if (entry.action !== AuditLogEvent.MemberUpdate) return null;

  const changes = entry.changes ?? [];
  const timeoutChange = changes.find((c) => c.key === "communication_disabled_until");
  if (timeoutChange) {
    const hadTimeout = timeoutChange.old != null && timeoutChange.old !== "";
    const hasTimeout = timeoutChange.new != null && timeoutChange.new !== "";
    if (hasTimeout && !hadTimeout) {
      let duration: number | null = null;
      const until = new Date(String(timeoutChange.new)).getTime();
      if (Number.isFinite(until)) {
        duration = Math.max(0, Math.round((until - Date.now()) / 1000));
      }
      return {
        guildId: entry.guildId,
        userId,
        moderatorId,
        type: "TIMEOUT",
        reason,
        duration,
        source: "audit",
      };
    }
    return null;
  }

  const muteChange = changes.find((c) => c.key === "mute");
  if (muteChange && muteChange.new === true && muteChange.old !== true) {
    return { guildId: entry.guildId, userId, moderatorId, type: "MUTE", reason, source: "audit" };
  }

  return null;
}

export async function recordCasierSanction(input: RecordCasierInput): Promise<RecordCasierResult> {
  const reason = (input.reason && input.reason.trim()) || "Aucune raison fournie";
  const moderatorId = input.moderatorId || "UNKNOWN";

  if (isRecentDuplicate(input.guildId, input.userId, input.type)) {
    return { recorded: false, duplicate: true };
  }

  try {
    const existing = await prisma.sanction.findFirst({
      where: {
        guildId: input.guildId,
        userId: input.userId,
        type: input.type,
        createdAt: { gte: new Date(Date.now() - CASIER_DEDUP_MS) },
      },
      select: { id: true },
    });
    if (existing) {
      return { recorded: false, duplicate: true, id: existing.id };
    }
  } catch (err) {
    logger.warn("[Casier] Dedup DB failed:", err instanceof Error ? err.message : String(err));
  }

  try {
    const created = await prisma.sanction.create({
      data: {
        guildId: input.guildId,
        userId: input.userId,
        moderatorId,
        type: input.type,
        reason: reason.slice(0, 1000),
        duration: input.duration ?? null,
      },
    });

    const riskType = toRiskType(input.type);
    if (riskType) {
      await recordSanction(input.userId, input.guildId, riskType).catch((err) => {
        logger.warn("[Casier] risk-engine:", err instanceof Error ? err.message : String(err));
      });
    }

    if (!SKIP_LOG_TYPES.has(input.type)) {
      createLog({
        type: LOG_TYPE_BY_SANCTION[input.type],
        action: `${input.type} → ${input.userId}`,
        userId: input.userId,
        targetId: input.userId,
        details: reason.slice(0, 1000),
        moderator: moderatorId,
      });
    }

    logger.info(
      `[Casier] ${input.type} user=${input.userId} guild=${input.guildId} by=${moderatorId} src=${input.source ?? "unknown"}`,
    );
    return { recorded: true, id: created.id };
  } catch (err) {
    logger.error("[Casier] Enregistrement impossible:", err);
    throw err;
  }
}
