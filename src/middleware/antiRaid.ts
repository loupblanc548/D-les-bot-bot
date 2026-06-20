import logger from "../utils/logger.js";
import { GuildMember, Guild, MessageFlags } from "discord.js";
import prisma from "../prisma.js";

const RAID_THRESHOLD = 10;
const RAID_WINDOW = 60 * 1000;

interface RaidDetection {
  guildId: string;
  joins: number;
  firstJoin: number;
}

const raidDetections = new Map<string, RaidDetection>();

export async function detectRaid(member: GuildMember): Promise<boolean> {
  const guildId = member.guild.id;
  const now = Date.now();

  let detection = raidDetections.get(guildId);

  if (!detection) {
    detection = { guildId, joins: 0, firstJoin: now };
    raidDetections.set(guildId, detection);
  }

  if (now - detection.firstJoin > RAID_WINDOW) {
    detection.joins = 0;
    detection.firstJoin = now;
  }

  detection.joins++;

  if (detection.joins >= RAID_THRESHOLD) {
    logger.warn(`[AntiRaid] Raid detected in guild ${guildId}: ${detection.joins} joins in ${RAID_WINDOW}ms`);
    await triggerRaidProtection(member.guild);
    return true;
  }

  return false;
}

async function triggerRaidProtection(guild: Guild): Promise<void> {
  try {
    await prisma.raidLog.create({
      data: {
        guildId: guild.id,
        detectedAt: new Date(),
        status: "active",
      },
    });

    logger.info(`[AntiRaid] Protection triggered for guild ${guild.id}`);
  } catch (error) {
    logger.error("[AntiRaid] Error triggering protection:", error);
  }
}

export async function isUserSuspicious(member: GuildMember): Promise<boolean> {
  const accountAge = Date.now() - member.user.createdAt.getTime();
  const daysSinceCreation = accountAge / (1000 * 60 * 60 * 24);

  if (daysSinceCreation < 1) {
    logger.warn(`[AntiRaid] Suspicious user: ${member.id} (account age: ${daysSinceCreation.toFixed(2)} days)`);
    return true;
  }

  const existingLogs = await prisma.raidLog.findMany({
    where: { guildId: member.guild.id },
    orderBy: { detectedAt: "desc" },
    take: 1,
  });

  if (existingLogs.length > 0) {
    const lastRaid = existingLogs[0];
    const timeSinceRaid = Date.now() - lastRaid.detectedAt.getTime();
    if (timeSinceRaid < 30 * 60 * 1000) {
      return true;
    }
  }

  return false;
}

export function clearRaidDetection(guildId: string): void {
  raidDetections.delete(guildId);
}
