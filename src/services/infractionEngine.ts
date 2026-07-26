/**
 * infractionEngine.ts — Système d'infractions avec escalation automatique
 *
 * Tracke les warns par utilisateur et applique une escalation:
 * warn → mute → kick → ban selon les seuils configurables.
 */

import type { Guild, GuildMember } from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";

export interface EscalationConfig {
  warnThreshold: number;
  muteThreshold: number;
  kickThreshold: number;
  banThreshold: number;
  muteDurationMs: number;
}

export const DEFAULT_ESCALATION: EscalationConfig = {
  warnThreshold: 1,
  muteThreshold: 3,
  kickThreshold: 5,
  banThreshold: 7,
  muteDurationMs: 300_000,
};

export type InfractionType = "WARN" | "MUTE" | "KICK" | "BAN";

export async function addInfraction(
  guildId: string,
  userId: string,
  moderatorId: string,
  reason: string,
  type: InfractionType = "WARN",
): Promise<{ totalWarns: number; escalatedTo: InfractionType | null }> {
  await prisma.sanction.create({
    data: {
      guildId,
      userId,
      moderatorId,
      type,
      reason,
    },
  });

  const totalWarns = await prisma.sanction.count({
    where: { guildId, userId, type: "WARN" },
  });

  const escalatedTo = await checkEscalation(guildId, userId, totalWarns);
  return { totalWarns, escalatedTo };
}

async function checkEscalation(
  guildId: string,
  userId: string,
  totalWarns: number,
): Promise<InfractionType | null> {
  const config = DEFAULT_ESCALATION;

  if (totalWarns >= config.banThreshold) return "BAN";
  if (totalWarns >= config.kickThreshold) return "KICK";
  if (totalWarns >= config.muteThreshold) return "MUTE";
  return null;
}

export async function executeEscalation(
  guild: Guild,
  userId: string,
  type: InfractionType,
  reason: string,
  config: EscalationConfig = DEFAULT_ESCALATION,
): Promise<boolean> {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return false;

  try {
    switch (type) {
      case "MUTE":
        await member.timeout(config.muteDurationMs, `Escalation auto: ${reason}`);
        logger.info(`[InfractionEngine] ${userId} muted (escalation) in ${guild.id}`);
        break;
      case "KICK":
        await member.kick(`Escalation auto: ${reason}`);
        logger.info(`[InfractionEngine] ${userId} kicked (escalation) in ${guild.id}`);
        break;
      case "BAN":
        await guild.members.ban(userId, { reason: `Escalation auto: ${reason}` });
        logger.info(`[InfractionEngine] ${userId} banned (escalation) in ${guild.id}`);
        break;
      default:
        return false;
    }
    return true;
  } catch (err) {
    logger.warn(
      `[InfractionEngine] Escalation ${type} failed for ${userId}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}

export async function getInfractionHistory(guildId: string, userId: string) {
  return prisma.sanction.findMany({
    where: { guildId, userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

export async function clearInfractions(guildId: string, userId: string): Promise<number> {
  const result = await prisma.sanction.deleteMany({
    where: { guildId, userId },
  });
  return result.count;
}
