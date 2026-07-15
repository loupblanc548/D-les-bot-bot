import logger from "../utils/logger.js";
import {
  MessageFlags,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Client,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from "discord.js";
import prisma from "../prisma.js";
import { config } from "../config.js";
import { requireAdmin } from "../services/permissions.js";
import { getLogs } from "../services/logs.js";
import { runStartupRetrospective } from "../services/feeds.js";
import { runDbSourcesRetrospective } from "../services/monitor.js";
import { CATEGORIES, type Category } from "./helpCategories.js";

const FOOTER = { text: "Shadow Broker • Intelligence System" };

export type { Category };
export { CATEGORIES };

async function handleStart(interaction: ChatInputCommandInteraction, client: Client) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const sourcesCount = (await prisma.source.count()) || 0;
    await interaction.editReply({
      content:
        "🟢 **Bot opérationnel**\n" +
        "• Version : **1.0.0**\n" +
        "• Latence : **" +
        client.ws.ping +
        "ms**\n" +
        "• Sources : **" +
        sourcesCount +
        "** surveillée(s)\n" +
        "• Services : Discord.js + Prisma + OpenRouter IA\n" +
        "• " +
        (config.adminRoles.length > 0
          ? "🟢 Rôles admin configurés"
          : "🟡 Rôles admin non configurés"),
    });
  } catch (error) {
    logger.error("[CRASH COMMANDE START]:", error);
    try {
      await interaction.editReply({ content: "❌ Erreur lors de l'initialisation." });
    } catch (err) {
      logger.warn("[Main] Erreur followUp:", String(err));
    }
  }
}

async function handleHelp(interaction: ChatInputCommandInteraction) {
  try {
    const categoryOptions = CATEGORIES.map((cat) => ({
      label: `${cat.emoji} ${cat.name}`,
      description: cat.description,
      value: cat.id,
    }));

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("help_category_select")
      .setPlaceholder("Sélectionnez une catégorie...")
      .addOptions(categoryOptions);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    const embed = new EmbedBuilder()
      .setTitle("📚 Commandes du Bot")
      .setColor(0x00ff41)
      .setDescription("Sélectionnez une catégorie ci-dessous pour voir les commandes disponibles.")
      .addFields({
        name: "📊 Statistiques",
        value: `**${CATEGORIES.length} catégories** • **${CATEGORIES.reduce((acc, cat) => acc + cat.commands.split("\n").length, 0)} commandes**`,
        inline: false,
      })
      .setFooter(FOOTER)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed], components: [row] });
  } catch (error) {
    logger.error("[CRASH COMMANDE HELP]:", error);
    try {
      await interaction.editReply({ content: "❌ Erreur lors de l'affichage de l'aide." });
    } catch (err) {
      logger.warn("[Main] Erreur followUp:", String(err));
    }
  }
}

async function handleCategorySelect(interaction: StringSelectMenuInteraction) {
  const categoryId = interaction.values[0];
  const category = CATEGORIES.find((cat) => cat.id === categoryId);

  if (!category) {
    await interaction.update({ content: "Catégorie introuvable.", components: [] });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`${category.emoji} ${category.name}`)
    .setColor(0x00ff41)
    .setDescription(category.description)
    .addFields({
      name: "Commandes",
      value: category.commands,
      inline: false,
    })
    .setFooter(FOOTER)
    .setTimestamp();

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId("help_category_select")
    .setPlaceholder("Sélectionnez une catégorie...")
    .addOptions(
      CATEGORIES.map((cat) => ({
        label: `${cat.emoji} ${cat.name}`,
        description: cat.description,
        value: cat.id,
      })),
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  await interaction.update({ embeds: [embed], components: [row] });
}

async function handleStatus(interaction: ChatInputCommandInteraction, client: Client) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const sourcesCount = await prisma.source.count();
    const logsCount = await prisma.log.count();
    const warningsCount = await prisma.sanction.count({ where: { type: "WARN" } });
    const lastLogs = await getLogs(5);
    const lastScans =
      lastLogs.map((l) => "• " + l.type + " — " + l.action).join("\n") || "Aucune activité récente";
    const uptimeMin = Math.floor(process.uptime() / 60);
    const uptimeStr =
      uptimeMin < 60
        ? uptimeMin + " min"
        : Math.floor(uptimeMin / 60) + "h " + (uptimeMin % 60) + "min";

    const embed = new EmbedBuilder()
      .setTitle("📡 Statut Système")
      .setColor(0x53fc18)
      .addFields(
        { name: "🟢 Statut", value: "En ligne", inline: true },
        { name: "📡 Latence", value: client.ws.ping + "ms", inline: true },
        { name: "⏰ Uptime", value: uptimeStr, inline: true },
        { name: "📅 Sources", value: sourcesCount.toString(), inline: true },
        { name: "📋 Logs", value: logsCount.toString(), inline: true },
        { name: "⚠️ Warns", value: warningsCount.toString(), inline: true },
        { name: "📝 Dernières actions", value: lastScans, inline: false },
      )
      .setFooter(FOOTER)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[CRASH COMMANDE STATUS]:", error);
    try {
      await interaction.editReply({ content: "❌ Erreur lors de l'affichage du statut." });
    } catch (err) {
      logger.warn("[Main] Erreur followUp:", String(err));
    }
  }
}

