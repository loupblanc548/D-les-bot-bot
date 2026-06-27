import logger from "../utils/logger.js";
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  TextChannel,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { config } from "../config.js";
import { requireAdmin } from "../services/permissions.js";
import prisma from "../prisma.js";
import { viralDetectionService } from "../services/viral-detection.js";
import { reportGeneratorService } from "../services/report-generator.js";
import { trendDetectionService } from "../services/trend-detection.js";
import {
  enableSmartAlerts,
  disableSmartAlerts,
  flushAlertBuffer,
  getBufferStats,
} from "../utils/smart-alerts.js";

// Track active intervals for disable functionality
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let viralMonitoringActive = false;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let autoReportingActive: "daily" | "weekly" | "monthly" | null = null;

const FOOTER = { text: "Système de Surveillance • Advanced" };

function requireLogChannel(interaction: ChatInputCommandInteraction): boolean {
  if (!config.logChannel) {
    interaction
      .reply({
        content: "❌ Salon de logs non configuré. Ajoutez LOG_CHANNEL_ID dans le .env",
        flags: [MessageFlags.Ephemeral],
      })
      .catch(() => {});
    return false;
  }
  return true;
}

export const commands = [
  // /deals-history
  new SlashCommandBuilder()
    .setName("deals-history")
    .setDescription("Historique des deals détectés sur X jours")
    .addStringOption((o) =>
      o
        .setName("plateforme")
        .setDescription("Filtrer par plateforme")
        .setRequired(false)
        .addChoices(
          { name: "Steam", value: "steam" },
          { name: "Epic Games", value: "epic" },
          { name: "Instant Gaming", value: "instantgaming" },
          { name: "Toutes", value: "all" },
        ),
    )
    .addIntegerOption((o) =>
      o
        .setName("jours")
        .setDescription("Nombre de jours d'historique (défaut: 7)")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(90),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),

  // /price-track
  new SlashCommandBuilder()
    .setName("price-track")
    .setDescription("Suit le prix d'un jeu et alerte quand il baisse")
    .addStringOption((o) =>
      o.setName("jeu").setDescription("Nom du jeu à suivre").setRequired(true),
    )
    .addNumberOption((o) =>
      o
        .setName("prix_max")
        .setDescription("Prix maximum pour déclencher une alerte (€)")
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),

  // /scraper-status
  new SlashCommandBuilder()
    .setName("scraper-status")
    .setDescription("Statut en temps réel des scrapers (Playwright)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),

  // /source-stats
  new SlashCommandBuilder()
    .setName("source-stats")
    .setDescription("Statistiques par source (notifications, activité, succès)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),

  // /trend-report
  new SlashCommandBuilder()
    .setName("trend-report")
    .setDescription("Rapport de tendances gaming de la semaine")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),

  // /viral-alert
  new SlashCommandBuilder()
    .setName("viral-alert")
    .setDescription("Configure une alerte quand un sujet devient viral")
    .addStringOption((o) =>
      o
        .setName("action")
        .setDescription("Action")
        .setRequired(true)
        .addChoices(
          { name: "Activer", value: "on" },
          { name: "Désactiver", value: "off" },
          { name: "Statut", value: "status" },
          { name: "Liste contenu viral", value: "list" },
        ),
    )
    .addIntegerOption((o) =>
      o
        .setName("seuil")
        .setDescription("Score viral minimum (0-100, défaut: 70)")
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(100),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),

  // /auto-report
  new SlashCommandBuilder()
    .setName("auto-report")
    .setDescription("Active/désactive les rapports automatiques (daily/weekly/monthly)")
    .addStringOption((o) =>
      o
        .setName("action")
        .setDescription("Action")
        .setRequired(true)
        .addChoices(
          { name: "Activer rapport quotidien", value: "daily_on" },
          { name: "Activer rapport hebdo", value: "weekly_on" },
          { name: "Activer rapport mensuel", value: "monthly_on" },
          { name: "Désactiver", value: "off" },
          { name: "Générer maintenant", value: "now" },
          { name: "Statut", value: "status" },
        ),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),

  // /cooldown-config
  new SlashCommandBuilder()
    .setName("cooldown-config")
    .setDescription("Configure les cooldowns par commande (admin, salon logs uniquement)")
    .addStringOption((o) =>
      o.setName("commande").setDescription("Nom de la commande").setRequired(true),
    )
    .addIntegerOption((o) =>
      o
        .setName("secondes")
        .setDescription("Cooldown en secondes (0 = désactivé)")
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(3600),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),

  // /smart-alerts
  new SlashCommandBuilder()
    .setName("smart-alerts")
    .setDescription("Gère les alertes groupées intelligentes (salon logs uniquement)")
    .addStringOption((o) =>
      o
        .setName("action")
        .setDescription("Action")
        .setRequired(true)
        .addChoices(
          { name: "Activer", value: "on" },
          { name: "Désactiver", value: "off" },
          { name: "Flush immédiat", value: "flush" },
          { name: "Statut", value: "status" },
        ),
    )
    .addIntegerOption((o) =>
      o
        .setName("intervalle")
        .setDescription("Intervalle en secondes (défaut: 10)")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(300),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),

  // /fortnite-wishlist
  new SlashCommandBuilder()
    .setName("fortnite-wishlist")
    .setDescription("Gère ta wishlist Fortnite (DM avec ton identifiant)")
    .addStringOption((o) =>
      o
        .setName("action")
        .setDescription("Action")
        .setRequired(true)
        .addChoices(
          { name: "Ajouter un item", value: "add" },
          { name: "Retirer un item", value: "remove" },
          { name: "Lister ma wishlist", value: "list" },
          { name: "Vider ma wishlist", value: "clear" },
        ),
    )
    .addStringOption((o) =>
      o
        .setName("identifiant")
        .setDescription("Ton identifiant Fortnite ou @pseudo (requis pour add/remove)")
        .setRequired(false),
    )
    .toJSON(),

  // /retro-config
  new SlashCommandBuilder()
    .setName("retro-config")
    .setDescription("Configure la rétrospective automatique (salon logs uniquement)")
    .addStringOption((o) =>
      o
        .setName("action")
        .setDescription("Action")
        .setRequired(true)
        .addChoices(
          { name: "Définir intervalle", value: "interval" },
          { name: "Définir max posts", value: "maxposts" },
          { name: "Statut", value: "status" },
        ),
    )
    .addIntegerOption((o) =>
      o
        .setName("valeur")
        .setDescription("Valeur (intervalle en min, ou nombre max de posts)")
        .setRequired(false)
        .setMinValue(1),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),
];

export async function handleCommand(
  interaction: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  try {
    switch (interaction.commandName) {
      case "deals-history":
        await handleDealsHistory(interaction, client);
        break;
      case "price-track":
        await handlePriceTrack(interaction, client);
        break;
      case "scraper-status":
        await handleScraperStatus(interaction, client);
        break;
      case "source-stats":
        await handleSourceStats(interaction, client);
        break;
      case "trend-report":
        await handleTrendReport(interaction, client);
        break;
      case "viral-alert":
        await handleViralAlert(interaction, client);
        break;
      case "auto-report":
        await handleAutoReport(interaction, client);
        break;
      case "cooldown-config":
        await handleCooldownConfig(interaction);
        break;
      case "smart-alerts":
        await handleSmartAlerts(interaction, client);
        break;
      case "fortnite-wishlist":
        await handleFortniteWishlist(interaction);
        break;
      case "retro-config":
        await handleRetroConfig(interaction);
        break;
    }
  } catch (err) {
    logger.error(`[Advanced] Erreur ${interaction.commandName}:`, err);
    const errorEmbed = new EmbedBuilder()
      .setColor(0xff3344)
      .setDescription("Une erreur est survenue.");
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], flags: [MessageFlags.Ephemeral] });
      }
    } catch {
      /* ignore */
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function sendToChannel(
  client: Client,
  channelId: string,
  embed: EmbedBuilder,
): Promise<boolean> {
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel instanceof TextChannel) {
      await channel.send({ embeds: [embed] });
      return true;
    }
  } catch (err) {
    logger.error(`[Advanced] Erreur envoi salon ${channelId}:`, err);
  }
  return false;
}

