import logger from "../utils/logger";
import {
  MessageFlags,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  Client,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType,
  StringSelectMenuInteraction,
} from "discord.js";
import prisma from "../prisma";
import { config } from "../config";
import { requireAdmin } from "../services/permissions";
import { getLogs } from "../services/logs";
import { runStartupRetrospective } from "../services/feeds";
import { runDbSourcesRetrospective } from "../services/monitor";

const FOOTER = { text: "Système de Surveillance • v1.0.0" };

export interface Category {
  id: string;
  name: string;
  emoji: string;
  description: string;
  commands: string;
}

export const CATEGORIES: Category[] = [
  {
    id: "main",
    name: "Principales",
    emoji: "🛠️",
    description: "Commandes principales du bot",
    commands:
      "`/start - Initialise le bot`\n" +
      "`/help - Cette aide`\n" +
      "`/status - Statut du bot`\n" +
      "`/restart - Redémarre (admin)`\n" +
      "`/retro - Rétrospective 24h (admin)`\n" +
      "`/retrospective [type] [limite] - Analyse comptes surveillés (admin)`\n" +
      "`/debug - Diagnostic système (admin)`\n" +
      "`/hotreload - Recharge les commandes à chaud (admin)`",
  },
  {
    id: "surveillance",
    name: "Surveillance",
    emoji: "📡",
    description: "Gestion des sources de surveillance",
    commands:
      "`/addsource [@handle] [plateforme] - Ajoute une source (YouTube/Twitter/Bluesky)`\n" +
      "`/removesource [@handle] - Supprime une source`\n" +
      "`/listsources - Liste les sources`\n" +
      "`/twitch - Gère les streamers suivis (add/list/remove)`\n" +
      "`/psn - Profil, trophées et jeux PlayStation`",
  },
  {
    id: "admin",
    name: "Administration",
    emoji: "👑",
    description: "Commandes d'administration",
    commands:
      "`/broadcast [message] - Message à tous (admin)`\n" +
      "`/dm [@user] [message] - DM (admin)`\n" +
      "`/logs [type] - Affiche les logs`\n" +
      "`/deletehistory - Supprime l'historique`\n" +
      "`/maintenance - Active/désactive le mode maintenance`",
  },
  {
    id: "ai",
    name: "IA",
    emoji: "🤖",
    description: "Commandes d'intelligence artificielle",
    commands:
      "`/chat [message] - Discute avec l'IA`\n" +
      "`/mention [message] - Réponse personnalisée`\n" +
      "`/aichat - Active/désactive l'IA contextuelle dans un salon`\n" +
      "`/smartpoll [question] - Génère un sondage intelligent par IA`\n" +
      "`/translate [texte] [langue] - Traduit un texte`\n" +
      "`/summarize [texte] - Résume un texte long`\n" +
      "`/ask-gaming [question] - L'IA experte gaming`\n" +
      "`/ask-tech [question] - L'IA experte tech`",
  },
  {
    id: "alertcenter",
    name: "AlertCenter",
    emoji: "🚨",
    description: "Centre d'alertes et risques",
    commands:
      "`/alertcenter - Vue d'ensemble des alertes`\n" +
      "`/riskscore [@user] - Score de risque d'un membre`\n" +
      "`/riskyusers [niveau] - Liste les membres à risque`\n" +
      "`/alertconfig - Configure les alertes`\n" +
      "`/alertcenter reset [@user] - Réinitialise le profil de risque`",
  },
  {
    id: "moderation",
    name: "Modération",
    emoji: "🛡️",
    description: "Commandes de modération",
    commands:
      "`/ban [@user] - Bannir (admin)`\n" +
      "`/kick [@user] - Expulser`\n" +
      "`/mute [@user] [durée] - Mute temporaire`\n" +
      "`/unmute [@user] - Démute`\n" +
      "`/warn [@user] [raison] - Avertir`\n" +
      "`/clear [nombre] - Supprimer messages`\n" +
      "`/timeout [@user] [durée] - Timeout court terme`\n" +
      "`/lock - Verrouiller le salon`\n" +
      "`/unlock - Déverrouiller le salon`\n" +
      "`/softban [@user] - Banne et débanne (nettoie messages)`\n" +
      "`/purge [@user] [nombre] - Supprime messages d'un utilisateur`\n" +
      "`/slowmode [durée] - Active le slowmode`\n" +
      "`/snipe - Affiche le dernier message supprimé`\n" +
      "`/history [@user] - Historique des messages`\n" +
      "`/purgeuser [@user] - Purge tous les messages d'un utilisateur`\n" +
      "`/tempban [@user] [durée] - Bannissement temporaire`",
  },
  {
    id: "security",
    name: "Sécurité",
    emoji: "🔒",
    description: "Commandes de sécurité avancée",
    commands:
      "`/lockdown - Verrouille/déverrouille tous les salons`\n" +
      "`/nuke - Clone et nettoie un salon`\n" +
      "`/check-alt - Liste les comptes récents`\n" +
      "`/blacklist - Gère la liste noire (owner)`\n" +
      "`/role-mass - Ajoute/retire un rôle à tous (admin)`\n" +
      "`/antiraid - Protection anti-raid (comptes récents)`\n" +
      "`/verif - Système de vérification par bouton`\n" +
      "`/namehistory [@user] - Historique des pseudos`\n" +
      "`/avatarhistory [@user] - Historique des avatars`\n" +
      "`/linkcheck [url] - Vérifie un lien suspect`\n" +
      "`/antiphishing - Active/désactive l'anti-phishing`",
  },
  {
    id: "gaming",
    name: "Gaming",
    emoji: "🎮",
    description: "Commandes liées aux jeux vidéo",
    commands:
      "`/game-status [jeu] - Statut des serveurs de jeu`\n" +
      "`/free-games - Jeux gratuits (Epic Games)`\n" +
      "`/patch-notes [jeu] - Patch notes de jeux`\n" +
      "`/deal [jeu] - Comparateur de prix`\n" +
      "`/track-game [jeu] - Surveille les actus Steam d'un jeu`\n" +
      "`/untrack-game [jeu] - Arrête la surveillance d'un jeu`\n" +
      "`/list-tracked - Liste les jeux surveillés`\n" +
      "`/steam - Profil Steam, wishlist, nowplaying`",
  },
  {
    id: "community",
    name: "Communauté",
    emoji: "👥",
    description: "Fonctionnalités communautaires",
    commands:
      "`/reminder [temps] [message] - Définit un rappel`\n" +
      "`/ticket-setup - Configure le système de tickets`\n" +
      "`/wishlist-notify - Active/désactive les DMs wishlist`\n" +
      "`/poll [question] [options] - Crée un sondage`",
  },
  {
    id: "utility",
    name: "Utilitaires",
    emoji: "🔧",
    description: "Outils et utilitaires",
    commands:
      "`/embed-builder - Crée un embed personnalisé`\n" +
      "`/say [salon] [message] - Fait parler le bot`\n" +
      "`/vocal [action] - Gère la connexion vocale (rejoindre/quitter)`\n" +
      "`/mp3 [nom] - Joue un son en vocal`\n" +
      "`/dictee - Lance une dictée en vocal`\n" +
      "`/reverse [texte] - Inverse un texte`",
  },
  {
    id: "casier",
    name: "Casier",
    emoji: "📋",
    description: "Gestion du casier judiciaire",
    commands:
      "`/casier [@user] - Affiche le casier d'un membre`\n" +
      "`/casier-clear [id] - Efface une sanction ou un casier (admin)`",
  },
  {
    id: "fun",
    name: "Fun",
    emoji: "🎭",
    description: "Commandes fun et divertissement",
    commands:
      "`/echo-tds - Fait lire un message à haute voix (cooldown 30s)`\n" +
      "`/ask-bot [question] - Pose une question à John Helldiver`\n" +
      "`/wishlist - Gère ta wishlist Fortnite`\n" +
      "`/shop [section] - Boutique Fortnite`",
  },
];



