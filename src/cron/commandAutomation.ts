/**
 * commandAutomation.ts — Automatise les anciennes commandes slash en crons/events
 *
 * Remplace: /trend-report, /scraper-status, /source-stats, /security-audit,
 * /retrospective, /snipe, /debug, /uptime, /viral-alert, /auto-report
 */

import { Client, TextChannel, EmbedBuilder } from "discord.js";
import cron, { ScheduledTask } from "node-cron";
import logger from "../utils/logger.js";
import { config } from "../config.js";
import prisma from "../prisma.js";
import { safeInterval } from "../utils/safe-interval.js";

// ─── Trend Report (remplace /trend-report) — toutes les 6h ───────────────────

async function runTrendReport(client: Client): Promise<void> {
  try {
    const since = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const notifications = await prisma.notification.count({ where: { sentAt: { gte: since } } });
    const logs = await prisma.log.count({ where: { createdAt: { gte: since } } });

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://discord-bot.com",
        "X-Title": "John Helldiver - Trend Report",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3-8b-instruct:free",
        messages: [
          {
            role: "system",
            content:
              "Tu es John Helldiver. Analyse les tendances gaming et donne un rapport concis (3-5 lignes). Réponds en français.",
          },
          {
            role: "user",
            content: `Stats 6h: ${notifications} notifications, ${logs} logs. Identifie les sujets tendance.`,
          },
        ],
        max_tokens: 300,
        temperature: 0.5,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return;
    const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
    const report = data.choices?.[0]?.message?.content?.trim() || "Rapport indisponible.";

    const logChannelId = config.gamingBlogChannel || config.logChannel;
    if (logChannelId) {
      const channel = await client.channels.fetch(logChannelId).catch(() => null);
      if (channel?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setColor(0xef7f1a)
          .setTitle("📈 Rapport de Tendances (6h)")
          .setDescription(report.slice(0, 2000))
          .addFields(
            { name: "Notifications", value: `${notifications}`, inline: true },
            { name: "Logs", value: `${logs}`, inline: true },
          )
          .setTimestamp()
          .setFooter({ text: "Automatique — remplace /trend-report" });
        await (channel as TextChannel).send({ embeds: [embed] });
      }
    }
  } catch (error) {
    logger.error("[CmdAuto] Trend report error:", error);
  }
}

// ─── Scraper Status (remplace /scraper-status) — quotidien 06:00 ─────────────