// ─── /deals-history ──────────────────────────────────────────────────────────

async function handleDealsHistory(
  interaction: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  if (!(await requireAdmin(interaction))) return;
  await interaction.deferReply({ ephemeral: true });

  const plateforme = interaction.options.getString("plateforme") || "all";
  const jours = interaction.options.getInteger("jours") || 7;
  const since = new Date(Date.now() - jours * 24 * 60 * 60 * 1000);

  try {
    const notifications = await prisma.notification.findMany({
      where: {
        sentAt: { gte: since },
        ...(plateforme !== "all" && { platform: plateforme as any }),
      },
      orderBy: { sentAt: "desc" },
      take: 50,
    });

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`📊 Historique des deals (${jours}j)`)
      .setFooter(FOOTER)
      .setTimestamp();

    if (notifications.length === 0) {
      embed.setDescription("Aucun deal trouvé sur cette période.");
    } else {
      const grouped = new Map<string, number>();
      for (const n of notifications) {
        const key = n.platform || "inconnu";
        grouped.set(key, (grouped.get(key) || 0) + 1);
      }
      embed.setDescription(`**${notifications.length} deals** trouvés sur ${jours} jours`);
      for (const [platform, count] of grouped) {
        embed.addFields({ name: platform, value: `${count} deals`, inline: true });
      }
      const recent = notifications.slice(0, 5);
      embed.addFields({
        name: "Derniers deals",
        value: recent
          .map((n) => `• ${n.content?.slice(0, 60) || "Sans contenu"} — ${n.url || "N/A"}`)
          .join("\n"),
        inline: false,
      });
    }

    // Envoyer dans le salon dédié aux deals
    const targetChannel = config.dealsChannel || config.steamEpicChannel;
    if (targetChannel) {
      await sendToChannel(client, targetChannel, embed);
      await interaction.editReply({
        content: `✅ Historique envoyé dans <#${targetChannel}>`,
      });
    } else {
      await interaction.editReply({ embeds: [embed] });
    }
  } catch (err) {
    logger.error("[Advanced] deals-history:", err);
    await interaction.editReply({ content: "❌ Erreur lors de la récupération des deals." });
  }
}

