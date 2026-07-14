/**
 * shadowBrokerCron.ts — Cron Shadow Broker
 *
 * Envoie automatiquement au propriétaire (en DM) :
 *  1. Rapport d'intelligence périodique (toutes les semaines — lundi 10:00)
 *  2. Alertes temps réel sur événements suspects (toutes les 5 min)
 *  3. Résumé hebdomadaire complet (vendredi 22:00)
 *
 * Toutes les stats "Intelligence serveur" sont envoyées en DM.
 */

import { Client, EmbedBuilder } from "discord.js";
import cron, { ScheduledTask } from "node-cron";
import logger from "../utils/logger.js";
import { config } from "../config.js";
import { isNotificationsSilenced } from "../utils/persistentCooldown.js";
import { generateIntelReport, detectSuspiciousPatterns } from "../services/shadowBroker.js";
import prisma from "../prisma.js";

let reportCron: ScheduledTask | null = null;
let dailyCron: ScheduledTask | null = null;
let alertInterval: NodeJS.Timeout | null = null;

const lastAlertHashes = new Set<string>();

function alertHash(type: string, userId: string): string {
  return `${type}:${userId}`;
}

// ─── Rapport périodique (hebdomadaire — lundi 10:00) ─────────────────────────

async function sendPeriodicReport(client: Client): Promise<void> {
  if (isNotificationsSilenced()) return;
  try {
    const guilds = client.guilds.cache;
    if (guilds.size === 0) return;

    for (const [guildId, guild] of guilds) {
      try {
        const report = await generateIntelReport(client, guildId);

        const embed = new EmbedBuilder()
          .setTitle(`🕵️ [Shadow Broker] Rapport d'intelligence — ${guild.name}`)
          .setColor(0x00ff41)
          .setTimestamp();

        embed.addFields(
          { name: "👥 Membres", value: String(report.totalMembers), inline: true },
          { name: "🟠 Risque élevé", value: String(report.highRiskCount), inline: true },
          { name: "🔴 Risque critique", value: String(report.criticalRiskCount), inline: true },
          { name: "⚖️ Sanctions totales", value: String(report.totalSanctions), inline: true },
          { name: "📥 Joins (24h)", value: String(report.recentJoins), inline: true },
          {
            name: "🔍 Patterns suspects",
            value: String(report.suspiciousPatterns.length),
            inline: true,
          },
        );

        // Top 5 risque
        if (report.topRiskMembers.length > 0) {
          const topText = report.topRiskMembers
            .slice(0, 5)
            .map(
              (m, i) =>
                `${i + 1}. <@${m.userId}> — Score: ${m.riskScore} | ${m.riskLevel} | ${m.totalSanctions} sanction(s)`,
            )
            .join("\n");
          embed.addFields({ name: "🏆 Top 5 risque", value: topText, inline: false });
        }

        // Patterns critiques
        const critical = report.suspiciousPatterns.filter(
          (p) => p.severity === "critical" || p.severity === "high",
        );
        if (critical.length > 0) {
          embed.addFields({
            name: "⚠️ Alertes actives",
            value: critical
              .slice(0, 5)
              .map((p) => `**[${p.severity.toUpperCase()}]** ${p.description}`)
              .join("\n"),
            inline: false,
          });
        }

        // Stats supplémentaires
        const [totalNameChanges, totalAvatarChanges, totalWarnings] = await Promise.all([
          prisma.nameHistory.count({ where: { guildId } }),
          prisma.avatarHistory.count({ where: { guildId } }),
          prisma.sanction.count({ where: { guildId, type: "WARN" } }),
        ]);

        embed.addFields(
          { name: "🔄 Changements pseudo (total)", value: String(totalNameChanges), inline: true },
          {
            name: "🖼️ Changements avatar (total)",
            value: String(totalAvatarChanges),
            inline: true,
          },
          { name: "⚠️ Warnings (total)", value: String(totalWarnings), inline: true },
        );

        embed.setFooter({ text: `Rapport automatique • ${guildId}` });

        // Envoi DM
        const owner = await client.users.fetch(config.ownerId);
        if (owner) {
          await owner.send({ embeds: [embed] });
          logger.info(`[ShadowBrokerCron] Rapport périodique envoyé pour ${guild.name}`);
        }
      } catch (err) {
        logger.error(`[ShadowBrokerCron] Erreur rapport ${guildId}: ${err}`);
      }
    }
  } catch (err) {
    logger.error("[ShadowBrokerCron] Erreur rapport périodique:", err);
  }
}

