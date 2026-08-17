/**
 * auditLog.ts — Audit log enrichi des actions sensibles
 *
 * Logge les actions modératives et administratives dans la DB
 * et envoie une notification via webhook dédié.
 */

import prisma from "../prisma.js";
import logger from "../utils/logger.js";

const AUDIT_WEBHOOK_URL = process.env.AUDIT_WEBHOOK_URL || "";

export interface AuditEntry {
  guildId: string;
  action: string;
  moderatorId: string;
  targetId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export async function logAuditAction(entry: AuditEntry): Promise<void> {
  try {
    // Store in DB
    try {
      await prisma.auditLog.create({
        data: {
          guildId: entry.guildId,
          action: entry.action,
          moderatorId: entry.moderatorId,
          targetId: entry.targetId,
          reason: entry.reason,
          metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
        },
      });
    } catch {
      // Table might not exist yet — graceful fallback to webhook only
    }

    // Send to webhook if configured
    if (AUDIT_WEBHOOK_URL) {
      const embed = {
        title: `🔧 Audit: ${entry.action}`,
        color: 0xffa500,
        fields: [
          { name: "Modérateur", value: `<@${entry.moderatorId}>`, inline: true },
          ...(entry.targetId
            ? [{ name: "Cible", value: `<@${entry.targetId}>`, inline: true }]
            : []),
          ...(entry.reason ? [{ name: "Raison", value: entry.reason, inline: false }] : []),
        ],
        timestamp: new Date().toISOString(),
      };

      await fetch(AUDIT_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [embed] }),
        signal: AbortSignal.timeout(5000),
      }).catch((err) => {
        logger.debug(
          `[AuditLog] Webhook send failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }

    logger.info(
      `[AuditLog] ${entry.action} by ${entry.moderatorId} on ${entry.targetId ?? "N/A"}: ${entry.reason ?? "no reason"}`,
    );
  } catch (err) {
    logger.warn(`[AuditLog] Failed to log: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function getAuditLog(guildId: string, limit = 50) {
  try {
    return await prisma.auditLog.findMany({
      where: { guildId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  } catch {
    return [];
  }
}
