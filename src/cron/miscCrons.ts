/**
 * miscCrons.ts — Crons divers automatisés
 *
 * CRON-14: Member milestone (notif auto à 100/500/1000 membres)
 * CRON-15: Birthday notifier (notif auto anniversaires du jour)
 * CRON-24: Command stats logging (log auto des utilisations de commandes)
 * CRON-27: AI server health (rapport IA global quotidien)
 */

import { Client, TextChannel, EmbedBuilder } from "discord.js";
import cron, { ScheduledTask } from "node-cron";
import logger from "../utils/logger.js";
import { config } from "../config.js";
import prisma from "../prisma.js";

// ─── Member Milestone (CRON-14) ──────────────────────────────────────────────

const MILESTONES = [100, 500, 1000, 2000, 5000, 10000];
const milestoneTracker = new Map<string, number>(); // guildId → last milestone

export async function checkMemberMilestone(client: Client): Promise<void> {
  try {
    for (const guild of client.guilds.cache.values()) {
      const count = guild.memberCount;
      const lastMilestone = milestoneTracker.get(guild.id) || 0;

      for (const ms of MILESTONES) {
        if (count >= ms && lastMilestone < ms) {
          milestoneTracker.set(guild.id, ms);

          const generalChannelId = "1134242473334554774";
          const channel = await client.channels.fetch(generalChannelId).catch(() => null);
          if (channel?.isTextBased()) {
            const embed = new EmbedBuilder()
              .setTitle(`🎉 Milestone atteint !`)
              .setColor(0x57f287)
              .setDescription(
                `Le serveur **${guild.name}** vient d'atteindre **${ms}** membres ! 🥳`,
              )
              .setTimestamp();
            await (channel as TextChannel).send({
              embeds: [embed],
            });
          }
          logger.info(`[Milestone] ${guild.name}: ${ms} membres atteints`);
          break;
        }
      }
    }
  } catch (error) {
    logger.error("[Milestone] Erreur:", error);
  }
}

// ─── Birthday Notifier (CRON-15) ─────────────────────────────────────────────

export async function checkBirthdays(client: Client): Promise<void> {
  try {
    const today = new Date();
    const monthDay = `${today.getMonth() + 1}-${today.getDate()}`;

    const birthdays = await prisma.setting.findMany({
      where: { key: { startsWith: "birthday:" } },
    });

    for (const setting of birthdays) {
      const birthday = setting.value; // format: MM-DD
      if (birthday !== monthDay) continue;

      const userId = setting.key.replace("birthday:", "");
      const guildId = setting.guildId;

      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) continue;

      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) continue;

      const generalChannelId = "1134242473334554774";
      const channel = await client.channels.fetch(generalChannelId).catch(() => null);
      if (channel?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setTitle("🎂 Joyeux Anniversaire !")
          .setColor(0xe91e63)
          .setDescription(`C'est l'anniversaire de ${member} aujourd'hui ! 🎉`)
          .setTimestamp();
        await (channel as TextChannel).send({ embeds: [embed] });
      }
      logger.info(`[Birthday] ${member.user.tag} a son anniversaire aujourd'hui`);
    }
  } catch (error) {
    logger.error("[Birthday] Erreur:", error);
  }
}

// ─── AI Server Health (CRON-27) ──────────────────────────────────────────────

export async function runAiServerHealth(client: Client): Promise<void> {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Collecter les stats
    const totalLogs = await prisma.log.count({ where: { createdAt: { gte: since } } });
    const securityLogs = await prisma.log.count({
      where: { type: { in: ["security", "automod", "antiphishing"] }, createdAt: { gte: since } },
    });
    const modLogs = await prisma.log.count({
      where: {
        type: { in: ["ban", "kick", "mute", "warn", "timeout"] },
        createdAt: { gte: since },
      },
    });

    const totalNotifications = await prisma.notification.count({
      where: { sentAt: { gte: since } },
    });

    const guildCount = client.guilds.cache.size;
    const totalMembers = client.guilds.cache.reduce((sum, g) => sum + g.memberCount, 0);

    // Générer le rapport IA
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return;

    const statsText = `Serveurs: ${guildCount}, Membres: ${totalMembers}, Logs 24h: ${totalLogs}, Events sécurité: ${securityLogs}, Sanctions: ${modLogs}, Notifications: ${totalNotifications}`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://discord-bot.com",
        "X-Title": "John Helldiver - Health Report",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.2-3b-instruct:free",
        messages: [
          {
            role: "system",
            content:
              "Tu es John Helldiver. Analyse ces statistiques de serveur Discord et donne un rapport de santé concis (3-5 lignes): activité générale, sécurité, engagement. Identifie les problèmes potentiels. Réponds en français.",
          },
          { role: "user", content: statsText },
        ],
        max_tokens: 300,
        temperature: 0.5,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return;
    const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
    const aiReport = data.choices?.[0]?.message?.content?.trim() || "Rapport indisponible.";

    const logChannelId = config.logChannel;
    if (logChannelId) {
      const channel = await client.channels.fetch(logChannelId).catch(() => null);
      if (channel?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setTitle("🤖 Rapport de Santé IA (24h)")
          .setColor(0x2f3136)
          .setDescription(aiReport.slice(0, 2000))
          .addFields(
            { name: "Serveurs", value: `${guildCount}`, inline: true },
            { name: "Membres", value: `${totalMembers}`, inline: true },
            { name: "Logs 24h", value: `${totalLogs}`, inline: true },
            { name: "Sécurité", value: `${securityLogs}`, inline: true },
            { name: "Sanctions", value: `${modLogs}`, inline: true },
            { name: "Notifs", value: `${totalNotifications}`, inline: true },
          )
          .setTimestamp()
          .setFooter({ text: "Rapport automatique IA quotidien" });
        await (channel as TextChannel).send({ embeds: [embed] });
      }
    }
    logger.info("[AiHealth] Rapport IA envoyé");
  } catch (error) {
    logger.error("[AiHealth] Erreur:", error);
  }
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

let milestoneInterval: NodeJS.Timeout | null = null;
let birthdayCron: ScheduledTask | null = null;
let healthCron: ScheduledTask | null = null;

export function startMiscCrons(client: Client): void {
  // CRON-14: Member milestone — check every 10 min
  milestoneInterval = setInterval(
    () => {
      checkMemberMilestone(client).catch((err) => logger.error("[Milestone] Erreur:", err));
    },
    10 * 60 * 1000,
  );

  // CRON-15: Birthday notifier — daily at 09:00
  birthdayCron = cron.schedule("0 9 * * *", () => {
    checkBirthdays(client).catch((err) => logger.error("[Birthday] Erreur:", err));
  });

  // CRON-27: AI server health — daily at 23:00
  healthCron = cron.schedule("0 23 * * *", () => {
    runAiServerHealth(client).catch((err) => logger.error("[AiHealth] Erreur:", err));
  });

  logger.info("[MiscCrons] Crons activés: milestone (10min), birthday (09:00), ai-health (23:00)");
}

export function stopMiscCrons(): void {
  if (milestoneInterval) clearInterval(milestoneInterval);
  if (birthdayCron) birthdayCron.stop();
  if (healthCron) healthCron.stop();
  milestoneInterval = null;
  birthdayCron = null;
  healthCron = null;
}