// ─── Résumé hebdomadaire complet (vendredi 22:00) ────────────────────────────

async function sendDailySummary(client: Client): Promise<void> {
  if (isNotificationsSilenced()) return;
  try {
    const guilds = client.guilds.cache;
    if (guilds.size === 0) return;

    const owner = await client.users.fetch(config.ownerId);
    if (!owner) return;

    // En-tête
    const headerEmbed = new EmbedBuilder()
      .setTitle("🕵️ [Shadow Broker] Résumé quotidien d'intelligence")
      .setColor(0x0d1117)
      .setDescription(
        `**${guilds.size} serveur(s) surveillé(s)**\nRécapitulatif complet des dernières 24h`,
      )
      .setTimestamp();

    await owner.send({ embeds: [headerEmbed] });

    for (const [guildId, guild] of guilds) {
      try {
        const report = await generateIntelReport(client, guildId);

        // Stats des dernières 24h
        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const [
          joins24h,
          leaves24h,
          bans24h,
          warnings24h,
          nameChanges24h,
          avatarChanges24h,
          commands24h,
          newSanctions24h,
        ] = await Promise.all([
          prisma.log.count({ where: { type: "member_join", createdAt: { gte: since24h } } }),
          prisma.log.count({ where: { type: "member_leave", createdAt: { gte: since24h } } }),
          prisma.log.count({ where: { type: "ban", createdAt: { gte: since24h } } }),
          prisma.sanction.count({ where: { guildId, type: "WARN", createdAt: { gte: since24h } } }),
          prisma.nameHistory.count({ where: { guildId, changedAt: { gte: since24h } } }),
          prisma.avatarHistory.count({ where: { guildId, changedAt: { gte: since24h } } }),
          prisma.commandLog.count({ where: { guildId, timestamp: { gte: since24h } } }),
          prisma.sanction.count({ where: { guildId, createdAt: { gte: since24h } } }),
        ]);

        const embed = new EmbedBuilder()
          .setTitle(`📊 ${guild.name} (${guild.memberCount} membres)`)
          .setColor(0x00ff41)
          .setTimestamp();

        embed.addFields(
          { name: "📥 Nouveaux membres", value: String(joins24h), inline: true },
          { name: "📤 Départs", value: String(leaves24h), inline: true },
          { name: "🔨 Bannissements", value: String(bans24h), inline: true },
          { name: "⚠️ Warnings", value: String(warnings24h), inline: true },
          { name: "⚖️ Sanctions totales", value: String(newSanctions24h), inline: true },
          { name: "🖥️ Commandes", value: String(commands24h), inline: true },
          { name: "🔄 Changements pseudo", value: String(nameChanges24h), inline: true },
          { name: "🖼️ Changements avatar", value: String(avatarChanges24h), inline: true },
          {
            name: "🔍 Patterns suspects",
            value: String(report.suspiciousPatterns.length),
            inline: true,
          },
        );

        // Top 10 risque
        if (report.topRiskMembers.length > 0) {
          const topText = report.topRiskMembers
            .map(
              (m, i) =>
                `${i + 1}. <@${m.userId}> — ${m.riskScore} pts | ${m.riskLevel} | ${m.totalSanctions} sanctions`,
            )
            .join("\n");
          embed.addFields({ name: "🏆 Top 10 risque", value: topText, inline: false });
        }

        // Alertes critiques
        const critical = report.suspiciousPatterns.filter(
          (p) => p.severity === "critical" || p.severity === "high",
        );
        if (critical.length > 0) {
          embed.addFields({
            name: "🚨 Alertes critiques",
            value: critical
              .map((p) => `**[${p.severity.toUpperCase()}]** ${p.description}\n> 👤 ${p.userTag}`)
              .join("\n"),
            inline: false,
          });
        }

        // Comptes sous surveillance
        const watched = await prisma.riskProfile.findMany({
          where: { guildId, underWatch: true },
          take: 10,
        });
        if (watched.length > 0) {
          embed.addFields({
            name: "👁️ Sous surveillance active",
            value: watched
              .map((w) => `<@${w.userId}> — Score: ${w.riskScore} (${w.riskLevel})`)
              .join("\n"),
            inline: false,
          });
        }

        await owner.send({ embeds: [embed] });
        logger.info(`[ShadowBrokerCron] Résumé quotidien envoyé pour ${guild.name}`);
      } catch (err) {
        logger.error(`[ShadowBrokerCron] Erreur résumé ${guildId}: ${err}`);
      }
    }
  } catch (err) {
    logger.error("[ShadowBrokerCron] Erreur résumé quotidien:", err);
  }
}

