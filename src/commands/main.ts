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

const FOOTER = { text: "Shadow Broker • Intelligence System" };

export interface Category {
  id: string;
  name: string;
  emoji: string;
  description: string;
  commands: string;
}

export const CATEGORIES: Category[] = [
  {
    id: "bot",
    name: "Bot",
    emoji: "🛠️",
    description: "Commandes principales du bot",
    commands:
      "`/bot help - Cette aide`\n" +
      "`/bot status - Statut du bot`\n" +
      "`/bot restart - Redémarre le bot (admin)`",
  },
  {
    id: "moderation",
    name: "Modération",
    emoji: "�️",
    description: "Commandes de modération",
    commands:
      "`/mod warn [@user] - Avertir un membre`\n" +
      "`/mod mute [@user] - Rendre muet (timeout long)`\n" +
      "`/mod unmute [@user] - Retirer le timeout`\n" +
      "`/mod kick [@user] - Expulser`\n" +
      "`/mod ban [@user] - Bannir`\n" +
      "`/mod timeout [@user] - Timeout court terme`\n" +
      "`/mod clear [nombre] - Supprimer messages`\n" +
      "`/mod unlock - Déverrouiller le salon`\n" +
      "`/mod purge [@user] - Supprime messages d'un utilisateur`\n" +
      "`/mod history [@user] - Historique des messages`\n" +
      "`/mod slowmode [durée] - Slowmode du salon`\n" +
      "`/mod lock - Verrouiller le salon`\n" +
      "`/mod softban [@user] - Soft ban (ban+unban)`\n" +
      "`/mod tempban [@user] - Ban temporaire`\n" +
      "`/mod purgeuser [@user] - Supprime tous les messages d'un user`\n" +
      "`/mod snipe - Dernier message supprimé`\n" +
      "`/mod report [@user] - Signale un membre au staff`",
  },
  {
    id: "security",
    name: "Sécurité",
    emoji: "🔒",
    description: "OSINT, threat intel, config et défense",
    commands:
      "`/security osint scan [pseudo] - Scan 35+ plateformes`\n" +
      "`/security osint dns [domaine] - Résolution DNS`\n" +
      "`/security osint whois [domaine] - WHOIS complet`\n" +
      "`/security osint breach [email] - Data breach check`\n" +
      "`/security osint phone [numero] - PhoneInfoga`\n" +
      "`/security threat linkcheck [url] - Lien suspect ?`\n" +
      "`/security threat intel - Analyse globale serveur`\n" +
      "`/security threat namehistory [@user] - Historique pseudos`\n" +
      "`/security config antiraid [action] - Mode anti-raid`\n" +
      "`/security config word-filter [action] - Filtre mots interdits`\n" +
      "`/security defense raid-shield - Bouclier anti-raid`\n" +
      "`/security defense lockdown-server - Verrouillage serveur`",
  },
  {
    id: "ai",
    name: "IA",
    emoji: "🤖",
    description: "Chat, analyse et configuration IA",
    commands:
      "`/ai basic chat [message] - Pose une question à l'IA`\n" +
      "`/ai basic ask-bot - Active/désactive le chat IA contextuel`\n" +
      "`/ai basic image [prompt] - Génère une image via IA`\n" +
      "`/ai basic translate [texte] - Traduit un texte`\n" +
      "`/ai basic summarize - Résume les derniers messages`\n" +
      "`/ai analysis sentiment [message] - Analyse de sentiment`\n" +
      "`/ai analysis summarize-user [@user] - Résumé activité d'un membre`\n" +
      "`/ai analysis channel-summary - Résumé complet d'un salon`\n" +
      "`/ai analysis behavior-timeline [@user] - Timeline comportementale`\n" +
      "`/ai analysis spam-analysis - Analyse spam d'un salon`\n" +
      "`/ai advanced persona [style] - Change la personnalité de l'IA`\n" +
      "`/ai advanced mood - Humeur générale du serveur`\n" +
      "`/ai advanced prompt-templates - Liste/modifie templates`\n" +
      "`/ai advanced fine-tune - Fine-tune du modèle`\n" +
      "`/ai advanced context - Gère le contexte (clear/size)`\n" +
      "`/ai advanced history - Historique actions modération IA`\n" +
      "`/ai config model-select [modele] - Change le modèle LLM`\n" +
      "`/ai config temperature [valeur] - Ajuste la créativité (0-2)`\n" +
      "`/ai config token-usage - Stats consommation tokens`\n" +
      "`/ai config moderation-config - Config modération IA`\n" +
      "`/ai config fun-mode - Mode fun (roast, compliment...)`",
  },
  {
    id: "gaming",
    name: "Gaming",
    emoji: "🎮",
    description: "Commandes liées aux jeux vidéo",
    commands:
      "`/game status - Statut des serveurs de jeu`\n" +
      "`/game info [jeu] - Infos détaillées d'un jeu`\n" +
      "`/game free-games - Jeux gratuits (Epic Games)`\n" +
      "`/game free-game-reminder - Rappels jeux gratuits`\n" +
      "`/game patch-notes [jeu] - Patch notes de jeux`\n" +
      "`/game deal [jeu] - Comparateur de prix`\n" +
      "`/game deals-history [jeu] - Historique des prix`\n" +
      "`/game price-compare [jeu] - Compare prix multi-plateforme`\n" +
      "`/game price-history [jeu] - Historique des prix`\n" +
      "`/game price-track [jeu] - Suivi de prix`\n" +
      "`/game release-calendar - Calendrier des sorties`\n" +
      "`/game gaming-news - News gaming`\n" +
      "`/game epic-calendar - Calendrier Epic Games`\n" +
      "`/game steam - Profil Steam, wishlist, nowplaying`\n" +
      "`/game steam-deals - Deals Steam`\n" +
      "`/game wishlist [action] - Wishlist multi-plateforme`\n" +
      "`/game wishlist-stats - Stats de ta wishlist`\n" +
      "`/game wishlist-notify - Notifs wishlist`\n" +
      "`/game boutique - Boutique Fortnite (FR)`\n" +
      "`/game fortnite-wishlist [action] - Wishlist Fortnite (DM)`\n" +
      "`/game fortnite-shop-preview - Aperçu boutique Fortnite`\n" +
      "`/game xbox [gamertag] - Profil Xbox/Game Pass`\n" +
      "`/game twitch - Gère les streamers suivis`\n" +
      "`/game psn - Profil, trophées et jeux PlayStation`",
  },
  {
    id: "mc",
    name: "Minecraft",
    emoji: "⛏️",
    description: "Bot Minecraft Bedrock",
    commands:
      "`/mc connect [ip] - Connecte le bot au serveur`\n" +
      "`/mc disconnect - Déconnecte le bot`\n" +
      "`/mc status - Statut du bot Minecraft`\n" +
      "`/mc mine - Démarre le mining automatique`\n" +
      "`/mc stop - Arrête le mining`\n" +
      "`/mc chat [message] - Envoie un message dans le chat`\n" +
      "`/mc follow [joueur] - Le bot suit un joueur`\n" +
      "`/mc farm - Démarre l'agriculture automatique`\n" +
      "`/mc stop-farm - Arrête l'agriculture`",
  },
  {
    id: "admin",
    name: "Administration",
    emoji: "�",
    description: "Commandes d'administration",
    commands:
      "`/admin dm [@user] [message] - DM à un utilisateur`\n" +
      "`/admin maintenance - Active/désactive le mode maintenance`\n" +
      "`/admin clean-duplicates - Nettoie les doublons DB`\n" +
      "`/admin backup - Backup manuel de la DB`\n" +
      "`/admin guild-config - Configuration du serveur`\n" +
      "`/admin channel-routing - Routage des salons`\n" +
      "`/admin purge-range [de] [a] - Supprime entre 2 IDs de messages`",
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