async function runScraperStatus(client: Client): Promise<void> {
  try {
    const sources = await prisma.source.findMany({ take: 100 });
    const byType = sources.reduce(
      (acc, s) => {
        acc[s.type] = (acc[s.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const logChannelId = config.logChannel;
    if (!logChannelId) return;
    const channel = await client.channels.fetch(logChannelId).catch(() => null);
    if (!channel?.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle("🔧 Statut des Scrapers")
      .addFields(
        { name: "Total sources", value: `${sources.length}`, inline: true },
        {
          name: "Types",
          value:
            Object.entries(byType)
              .map(([t, n]) => `${t}: ${n}`)
              .join(", ") || "Aucune",
          inline: true,
        },
      )
      .setTimestamp()
      .setFooter({ text: "Automatique — remplace /scraper-status" });
    await (channel as TextChannel).send({ embeds: [embed] });
  } catch (error) {
    logger.error("[CmdAuto] Scraper status error:", error);
  }
}

// ─── Source Stats (remplace /source-stats) — hebdo lundi 09:00 ────────────────

async function runSourceStats(client: Client): Promise<void> {
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const sources = await prisma.source.findMany({ take: 100 });
    const notifCount = await prisma.notification.count({ where: { sentAt: { gte: since } } });

    const logChannelId = config.logChannel;
    if (!logChannelId) return;
    const channel = await client.channels.fetch(logChannelId).catch(() => null);
    if (!channel?.isTextBased()) return;

    const topSources = sources
      .slice(0, 10)
      .map((s) => `• ${s.urlOrHandle} (${s.type})`)
      .join("\n");

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle("📊 Stats des Sources (7j)")
      .setDescription(topSources || "Aucune source")
      .addFields({ name: "Notifications (7j)", value: `${notifCount}`, inline: true })
      .setTimestamp()
      .setFooter({ text: "Automatique — remplace /source-stats" });
    await (channel as TextChannel).send({ embeds: [embed] });
  } catch (error) {
    logger.error("[CmdAuto] Source stats error:", error);
  }
}

// ─── Security Audit (remplace /security-audit) — hebdo dimanche 23:00 ────────

async function runSecurityAudit(client: Client): Promise<void> {
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const modActions = await prisma.log.count({
      where: {
        type: { in: ["ban", "kick", "mute", "warn", "timeout"] },
        createdAt: { gte: since },
      },
    });
    const securityEvents = await prisma.log.count({
      where: { type: { in: ["security", "automod", "antiphishing"] }, createdAt: { gte: since } },
    });
    const riskProfiles = await prisma.riskProfile.count({
      where: { riskScore: { gt: 50 } },
    });

    const logChannelId = config.logChannel;
    if (!logChannelId) return;
    const channel = await client.channels.fetch(logChannelId).catch(() => null);
    if (!channel?.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle("🔒 Audit de Sécurité (7j)")
      .addFields(
        { name: "Actions de modération", value: `${modActions}`, inline: true },
        { name: "Events de sécurité", value: `${securityEvents}`, inline: true },
        { name: "Profils à risque", value: `${riskProfiles}`, inline: true },
      )
      .setTimestamp()
      .setFooter({ text: "Automatique — remplace /security-audit" });
    await (channel as TextChannel).send({ embeds: [embed] });
    logger.info("[CmdAuto] Security audit envoyé");
  } catch (error) {
    logger.error("[CmdAuto] Security audit error:", error);
  }
}

// ─── Auto Snipe (remplace /snipe) — event messageDelete ──────────────────────

const recentDeleted = new Map<string, { content: string; author: string; timestamp: number }>();

export function handleAutoSnipe(client: Client): void {
  client.on("messageDelete", async (message) => {
    try {
      if (!message.guild || message.author?.bot) return;
      if (!message.content || message.content.length < 2) return;

      recentDeleted.set(message.channelId, {
        content: message.content.slice(0, 500),
        author: message.author?.tag || "Unknown",
        timestamp: Date.now(),
      });

      // Auto-post dans le log channel
      const logChannelId = config.logChannel;
      if (logChannelId) {
        const channel = await client.channels.fetch(logChannelId).catch(() => null);
        if (channel?.isTextBased()) {
          const embed = new EmbedBuilder()
            .setColor(0x95a5a6)
            .setTitle("🗑️ Message supprimé")
            .addFields(
              { name: "Auteur", value: message.author?.tag || "Unknown", inline: true },
              { name: "Salon", value: `<#${message.channelId}>`, inline: true },
              { name: "Contenu", value: message.content.slice(0, 1000) || "(vide)", inline: false },
            )
            .setTimestamp()
            .setFooter({ text: "Auto-snipe — remplace /snipe" });
          await (channel as TextChannel).send({ embeds: [embed] });
        }
      }
    } catch (error) {
      logger.error("[CmdAuto] Auto snipe error:", error);
    }
  });

  // Cleanup old entries
  safeInterval(
    "AutoSnipeCleanup",
    () => {
      const now = Date.now();
      for (const [key, value] of recentDeleted) {
        if (now - value.timestamp > 60000) recentDeleted.delete(key);
      }
    },
    60000,
  );

  logger.info("[CmdAuto] Auto-snipe activé (remplace /snipe)");
}

// ─── Auto Debug (remplace /debug) — error handler global ─────────────────────

export function handleAutoDebug(client: Client): void {
  client.on("error", (error) => {
    logger.error("[CmdAuto] Discord error:", error);
  });

  process.on("unhandledRejection", (reason) => {
    logger.error("[CmdAuto] Unhandled rejection:", reason);
  });

  logger.info("[CmdAuto] Auto-debug activé (remplace /debug)");
}

// ─── Command Stats Logging (CRON-24) — continu via event ────────────────────

const commandStats = new Map<string, { count: number; lastUsed: number }>();

export function logCommandUsage(commandName: string): void {
  const now = Date.now();
  const entry = commandStats.get(commandName) || { count: 0, lastUsed: now };
  entry.count++;
  entry.lastUsed = now;
  commandStats.set(commandName, entry);
}

async function runCommandStatsReport(client: Client): Promise<void> {
  try {
    if (commandStats.size === 0) return;
    const sorted = Array.from(commandStats.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 15);
    const total = Array.from(commandStats.values()).reduce((sum, e) => sum + e.count, 0);

    const logChannelId = config.logChannel;
    if (!logChannelId) return;
    const channel = await client.channels.fetch(logChannelId).catch(() => null);
    if (!channel?.isTextBased()) return;

    const lines = sorted.map(([name, stats]) => `• /${name} — ${stats.count} utilisations`);
    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle("📊 Stats des Commandes (24h)")
      .setDescription(lines.join("\n") || "Aucune utilisation")
      .addFields({ name: "Total utilisations", value: `${total}`, inline: true })
      .setTimestamp()
      .setFooter({ text: "CRON-24 — Automatique" });
    await (channel as TextChannel).send({ embeds: [embed] });

    // Reset pour le prochain cycle
    commandStats.clear();
  } catch (error) {
    logger.error("[CmdAuto] Command stats error:", error);
  }
}

// ─── Trend Predict IA (CRON-26) — analyse virale toutes les 6h ────────────────

async function runTrendPredict(client: Client): Promise<void> {
  try {
    const since = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const notifications = await prisma.notification.findMany({
      where: { sentAt: { gte: since } },
      take: 50,
      orderBy: { sentAt: "desc" },
    });

    if (notifications.length < 5) return;

    const titles = notifications
      .map((n) => n.content || n.url || "")
      .filter(Boolean)
      .join("\n");
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://discord-bot.com",
        "X-Title": "John Helldiver - Trend Predict",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3-8b-instruct:free",
        messages: [
          {
            role: "system",
            content:
              "Tu es John Helldiver. Analyse ces titres de news gaming et identifie les sujets potentiellement viraux. Réponds en français, sois concis (3-5 lignes).",
          },
          {
            role: "user",
            content: `Analyse ces ${notifications.length} titres récents et identifie les sujets viraux émergents:\n\n${titles.slice(0, 2000)}`,
          },
        ],
        max_tokens: 300,
        temperature: 0.6,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return;
    const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
    const analysis = data.choices?.[0]?.message?.content?.trim() || "Analyse indisponible.";

    const logChannelId = config.gamingBlogChannel || config.logChannel;
    if (logChannelId) {
      const channel = await client.channels.fetch(logChannelId).catch(() => null);
      if (channel?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setColor(0xff6b35)
          .setTitle("🔮 Prédiction Tendances Virales (6h)")
          .setDescription(analysis.slice(0, 2000))
          .addFields({
            name: "Notifications analysées",
            value: `${notifications.length}`,
            inline: true,
          })
          .setTimestamp()
          .setFooter({ text: "CRON-26 — IA prédictive" });
        await (channel as TextChannel).send({ embeds: [embed] });
      }
    }
  } catch (error) {
    logger.error("[CmdAuto] Trend predict error:", error);
  }
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

let trendCron: ScheduledTask | null = null;
let scraperCron: ScheduledTask | null = null;
let sourceStatsCron: ScheduledTask | null = null;
let securityCron: ScheduledTask | null = null;
let cmdStatsCron: ScheduledTask | null = null;
let trendPredictCron: ScheduledTask | null = null;

export function startCommandAutomation(client: Client): void {
  // Trend report — toutes les 6h
  trendCron = cron.schedule("0 */6 * * *", () => {
    runTrendReport(client).catch((err) => logger.error("[CmdAuto] Trend error:", err));
  });

  // Scraper status — quotidien 06:00
  scraperCron = cron.schedule("0 6 * * *", () => {
    runScraperStatus(client).catch((err) => logger.error("[CmdAuto] Scraper error:", err));
  });

  // Source stats — hebdo lundi 09:00
  sourceStatsCron = cron.schedule("0 9 * * 1", () => {
    runSourceStats(client).catch((err) => logger.error("[CmdAuto] SourceStats error:", err));
  });

  // Security audit — hebdo dimanche 23:00
  securityCron = cron.schedule("0 23 * * 0", () => {
    runSecurityAudit(client).catch((err) => logger.error("[CmdAuto] SecurityAudit error:", err));
  });

  // Command stats report — quotidien 23:59
  cmdStatsCron = cron.schedule("59 23 * * *", () => {
    runCommandStatsReport(client).catch((err) => logger.error("[CmdAuto] CmdStats error:", err));
  });

  // Trend predict IA — toutes les 6h (décalé de 30min vs trend report)
  trendPredictCron = cron.schedule("30 */6 * * *", () => {
    runTrendPredict(client).catch((err) => logger.error("[CmdAuto] TrendPredict error:", err));
  });

  // Event handlers
  handleAutoSnipe(client);
  handleAutoDebug(client);

  logger.info(
    "[CmdAuto] Automatisation activée: trend(6h), scraper(06h), sourceStats(lun), securityAudit(dim), snipe(event), debug(event), cmdStats(23h59), trendPredict(6h30)",
  );
}

export function stopCommandAutomation(): void {
  trendCron?.stop();
  scraperCron?.stop();
  sourceStatsCron?.stop();
  securityCron?.stop();
  cmdStatsCron?.stop();
  trendPredictCron?.stop();
  trendCron = null;
  scraperCron = null;
  sourceStatsCron = null;
  securityCron = null;
  cmdStatsCron = null;
  trendPredictCron = null;
}