// ─── Alertes temps réel (toutes les 5 min) ───────────────────────────────────

async function checkRealTimeAlerts(client: Client): Promise<void> {
  if (isNotificationsSilenced()) return;
  try {
    const guilds = client.guilds.cache;
    if (guilds.size === 0) return;

    for (const [guildId, guild] of guilds) {
      // Vérifier si le mode stealth est actif — si oui, on envoie les alertes
      // Si non, on envoie aussi (le user veut tout en DM)
      try {
        const patterns = await detectSuspiciousPatterns(client, guildId);

        for (const pattern of patterns) {
          const hash = alertHash(pattern.type, pattern.userId);
          if (lastAlertHashes.has(hash)) continue; // Déjà alerté

          // N'alerter que pour medium+
          if (pattern.severity === "low") continue;

          lastAlertHashes.add(hash);
          // Limiter la taille du set
          if (lastAlertHashes.size > 100) {
            const first = lastAlertHashes.values().next().value;
            if (first) lastAlertHashes.delete(first);
          }

          const severityColors: Record<string, number> = {
            critical: 0xff0000,
            high: 0xff6600,
            medium: 0xffaa00,
          };

          const embed = new EmbedBuilder()
            .setTitle(`🚨 [Shadow Broker] Alerte ${pattern.severity.toUpperCase()}`)
            .setColor(severityColors[pattern.severity] ?? 0xffaa00)
            .setDescription(pattern.description)
            .addFields(
              { name: "Type", value: pattern.type, inline: true },
              { name: "Membre", value: `<@${pattern.userId}> (${pattern.userTag})`, inline: true },
              { name: "Serveur", value: guild.name, inline: true },
            )
            .setTimestamp();

          const owner = await client.users.fetch(config.ownerId);
          if (owner) {
            await owner.send({ embeds: [embed] });
          }
        }
      } catch {
        // Skip guild errors
      }
    }
  } catch (err) {
    logger.error("[ShadowBrokerCron] Erreur alertes temps réel:", err);
  }
}

// ─── Démarrage ───────────────────────────────────────────────────────────────

export function startShadowBrokerCron(client: Client): void {
  // Rapport périodique hebdomadaire — lundi 10:00
  reportCron = cron.schedule("0 10 * * 1", () => {
    logger.info("[ShadowBrokerCron] Génération rapport hebdomadaire...");
    void sendPeriodicReport(client);
  });

  // Résumé hebdomadaire — vendredi 22:00
  dailyCron = cron.schedule("0 22 * * 5", () => {
    logger.info("[ShadowBrokerCron] Génération résumé hebdomadaire...");
    void sendDailySummary(client);
  });

  // Alertes temps réel toutes les 5 minutes
  alertInterval = setInterval(
    () => {
      void checkRealTimeAlerts(client);
    },
    5 * 60 * 1000,
  );
  if (alertInterval.unref) alertInterval.unref();

  logger.info(
    "[ShadowBrokerCron] Crons démarrés: rapport hebdo (lun 10:00), résumé hebdo (ven 22:00), alertes temps réel (5min)",
  );
}

export function stopShadowBrokerCron(): void {
  if (reportCron) reportCron.stop();
  if (dailyCron) dailyCron.stop();
  if (alertInterval) clearInterval(alertInterval);
  reportCron = null;
  dailyCron = null;
  alertInterval = null;
  logger.info("[ShadowBrokerCron] Arrêté");
}
