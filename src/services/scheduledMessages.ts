import { Client, TextChannel, EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";
import { safeInterval } from "../utils/safe-interval.js";
import prisma from "../prisma.js";

const CHECK_INTERVAL_MS = 60 * 1000;
let schedulerInterval: NodeJS.Timeout | null = null;

interface ScheduledMessage {
  id: string;
  channelId: string;
  content: string;
  cronExpression: string;
  lastSent: number | null;
  active: boolean;
}

async function checkScheduledMessages(client: Client): Promise<void> {
  try {
    const schedules = await prisma.scheduledMessage.findMany({
      where: { enabled: true },
    });

    const now = Date.now();
    for (const sched of schedules) {
      const lastSent = sched.lastSent?.getTime() ?? 0;
      const intervalMs = parseInterval(sched.cron);
      if (intervalMs <= 0) continue;

      if (now - lastSent >= intervalMs) {
        const channel = client.channels.cache.get(sched.channelId) as TextChannel;
        if (!channel?.isTextBased()) continue;

        try {
          const embed = new EmbedBuilder()
            .setTitle("📢 Message programmé")
            .setDescription(sched.content)
            .setColor(0x00aaff)
            .setFooter({ text: "Surveillance System • Scheduled Messages" })
            .setTimestamp();

          await channel.send({ embeds: [embed] });
          await prisma.scheduledMessage.update({
            where: { id: sched.id },
            data: { lastSent: new Date() },
          });
          logger.info(`[Scheduled] Message envoyé dans #${channel.name}`);
        } catch (err) {
          logger.error(`[Scheduled] Erreur envoi: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  } catch (err) {
    logger.error(`[Scheduled] Erreur check: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function parseInterval(expr: string): number {
  const match = expr.match(/^every-(\d+)-(second|minute|hour|day)$/i);
  if (!match) return 0;
  const num = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    second: 1000,
    minute: 60_000,
    hour: 3_600_000,
    day: 86_400_000,
  };
  return num * (multipliers[unit] ?? 0);
}

export function startScheduledMessages(client: Client): void {
  if (schedulerInterval) return;
  logger.info("[Scheduled] Service de messages programmés activé (intervalle: 1min)");
  schedulerInterval = safeInterval("ScheduledMessages", () => checkScheduledMessages(client), CHECK_INTERVAL_MS);
}

export function stopScheduledMessages(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}