async function handleStart(interaction: ChatInputCommandInteraction, client: Client) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const sourcesCount = (await prisma.source.count()) || 0;
    await interaction.editReply({
      content:
        "🟢 **Bot opérationnel**\n" +
        "• Version : **1.0.0**\n" +
        "• Latence : **" + client.ws.ping + "ms**\n" +
        "• Sources : **" + sourcesCount + "** surveillée(s)\n" +
        "• Services : Discord.js + Prisma + OpenRouter IA\n" +
        "• " + (config.adminRoles.length > 0 ? "🟢 Rôles admin configurés" : "🟡 Rôles admin non configurés"),
    });
  } catch (error) {
    logger.error("[CRASH COMMANDE START]:", error);
    try {
      await interaction.editReply({ content: "❌ Erreur lors de l'initialisation." });
    } catch (err) { logger.warn("[Main] Erreur followUp:", String(err)) }
  }
}

async function handleHelp(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });
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
      .setColor(0x5865f2)
      .setDescription("Sélectionnez une catégorie ci-dessous pour voir les commandes disponibles.")
      .addFields(
        {
          name: "📊 Statistiques",
          value: `**${CATEGORIES.length} catégories** • **${CATEGORIES.reduce((acc, cat) => acc + cat.commands.split("\n").length, 0)} commandes**`,
          inline: false,
        }
      )
      .setFooter(FOOTER)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed], components: [row] });
  } catch (error) {
    logger.error("[CRASH COMMANDE HELP]:", error);
    try {
      await interaction.editReply({ content: "❌ Erreur lors de l'affichage de l'aide." });
    } catch (err) { logger.warn("[Main] Erreur followUp:", String(err)) }
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
    .setColor(0x5865f2)
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
    .addOptions(CATEGORIES.map((cat) => ({
      label: `${cat.emoji} ${cat.name}`,
      description: cat.description,
      value: cat.id,
    })));

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
    const lastScans = lastLogs.map((l) => "• " + l.type + " — " + l.action).join("\n") || "Aucune activité récente";
    const uptimeMin = Math.floor(process.uptime() / 60);
    const uptimeStr = uptimeMin < 60 ? uptimeMin + " min" : Math.floor(uptimeMin / 60) + "h " + (uptimeMin % 60) + "min";

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
        { name: "📝 Dernières actions", value: lastScans, inline: false }
      )
      .setFooter(FOOTER)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[CRASH COMMANDE STATUS]:", error);
    try {
      await interaction.editReply({ content: "❌ Erreur lors de l'affichage du statut." });
    } catch (err) { logger.warn("[Main] Erreur followUp:", String(err)) }
  }
}

async function handleRestart(interaction: ChatInputCommandInteraction, _client: Client) {
  if (!(await requireAdmin(interaction))) return;
  await interaction.deferReply({ ephemeral: true });
  try {
    logger.info("Redémarrage demandé par", interaction.user.tag);
    await interaction.editReply({ content: "🔄 Redémarrage du bot en cours..." });
    setTimeout(() => { process.exit(0); }, 1000);
  } catch (error) {
    logger.error("[CRASH COMMANDE RESTART]:", error);
    try {
      await interaction.editReply({ content: "❌ Erreur lors du redémarrage." });
    } catch (err) { logger.warn("[Main] Erreur followUp:", String(err)) }
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
      { name: "📋 Actions", value: recentLogs.length.toString(), inline: true }
    )
    .setFooter(FOOTER)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
  await interaction.followUp({ content: "🔄 Rattrapage des actualités en cours... Patientez.", flags: [MessageFlags.Ephemeral] });

  try {
    await runStartupRetrospective(client);
    await runDbSourcesRetrospective(client);
    await interaction.followUp({
      content: "✅ Rétrospective de contenu terminée ! Les actualités manquées ont été publiées dans les salons dédiés.",
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

export const commands: any[] = [];

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
