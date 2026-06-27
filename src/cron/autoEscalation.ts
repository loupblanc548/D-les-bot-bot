/**
 * autoEscalation.ts — Escalade automatique des alertes (CRON-30)
 *
 * Matrix d'escalade : alerte → warn → mute → ban automatique
 * Vérifie les events de sécurité récents et applique des sanctions
 * progressives selon le nombre d'infractions.
 */

import { Client, TextChannel, EmbedBuilder } from "discord.js";
import { safeInterval } from "../utils/safe-interval.js";
import logger from "../utils/logger.js";
import { config } from "../config.js";
import prisma from "../prisma.js";

const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 min
const WINDOW_HOURS = 24; // fenêtre de 24h

// Seuils d'escalade
const WARN_THRESHOLD = 3; // 3 events → warn
const MUTE_THRESHOLD = 5; // 5 events → mute 1h
const BAN_THRESHOLD = 8; // 8 events → ban

interface EscalationAction {
  userId: string;
  guildId: string;
  action: "warn" | "mute" | "ban";
  eventCount: number;
}

export async function runAutoEscalation(client: Client): Promise<void> {
  try {
    const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000);

    // Grouper les logs de sécurité par utilisateur
    const logs = await prisma.log.groupBy({
      by: ["userId", "guildId"],
      where: {
        type: { in: ["automod", "security", "antiphishing"] },
        createdAt: { gte: since },
      },
      _count: true,
    });

    const actions: EscalationAction[] = [];

    for (const log of logs) {
      if (!log.userId || !log.guildId) continue;
      const count = log._count;
      if (count < WARN_THRESHOLD) continue;

      // Vérifier si déjà sanctionné récemment
      const recentLog = await prisma.log.findFirst({
        where: {
          userId: log.userId!,
          type: { in: ["warn", "mute", "ban", "automod_escalation"] },
          createdAt: { gte: since },
        },
      });

      if (recentLog) continue; // déjà sanctionné

      if (count >= BAN_THRESHOLD) {
        actions.push({
          userId: log.userId!,
          guildId: log.guildId!,
          action: "ban",
          eventCount: count,
        });
      } else if (count >= MUTE_THRESHOLD) {
        actions.push({
          userId: log.userId!,
          guildId: log.guildId!,
          action: "mute",
          eventCount: count,
        });
      } else if (count >= WARN_THRESHOLD) {
        actions.push({
          userId: log.userId!,
          guildId: log.guildId!,
          action: "warn",
          eventCount: count,
        });
      }
    }

    for (const action of actions) {
      try {
        const guild = await client.guilds.fetch(action.guildId);
        const member = await guild.members.fetch(action.userId).catch(() => null);
        if (!member) continue;

        if (action.action === "ban") {
          await member.ban({ reason: `Auto-escalation: ${action.eventCount} events en 24h` });
        } else if (action.action === "mute") {
          await member.timeout(60 * 60 * 1000, `Auto-escalation: ${action.eventCount} events`);
        } else {
          // warn = juste un log + DM
          await member
            .send({
              content: `⚠️ Avertissement automatique: tu as accumulé **${action.eventCount}** events de sécurité en 24h sur **${guild.name}**. Modère ton comportement.`,
            })
            .catch(() => {});
        }

        await prisma.log.create({
          data: {
            guildId: action.guildId,
            type: "automod_escalation",
            action: `Auto-escalation ${action.action}: ${action.eventCount} events pour ${action.userId}`,
            userId: action.userId,
          },
        });

        // Notifier le salon de log
        const logChannelId = config.logChannel;
        if (logChannelId) {
          const channel = await client.channels.fetch(logChannelId).catch(() => null);
          if (channel?.isTextBased()) {
            const embed = new EmbedBuilder()
              .setTitle("⚡ Auto-Escalation")
              .setColor(
                action.action === "ban" ? 0xff3344 : action.action === "mute" ? 0xff9900 : 0xffcc00,
              )
              .setDescription(
                `<@${action.userId}> a reçu un **${action.action}** automatique\n` +
                  `**${action.eventCount}** events de sécurité en 24h`,
              )
              .setTimestamp();
            await (channel as TextChannel).send({ embeds: [embed] });
          }
        }

        logger.info(
          `[AutoEscalation] ${action.action}: ${action.userId} (${action.eventCount} events)`,
        );
      } catch (error) {
        logger.debug(`[AutoEscalation] Error for ${action.userId}:`, error);
      }
    }

    if (actions.length > 0) {
      logger.info(`[AutoEscalation] ${actions.length} action(s) appliquée(s)`);
    }
  } catch (error) {
    logger.error("[AutoEscalation] Erreur:", error);
  }
}

export function startAutoEscalation(client: Client): void {
  logger.info("[AutoEscalation] Escalade automatique activée (vérification toutes les 10 min)");

  safeInterval(
    "AutoEscalation",
    () => {
      runAutoEscalation(client).catch((err) => logger.error("[AutoEscalation] Erreur:", err));
    },
    CHECK_INTERVAL_MS,
  );
}