async function handleRestart(interaction: ChatInputCommandInteraction, _client: Client) {
  if (!(await requireAdmin(interaction))) return;
  await interaction.deferReply({ ephemeral: true });
  try {
    logger.info("Redémarrage demandé par", interaction.user.tag);
    await interaction.editReply({ content: "🔄 Redémarrage du bot en cours..." });
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  } catch (error) {
    logger.error("[CRASH COMMANDE RESTART]:", error);
    try {
      await interaction.editReply({ content: "❌ Erreur lors du redémarrage." });
    } catch (err) {
      logger.warn("[Main] Erreur followUp:", String(err));
    }
  }
}

async function handleRetro(interaction: ChatInputCommandInteraction, client: Client) {
  if (!(await requireAdmin(interaction))) return;
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const recentLogs = await prisma.log.findMany({
    where: { createdAt: { gte: yesterday } },
    orderBy: { createdAt: "desc" },
  });

  const memberJoins = recentLogs.filter((l) => l.type === "member_join").length;
  const memberLeaves = recentLogs.filter((l) => l.type === "member_leave").length;
  const bans = recentLogs.filter((l) => l.type === "ban").length;
  const messagesDeleted = recentLogs.filter((l) => l.type === "message_delete").length;
  const sources = await prisma.source.count();
  const notifications = await prisma.notification.count({ where: { sentAt: { gte: yesterday } } });

  const embed = new EmbedBuilder()
    .setTitle("📊 Rétrospective 24h")
    .setColor(0xffaa00)
    .setDescription("• Du " + yesterday.toLocaleString() + " à maintenant")
    .addFields(
      { name: "👋 Arrivées", value: memberJoins.toString(), inline: true },
      { name: "🚪 Départs", value: memberLeaves.toString(), inline: true },
      { name: "🔨 Bans", value: bans.toString(), inline: true },
      { name: "🗑️ Msg supprimés", value: messagesDeleted.toString(), inline: true },
      { name: "📡 Sources", value: sources + " (" + notifications + " notifs)", inline: true },
      { name: "📋 Actions", value: recentLogs.length.toString(), inline: true },
    )
    .setFooter(FOOTER)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
  await interaction.followUp({
    content: "🔄 Rattrapage des actualités en cours... Patientez.",
    flags: [MessageFlags.Ephemeral],
  });

  try {
    await runStartupRetrospective(client);
    await runDbSourcesRetrospective(client);
    await interaction.followUp({
      content:
        "✅ Rétrospective de contenu terminée ! Les actualités manquées ont été publiées dans les salons dédiés.",
      flags: [MessageFlags.Ephemeral],
    });
  } catch (err) {
    logger.error("[Retro] Erreur lors de la rétrospective manuelle:", String(err));
    await interaction.followUp({
      content: "❌ Erreur lors du rattrapage : " + String(err).slice(0, 500),
      flags: [MessageFlags.Ephemeral],
    });
  }
}

// ─── Exports pour le routeur de commandes ───

export const commands: unknown[] = [];

export async function handleCommand(
  interaction: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  const { commandName } = interaction;
  switch (commandName) {
    case "start":
      return handleStart(interaction, client);
    case "help":
      return handleHelp(interaction);
    case "status":
      return handleStatus(interaction, client);
    case "restart":
      return handleRestart(interaction, client);
    case "retro":
      return handleRetro(interaction, client);
    default:
      logger.warn(`Commande main inconnue: /${commandName}`);
      await interaction.reply({
        content: `❌ Commande /${commandName} non reconnue.`,
        flags: [MessageFlags.Ephemeral],
      });
  }
}

export { handleCategorySelect as handleSelectMenu };
