import { Client, TextChannel, EmbedBuilder, GuildMember } from "discord.js";
import logger from "../utils/logger.js";
import { safeInterval } from "../utils/safe-interval.js";
import prisma from "../prisma.js";
import { config } from "../config.js";

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
let churnInterval: NodeJS.Timeout | null = null;
const CHURN_THRESHOLD = 0.6;

interface MemberActivity {
  userId: string;
  username: string;
  avgMessagesPerDay: number;
  recentMessagesPerDay: number;
  lastActive: Date | null;
  churnRisk: number;
}

async function checkChurnRisk(client: Client): Promise<void> {
  const alertChannelId = process.env.CHURN_ALERT_CHANNEL || config.logChannel || "";
  if (!alertChannelId) return;

  const channel = client.channels.cache.get(alertChannelId) as TextChannel;
  if (!channel?.isTextBased()) return;

  const atRiskMembers: MemberActivity[] = [];

  for (const guild of client.guilds.cache.values()) {
    try {
    const members = await guild.members.fetch({ limit: 200 });
    for (const [memberId, member] of members) {
      if (member.user.bot) continue;

      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recentSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const totalMessages = await prisma.notification.count({
        where: { sentAt: { gte: since } },
      }).catch(() => 0);

      const recentMessages = await prisma.notification.count({
        where: { sentAt: { gte: recentSince } },
      }).catch(() => 0);

      const avgPerDay = totalMessages / 30;
      const recentPerDay = recentMessages / 7;

      if (avgPerDay < 1) continue;

      const churnRisk = avgPerDay > 0 ? Math.max(0, 1 - recentPerDay / avgPerDay) : 0;

      if (churnRisk >= CHURN_THRESHOLD) {
        atRiskMembers.push({
          userId: memberId,
          username: member.user.username,
          avgMessagesPerDay: avgPerDay,
          recentMessagesPerDay: recentPerDay,
          lastActive: null,
          churnRisk,
        });
      }
    }
    } catch {}
  }

  if (atRiskMembers.length === 0) return;

  atRiskMembers.sort((a, b) => b.churnRisk - a.churnRisk);

  const embed = new EmbedBuilder()
    .setTitle("⚠️ Alerte churn — Membres à risque de départ")
    .setColor(0xff6600)
    .setDescription(`${atRiskMembers.length} membre(s) ont réduit leur activité de >${Math.round(CHURN_THRESHOLD * 100)}%`)
    .setFooter({ text: "Surveillance System • Churn Prediction" })
    .setTimestamp();

  for (const m of atRiskMembers.slice(0, 15)) {
    embed.addFields({
      name: m.username,
      value: `Activité: ${m.avgMessagesPerDay.toFixed(1)}/j → ${m.recentMessagesPerDay.toFixed(1)}/j (${Math.round(m.churnRisk * 100)}% de baisse)`,
      inline: false,
    });
  }

  try {
    await channel.send({ embeds: [embed], content: atRiskMembers.length > 10 ? `<@&${process.env.ADMIN_ROLE_ID ?? ""}>` : undefined });
    logger.info(`[Churn] Alerte envoyée — ${atRiskMembers.length} membre(s) à risque`);
  } catch (err) {
    logger.error(`[Churn] Erreur envoi: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function startChurnPrediction(client: Client): void {
  if (churnInterval) return;
  logger.info("[Churn] Prédiction de churn activée (intervalle: 24h)");
  churnInterval = safeInterval("ChurnPrediction", () => checkChurnRisk(client), CHECK_INTERVAL_MS);
}

export function stopChurnPrediction(): void {
  if (churnInterval) {
    clearInterval(churnInterval);
    churnInterval = null;
  }
}