// ─── /price-track ────────────────────────────────────────────────────────────

async function handlePriceTrack(
  interaction: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  if (!(await requireAdmin(interaction))) return;
  await interaction.deferReply({ ephemeral: true });

  const jeu = interaction.options.getString("jeu", true);
  const prixMax = interaction.options.getNumber("prix_max");

  try {
    // Stocker le suivi dans la DB
    const existing = await prisma.source.findFirst({
      where: { urlOrHandle: `price-track:${jeu.toLowerCase()}`, type: "PRICE_TRACK" },
    });
    if (existing) {
      await prisma.source.update({
        where: { id: existing.id },
        data: { lastProcessedId: prixMax ? String(prixMax) : null },
      });
    } else {
      await prisma.source.create({
        data: {
          guildId: interaction.guildId || "global",
          channelId: config.priceTrackChannel || config.dealsChannel || "",
          type: "PRICE_TRACK",
          urlOrHandle: `price-track:${jeu.toLowerCase()}`,
          lastProcessedId: prixMax ? String(prixMax) : null,
        },
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("💰 Suivi de prix activé")
      .setDescription(`Le jeu **${jeu}** est maintenant suivi.`)
      .addFields(
        { name: "Jeu", value: jeu, inline: true },
        ...(prixMax ? [{ name: "Alerte si prix ≤", value: `${prixMax}€`, inline: true }] : []),
      )
      .setFooter(FOOTER)
      .setTimestamp();

    const targetChannel = config.priceTrackChannel || config.dealsChannel;
    if (targetChannel) {
      await sendToChannel(client, targetChannel, embed);
      await interaction.editReply({
        content: `✅ Suivi activé pour **${jeu}**. Les alertes seront envoyées dans <#${targetChannel}>.`,
      });
    } else {
      await interaction.editReply({
        content: `✅ Suivi activé pour **${jeu}**. ⚠️ Configurez PRICE_TRACK_CHANNEL_ID ou DEALS_CHANNEL_ID pour recevoir les alertes.`,
      });
    }
  } catch (err) {
    logger.error("[Advanced] price-track:", err);
    await interaction.editReply({ content: "❌ Erreur lors de l'activation du suivi." });
  }
}

// ─── /scraper-status ─────────────────────────────────────────────────────────

async function handleScraperStatus(
  interaction: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  if (!(await requireAdmin(interaction))) return;
  await interaction.deferReply({ ephemeral: true });

  try {
    const sources = await prisma.source.findMany({
      select: { type: true, urlOrHandle: true, lastProcessedId: true, priority: true },
    });

    const byType = new Map<string, { total: number; active: number; paused: number }>();
    for (const s of sources) {
      const key = s.type || "inconnu";
      const entry = byType.get(key) || { total: 0, active: 0, paused: 0 };
      entry.total++;
      if (s.priority < 0) entry.paused++;
      else entry.active++;
      byType.set(key, entry);
    }

    const embed = new EmbedBuilder()
      .setColor(0x2f3136)
      .setTitle("🔧 Statut des scrapers")
      .setDescription(
        `**${sources.length} sources** au total — Playwright actif\n` +
          `Browser: ${process.env.NODE_ENV === "production" ? "headless" : "headed"}`,
      )
      .setFooter(FOOTER)
      .setTimestamp();

    for (const [type, stats] of byType) {
      embed.addFields({
        name: type,
        value: `Total: ${stats.total} | Actif: ${stats.active} | En pause: ${stats.paused}`,
        inline: true,
      });
    }

    // Envoyer dans le salon de logs
    if (config.logChannel) {
      await sendToChannel(client, config.logChannel, embed);
      await interaction.editReply({ content: `✅ Statut envoyé dans <#${config.logChannel}>` });
    } else {
      await interaction.editReply({ embeds: [embed] });
    }
  } catch (err) {
    logger.error("[Advanced] scraper-status:", err);
    await interaction.editReply({ content: "❌ Erreur lors de la récupération du statut." });
  }
}

// ─── /source-stats ───────────────────────────────────────────────────────────

async function handleSourceStats(
  interaction: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  if (!(await requireAdmin(interaction))) return;
  await interaction.deferReply({ ephemeral: true });

  try {
    const sources = await prisma.source.findMany({
      select: {
        type: true,
        urlOrHandle: true,
        channelId: true,
        priority: true,
        lastProcessedId: true,
      },
    });

    const notifCounts = await prisma.notification.groupBy({
      by: ["platform"],
      _count: true,
    });

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("📈 Statistiques par source")
      .setFooter(FOOTER)
      .setTimestamp();

    if (sources.length === 0) {
      embed.setDescription("Aucune source configurée.");
    } else {
      embed.setDescription(`**${sources.length} sources** surveillées`);
      for (const src of sources.slice(0, 10)) {
        const notifCount = notifCounts.find((n) => n.platform === src.type)?._count || 0;
        embed.addFields({
          name: `${src.type} — ${src.urlOrHandle.slice(0, 30)}`,
          value: `Notifications: ${notifCount} | ${src.priority < 0 ? "⏸️ En pause" : "✅ Actif"}`,
          inline: false,
        });
      }
    }

    if (config.logChannel) {
      await sendToChannel(client, config.logChannel, embed);
      await interaction.editReply({ content: `✅ Stats envoyées dans <#${config.logChannel}>` });
    } else {
      await interaction.editReply({ embeds: [embed] });
    }
  } catch (err) {
    logger.error("[Advanced] source-stats:", err);
    await interaction.editReply({ content: "❌ Erreur lors de la récupération des stats." });
  }
}

// ─── /trend-report ───────────────────────────────────────────────────────────

async function handleTrendReport(
  interaction: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  if (!(await requireAdmin(interaction))) return;
  await interaction.deferReply({ ephemeral: true });

  try {
    const trends = trendDetectionService.getCurrentTrends(15);
    const fastGrowing = trendDetectionService.getFastGrowingTrends(50);
    const globalStats = trendDetectionService.getGlobalStats();

    const embed = new EmbedBuilder()
      .setColor(0xfaa61a)
      .setTitle("📈 Rapport de tendances gaming")
      .setDescription(
        `**${globalStats.totalTrends} tendances** détectées\n` +
          `Croissance moyenne: ${globalStats.averageGrowthRate.toFixed(1)}%\n` +
          `Top mots-clés: ${globalStats.topKeywords.slice(0, 5).join(", ")}`,
      )
      .setFooter(FOOTER)
      .setTimestamp();

    if (trends.length > 0) {
      embed.addFields({
        name: "🔥 Top tendances",
        value: trends
          .slice(0, 10)
          .map((t) => `• **${t.keyword}** — ${t.mentions} mentions (+${t.growthRate.toFixed(0)}%)`)
          .join("\n"),
        inline: false,
      });
    }

    if (fastGrowing.length > 0) {
      embed.addFields({
        name: "🚀 Croissance rapide",
        value: fastGrowing
          .slice(0, 5)
          .map((t) => `• **${t.keyword}** — +${t.growthRate.toFixed(0)}%`)
          .join("\n"),
        inline: false,
      });
    }

    const targetChannel = config.trendsChannel || config.gamingBlogChannel;
    if (targetChannel) {
      await sendToChannel(client, targetChannel, embed);
      await interaction.editReply({
        content: `✅ Rapport envoyé dans <#${targetChannel}>`,
      });
    } else {
      await interaction.editReply({ embeds: [embed] });
    }
  } catch (err) {
    logger.error("[Advanced] trend-report:", err);
    await interaction.editReply({ content: "❌ Erreur lors de la génération du rapport." });
  }
}

// ─── /viral-alert ────────────────────────────────────────────────────────────

async function handleViralAlert(
  interaction: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  if (!(await requireAdmin(interaction))) return;
  await interaction.deferReply({ ephemeral: true });

  const action = interaction.options.getString("action", true);
  const seuil = interaction.options.getInteger("seuil") || 70;

  try {
    switch (action) {
      case "on": {
        const feedUrls = [
          config.redditDealsRss,
          config.redditPatchNotesRss,
          config.steamRss,
        ].filter(Boolean) as string[];
        viralDetectionService.enableMonitoring(feedUrls, 3600000);
        viralMonitoringActive = true;
        await interaction.editReply({
          content: `✅ Surveillance virale activée (seuil: ${seuil}). Alertes dans ${
            config.viralChannel ? `<#${config.viralChannel}>` : "le salon dédié"
          }.`,
        });
        break;
      }
      case "off":
        viralMonitoringActive = false;
        await interaction.editReply({ content: "✅ Surveillance virale désactivée." });
        break;
      case "status": {
        const stats = viralDetectionService.getCacheStats();
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("🦠 Statut surveillance virale")
          .setDescription(
            `Contenu total: ${stats.totalContent}\n` +
              `Contenu viral: ${stats.viralContent}\n` +
              `Score moyen: ${stats.averageViralScore.toFixed(1)}`,
          )
          .setFooter(FOOTER)
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
        break;
      }
      case "list": {
        const viral = viralDetectionService.getAllViralContent(seuil);
        const embed = new EmbedBuilder()
          .setColor(0xfaa61a)
          .setTitle(`🦠 Contenu viral (seuil: ${seuil})`)
          .setFooter(FOOTER)
          .setTimestamp();

        if (viral.length === 0) {
          embed.setDescription("Aucun contenu viral détecté.");
        } else {
          embed.setDescription(
            viral
              .slice(0, 10)
              .map((v) => `• **${v.title?.slice(0, 50)}** — Score: ${v.viralScore} (${v.platform})`)
              .join("\n"),
          );
        }

        const targetChannel = config.viralChannel;
        if (targetChannel) {
          await sendToChannel(client, targetChannel, embed);
          await interaction.editReply({
            content: `✅ Liste envoyée dans <#${targetChannel}>`,
          });
        } else {
          await interaction.editReply({ embeds: [embed] });
        }
        break;
      }
    }
  } catch (err) {
    logger.error("[Advanced] viral-alert:", err);
    await interaction.editReply({ content: "❌ Erreur lors de la gestion virale." });
  }
}

// ─── /auto-report ────────────────────────────────────────────────────────────

async function handleAutoReport(
  interaction: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  if (!(await requireAdmin(interaction))) return;
  await interaction.deferReply({ ephemeral: true });

  const action = interaction.options.getString("action", true);

  try {
    switch (action) {
      case "daily_on":
        reportGeneratorService.enableAutoReporting(client, "daily");
        autoReportingActive = "daily";
        await interaction.editReply({
          content: "✅ Rapport quotidien activé. Envoi dans le salon de logs.",
        });
        break;
      case "weekly_on":
        reportGeneratorService.enableAutoReporting(client, "weekly");
        autoReportingActive = "weekly";
        await interaction.editReply({
          content: "✅ Rapport hebdomadaire activé. Envoi dans le salon de logs.",
        });
        break;
      case "monthly_on":
        reportGeneratorService.enableAutoReporting(client, "monthly");
        autoReportingActive = "monthly";
        await interaction.editReply({
          content: "✅ Rapport mensuel activé. Envoi dans le salon de logs.",
        });
        break;
      case "off":
        autoReportingActive = null;
        await interaction.editReply({ content: "✅ Rapports automatiques désactivés." });
        break;
      case "now": {
        const report = await reportGeneratorService.generateDailyReport(client);
        await reportGeneratorService.sendReport(client, report);
        await interaction.editReply({
          content: "✅ Rapport généré et envoyé dans le salon de logs.",
        });
        break;
      }
      case "status": {
        const cached = reportGeneratorService.getCachedReport("daily", new Date());
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("📋 Statut des rapports automatiques")
          .setDescription(
            `Rapport quotidien en cache: ${cached ? "✅" : "❌"}\n` +
              `Salon de destination: ${config.logChannel ? `<#${config.logChannel}>` : "non configuré"}`,
          )
          .setFooter(FOOTER)
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
        break;
      }
    }
  } catch (err) {
    logger.error("[Advanced] auto-report:", err);
    await interaction.editReply({ content: "❌ Erreur lors de la gestion des rapports." });
  }
}

// ─── /cooldown-config ────────────────────────────────────────────────────────

async function handleCooldownConfig(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!(await requireAdmin(interaction))) return;

  // Cette commande doit être utilisée uniquement dans le salon de logs
  if (!requireLogChannel(interaction)) return;
  if (config.logChannel && interaction.channelId !== config.logChannel) {
    await interaction.reply({
      content: `❌ Cette commande doit être utilisée dans <#${config.logChannel}>`,
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const commande = interaction.options.getString("commande", true);
  const secondes = interaction.options.getInteger("secondes", true);

  try {
    // Stocker le cooldown dans la DB (table Setting)
    await prisma.setting.upsert({
      where: {
        guildId_key: {
          guildId: interaction.guildId || "global",
          key: `cooldown:${commande}`,
        },
      },
      update: { value: String(secondes) },
      create: {
        guildId: interaction.guildId || "global",
        key: `cooldown:${commande}`,
        value: String(secondes),
      },
    });

    await interaction.editReply({
      content: `✅ Cooldown pour **${commande}** défini sur **${secondes}s**.`,
    });
  } catch (err) {
    logger.error("[Advanced] cooldown-config:", err);
    await interaction.editReply({ content: "❌ Erreur lors de la configuration du cooldown." });
  }
}

// ─── /smart-alerts ───────────────────────────────────────────────────────────

async function handleSmartAlerts(
  interaction: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  if (!(await requireAdmin(interaction))) return;

  // Doit être utilisé dans le salon de logs
  if (!requireLogChannel(interaction)) return;
  if (config.logChannel && interaction.channelId !== config.logChannel) {
    await interaction.reply({
      content: `❌ Cette commande doit être utilisée dans <#${config.logChannel}>`,
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const action = interaction.options.getString("action", true);
  const intervalle = interaction.options.getInteger("intervalle") || 10;

  try {
    switch (action) {
      case "on":
        enableSmartAlerts(client, intervalle * 1000);
        await interaction.editReply({
          content: `✅ Alertes groupées intelligentes activées (intervalle: ${intervalle}s).`,
        });
        break;
      case "off":
        disableSmartAlerts();
        await interaction.editReply({ content: "✅ Alertes groupées désactivées." });
        break;
      case "flush":
        await flushAlertBuffer(client);
        await interaction.editReply({ content: "✅ Flush du buffer d'alertes effectué." });
        break;
      case "status": {
        const stats = getBufferStats();
        const keys = Object.keys(stats);
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("🔔 Statut des alertes groupées")
          .setDescription(
            `Alertes en buffer: ${keys.length}\n` +
              keys
                .slice(0, 5)
                .map((k) => `• ${k}: ${stats[k].messages.length} messages`)
                .join("\n"),
          )
          .setFooter(FOOTER)
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
        break;
      }
    }
  } catch (err) {
    logger.error("[Advanced] smart-alerts:", err);
    await interaction.editReply({ content: "❌ Erreur lors de la gestion des alertes." });
  }
}

// ─── /fortnite-wishlist ──────────────────────────────────────────────────────

async function handleFortniteWishlist(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const action = interaction.options.getString("action", true);
  const identifiant = interaction.options.getString("identifiant");
  const userId = interaction.user.id;

  try {
    switch (action) {
      case "add": {
        if (!identifiant) {
          await interaction.editReply({
            content: "❌ Vous devez fournir votre identifiant Fortnite ou @pseudo.",
          });
          return;
        }
        // Stocker la wishlist dans la DB
        // Stocker la wishlist via la table Setting
        await prisma.setting.create({
          data: {
            guildId: interaction.guildId || "global",
            key: `fortnite-wishlist:${userId}:${identifiant}`,
            value: identifiant,
          },
        });

        // Envoyer un DM à l'utilisateur
        try {
          const dmChannel = await interaction.user.createDM();
          await dmChannel.send({
            embeds: [
              new EmbedBuilder()
                .setColor(0x9b59b6)
                .setTitle("🎮 Wishlist Fortnite mise à jour")
                .setDescription(`**${identifiant}** ajouté à ta wishlist.`)
                .setFooter(FOOTER)
                .setTimestamp(),
            ],
          });
        } catch {
          // DM peut échouer si les DMs sont fermés
        }

        await interaction.editReply({
          content: `✅ **${identifiant}** ajouté à ta wishlist. Tu recevras des DMs quand l'item sera disponible.`,
        });
        break;
      }
      case "remove": {
        if (!identifiant) {
          await interaction.editReply({
            content: "❌ Vous devez fournir l'identifiant de l'item à retirer.",
          });
          return;
        }
        await prisma.setting.deleteMany({
          where: {
            guildId: interaction.guildId || "global",
            key: { startsWith: `fortnite-wishlist:${userId}:${identifiant}` },
          },
        });
        await interaction.editReply({
          content: `✅ **${identifiant}** retiré de ta wishlist.`,
        });
        break;
      }
      case "list": {
        const items = await prisma.setting.findMany({
          where: {
            guildId: interaction.guildId || "global",
            key: { startsWith: `fortnite-wishlist:${userId}:` },
          },
        });
        const embed = new EmbedBuilder()
          .setColor(0x9b59b6)
          .setTitle("🎮 Ta wishlist Fortnite")
          .setFooter(FOOTER)
          .setTimestamp();

        if (items.length === 0) {
          embed.setDescription(
            "Ta wishlist est vide. Utilise `/fortnite-wishlist add` pour ajouter des items.",
          );
        } else {
          embed.setDescription(items.map((i) => `• ${i.value}`).join("\n"));
        }
        await interaction.editReply({ embeds: [embed] });
        break;
      }
      case "clear": {
        await prisma.setting.deleteMany({
          where: {
            guildId: interaction.guildId || "global",
            key: { startsWith: `fortnite-wishlist:${userId}:` },
          },
        });
        await interaction.editReply({ content: "✅ Ta wishlist a été vidée." });
        break;
      }
    }
  } catch (err) {
    logger.error("[Advanced] fortnite-wishlist:", err);
    await interaction.editReply({ content: "❌ Erreur lors de la gestion de la wishlist." });
  }
}

// ─── /retro-config ───────────────────────────────────────────────────────────

async function handleRetroConfig(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!(await requireAdmin(interaction))) return;

  // Doit être utilisé dans le salon de logs
  if (!requireLogChannel(interaction)) return;
  if (config.logChannel && interaction.channelId !== config.logChannel) {
    await interaction.reply({
      content: `❌ Cette commande doit être utilisée dans <#${config.logChannel}>`,
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const action = interaction.options.getString("action", true);
  const valeur = interaction.options.getInteger("valeur");

  try {
    switch (action) {
      case "interval": {
        if (!valeur) {
          await interaction.editReply({ content: "❌ Vous devez fournir une valeur en minutes." });
          return;
        }
        await prisma.guildConfig.upsert({
          where: { guildId: interaction.guildId || "global" },
          update: { monitoringIntervalMs: valeur * 60 * 1000 },
          create: {
            guildId: interaction.guildId || "global",
            monitoringIntervalMs: valeur * 60 * 1000,
          },
        });
        await interaction.editReply({
          content: `✅ Intervalle de rétrospective défini sur **${valeur} minutes**.`,
        });
        break;
      }
      case "maxposts": {
        if (!valeur) {
          await interaction.editReply({ content: "❌ Vous devez fournir un nombre max de posts." });
          return;
        }
        await prisma.guildConfig.upsert({
          where: { guildId: interaction.guildId || "global" },
          update: { maxRetroPosts: valeur },
          create: {
            guildId: interaction.guildId || "global",
            maxRetroPosts: valeur,
          },
        });
        await interaction.editReply({
          content: `✅ Nombre max de posts rétro défini sur **${valeur}**.`,
        });
        break;
      }
      case "status": {
        const gc = await prisma.guildConfig.findUnique({
          where: { guildId: interaction.guildId || "global" },
        });
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("⏪ Configuration rétrospective")
          .setDescription(
            `Intervalle: ${gc?.monitoringIntervalMs ? `${Math.round(gc.monitoringIntervalMs / 60000)} min` : "défaut (5 min)"}\n` +
              `Max posts: ${gc?.maxRetroPosts || config.maxRetroPosts || 25}`,
          )
          .setFooter(FOOTER)
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
        break;
      }
    }
  } catch (err) {
    logger.error("[Advanced] retro-config:", err);
    await interaction.editReply({ content: "❌ Erreur lors de la configuration rétro." });
  }
}
