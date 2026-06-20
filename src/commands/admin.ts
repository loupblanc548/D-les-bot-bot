import logger from "../utils/logger.js";
import {
  MessageFlags,
  TextChannel,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import prisma from "../prisma.js";
import { requireAdmin } from "../services/permissions.js";
import { getLogs } from "../services/logs.js";
import { requestConfirmation } from "../utils/confirm.js";
import { manualBackup } from "../modules/backup/databaseBackup.js";
import { searchNotifications } from "../modules/search/notificationSearch.js";
import { updateGuildConfig } from "../modules/guild/guildConfig.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("broadcast")
    .setDescription("Envoie un message a tous les membres (admin)")
    .addStringOption((opt) =>
      opt
        .setName("message")
        .setDescription("Le message a envoyer")
        .setRequired(true)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("dm")
    .setDescription("Envoie un DM sous l'identite du bot (admin)")
    .addUserOption((opt) =>
      opt
        .setName("utilisateur")
        .setDescription("L'utilisateur a contacter")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("message")
        .setDescription("Le message a envoyer")
        .setRequired(true)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("logs")
    .setDescription("Affiche le resume des logs")
    .addStringOption((opt) =>
      opt
        .setName("type")
        .setDescription("Type de log a afficher")
        .setRequired(false)
        .addChoices(
          { name: "Membres", value: "member" },
          { name: "Moderation", value: "moderation" },
          { name: "Salons", value: "channel" },
          { name: "Roles", value: "role" },
          { name: "Emojis", value: "emoji" },
          { name: "Messages", value: "message" }
        )
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("deletehistory")
    .setDescription("Supprime les notifications enregistrees (confirmation requise)")
    .toJSON(),

  // /test-freegames : envoie un message de test dans FREE_GAMES_CHANNEL_ID
  new SlashCommandBuilder()
    .setName("test-freegames")
    .setDescription("Envoie un message de test dans le salon FREE_GAMES_CHANNEL_ID pour valider la configuration")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),
  // /status : change le statut du bot (admin only)
  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Change le statut du bot (admin only)")
    .addStringOption((opt) =>
      opt
        .setName("statut")
        .setDescription("Nouveau statut du bot")
        .setRequired(true)
        .addChoices(
          { name: "En ligne", value: "online" },
          { name: "Inactif", value: "idle" },
          { name: "Ne pas déranger", value: "dnd" },
          { name: "Invisible", value: "invisible" }
        )
    )
    .toJSON(),
  
  // /add-source : Ajouter une nouvelle source de surveillance
  new SlashCommandBuilder()
    .setName("add-source")
    .setDescription("Ajouter une nouvelle source de surveillance (admin)")
    .addStringOption((opt) =>
      opt
        .setName("type")
        .setDescription("Type de source")
        .setRequired(true)
        .addChoices(
          { name: "YouTube", value: "YOUTUBE" },
          { name: "Twitter/X", value: "TWITTER" },
          { name: "Bluesky", value: "BLUESKY" },
          { name: "Twitch", value: "TWITCH" },
          { name: "Reddit", value: "REDDIT" },
          { name: "Instagram", value: "INSTAGRAM" }
        )
    )
    .addStringOption((opt) =>
      opt
        .setName("handle")
        .setDescription("Handle ou ID de la source (ex: @channel ou UC...)")
        .setRequired(true)
    )
    .addChannelOption((opt) =>
      opt
        .setName("salon")
        .setDescription("Salon où envoyer les notifications")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),
  
  // /remove-source : Supprimer une source de surveillance
  new SlashCommandBuilder()
    .setName("remove-source")
    .setDescription("Supprimer une source de surveillance (admin)")
    .addStringOption((opt) =>
      opt
        .setName("handle")
        .setDescription("Handle ou ID de la source à supprimer")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),
  
  // /list-sources : Lister toutes les sources configurées
  new SlashCommandBuilder()
    .setName("list-sources")
    .setDescription("Lister toutes les sources de surveillance (admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),
  
  // /pause-source : Mettre en pause une source
  new SlashCommandBuilder()
    .setName("pause-source")
    .setDescription("Mettre en pause une source de surveillance (admin)")
    .addStringOption((opt) =>
      opt
        .setName("handle")
        .setDescription("Handle ou ID de la source à mettre en pause")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),
  
  // /backup : Lancer un backup manuel de la base de données
  new SlashCommandBuilder()
    .setName("backup")
    .setDescription("Lancer un backup manuel de la base de données (admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),
  
  // /create-workflow : Créer un nouveau workflow
  new SlashCommandBuilder()
    .setName("create-workflow")
    .setDescription("Créer un nouveau workflow d'automatisation (admin)")
    .addStringOption((opt) =>
      opt
        .setName("name")
        .setDescription("Nom du workflow")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("description")
        .setDescription("Description du workflow")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),
  
  // /list-workflows : Lister tous les workflows
  new SlashCommandBuilder()
    .setName("list-workflows")
    .setDescription("Lister tous les workflows d'automatisation (admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),
  
  // /toggle-workflow : Activer/désactiver un workflow
  new SlashCommandBuilder()
    .setName("toggle-workflow")
    .setDescription("Activer ou désactiver un workflow (admin)")
    .addStringOption((opt) =>
      opt
        .setName("workflow-id")
        .setDescription("ID du workflow")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),
  
  // /search-notifications : Rechercher dans les notifications historiques
  new SlashCommandBuilder()
    .setName("search-notifications")
    .setDescription("Rechercher dans les notifications historiques (admin)")
    .addStringOption((opt) =>
      opt
        .setName("query")
        .setDescription("Terme de recherche")
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName("platform")
        .setDescription("Filtrer par plateforme")
        .setRequired(false)
        .addChoices(
          { name: "YouTube", value: "youtube" },
          { name: "Twitter", value: "twitter" },
          { name: "Bluesky", value: "bluesky" },
          { name: "Twitch", value: "twitch" },
          { name: "Reddit", value: "reddit" },
          { name: "Instagram", value: "instagram" }
        )
    )
    .addIntegerOption((opt) =>
      opt
        .setName("page")
        .setDescription("Numéro de page")
        .setRequired(false)
        .setMinValue(1)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),
  
  // /guild-config : Configurer les paramètres de la guilde
  new SlashCommandBuilder()
    .setName("guild-config")
    .setDescription("Configurer les paramètres de la guilde (admin)")
    .addChannelOption((opt) =>
      opt
        .setName("log-channel")
        .setDescription("Salon de logs")
        .setRequired(false)
    )
    .addChannelOption((opt) =>
      opt
        .setName("free-games-channel")
        .setDescription("Salon des jeux gratuits")
        .setRequired(false)
    )
    .addBooleanOption((opt) =>
      opt
        .setName("monitoring-enabled")
        .setDescription("Activer/désactiver le monitoring")
        .setRequired(false)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("monitoring-interval")
        .setDescription("Intervalle de monitoring (ms)")
        .setRequired(false)
        .setMinValue(60000)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("max-retro-posts")
        .setDescription("Nombre max de posts rétrospectifs")
        .setRequired(false)
        .setMinValue(1)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  const { commandName } = interaction;

  switch (commandName) {
    case "broadcast":
      await handleBroadcast(interaction);
      break;
    case "dm":
      await handleDM(interaction);
      break;
    case "logs":
      await handleLogs(interaction);
      break;
    case "deletehistory":
      await handleDeleteHistory(interaction);
      break;
    case "test-freegames":
        await handleTestFreeGames(interaction);
        break;
    case "status":
      await handleStatus(interaction);
      break;
    case "add-source":
      await handleAddSource(interaction);
      break;
    case "remove-source":
      await handleRemoveSource(interaction);
      break;
    case "list-sources":
      await handleListSources(interaction);
      break;
    case "pause-source":
      await handlePauseSource(interaction);
      break;
    case "backup":
      await handleBackup(interaction);
      break;
    case "create-workflow":
      await handleCreateWorkflow(interaction);
      break;
    case "list-workflows":
      await handleListWorkflows(interaction);
      break;
    case "toggle-workflow":
      await handleToggleWorkflow(interaction);
      break;
    case "search-notifications":
      await handleSearchNotifications(interaction);
      break;
    case "guild-config":
      await handleGuildConfig(interaction);
      break;
  }
}

async function handleBroadcast(interaction: ChatInputCommandInteraction) {
  // Permissions et confirmation AVANT deferReply (utilisent reply() en interne)
  if (!(await requireAdmin(interaction))) return;

  const message = interaction.options.get("message", true).value as string;
  const guild = interaction.guild;

  if (!guild) {
    await interaction.reply({ content: "Cette commande doit etre utilisee sur un serveur." });
    return;
  }

  const confirmed = await requestConfirmation(
    interaction,
    "Envoyer le message suivant a **tous les membres** ?\n\n> " + message
  );
  if (!confirmed) return;

  // requestConfirmation deja gere l'interaction → utiliser followUp
  try {
    let sentCount = 0;
    let failCount = 0;
    const members = await guild.members.fetch();

    for (const [, member] of members) {
      if (member.user.bot) continue;
      try {
        await member.send({ content: "**Message de l'administration**\n\n" + message });
        sentCount++;
        await new Promise((r) => setTimeout(r, 500));
      } catch {
        failCount++;
      }
    }

    await interaction.followUp({
      content: "Broadcast termine : **" + sentCount + "** envoyes, **" + failCount + "** echoues.",
      ephemeral: true,
    });
  } catch (error) {
    logger.error("[CRASH COMMANDE BROADCAST]:", error);
    try { await interaction.followUp({ content: "Impossible de terminer le broadcast.", ephemeral: true }); } catch (err) { logger.warn("[Admin] Erreur followUp:", String(err)) }
  }
}

async function handleDM(interaction: ChatInputCommandInteraction) {
  // Permissions AVANT deferReply
  if (!(await requireAdmin(interaction))) return;

  const user = interaction.options.getUser("utilisateur", true);
  if (!user) {
    await interaction.reply({ content: "Utilisateur introuvable.", ephemeral: true });
    return;
  }
  const message = interaction.options.get("message", true).value as string;

  await interaction.deferReply({ ephemeral: true });

  try {
    await user.send({ content: "**Message de l'administration**\n\n" + message });
    await interaction.editReply({ content: "DM envoye a **" + user.tag + "**." });
  } catch (error) {
    logger.error("[CRASH COMMANDE DM]:", error);
    try {
      await interaction.editReply({
        content: "Impossible d'envoyer un DM a " + user.tag + ". L'utilisateur a peut-etre desactive les DMs.",
      });
    } catch {
      try { await interaction.followUp({ content: "Impossible d'envoyer le DM.", ephemeral: true }); } catch (err) { logger.warn("[Admin] Erreur followUp:", String(err)) }
    }
  }
}

async function handleLogs(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const typeFilter = interaction.options.get("type")?.value as string | undefined;

    let logs;
    if (typeFilter) {
      logs = await prisma.log.findMany({
        where: { type: { contains: typeFilter } },
        orderBy: { createdAt: "desc" },
        take: 25,
      });
    } else {
      logs = await getLogs(25);
    }

    if (logs.length === 0) {
      await interaction.editReply({ content: "Aucun log trouve." });
      return;
    }

    const logLines = logs.map((l) => {
      const time = l.createdAt.toLocaleTimeString("fr-FR");
      return "[ " + time + " ] **" + l.type + "** - " + l.action;
    });

    const embed = new EmbedBuilder()
      .setTitle("Logs" + (typeFilter ? " - " + typeFilter : ""))
      .setColor(0x2f3136)
      .setDescription(logLines.join("\n").slice(0, 4000) || "Aucun log")
      .setFooter({ text: "Systeme de Surveillance - v1.0.0" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[CRASH COMMANDE LOGS]:", error);
    try { await interaction.editReply({ content: "Impossible d'afficher les logs." }); }
    catch { try { await interaction.followUp({ content: "Impossible d'afficher les logs.", ephemeral: true }); } catch (err) { logger.warn("[Admin] Erreur followUp:", String(err)) } }
  }
}

async function handleDeleteHistory(interaction: ChatInputCommandInteraction) {
  // Permissions et confirmation AVANT deferReply
  if (!(await requireAdmin(interaction))) return;

  const notifCount = await prisma.notification.count();

  if (notifCount === 0) {
    await interaction.reply({ content: "Aucune notification a supprimer.", ephemeral: true });
    return;
  }

  const confirmed = await requestConfirmation(
    interaction,
    "Supprimer **" + notifCount + "** notifications enregistrees ? Cette action est irreversible."
  );
  if (!confirmed) return;

  // requestConfirmation deja gere l'interaction → utiliser followUp
  try {
    await prisma.notification.deleteMany({});
    await interaction.followUp({
      content: "**" + notifCount + "** notifications supprimees.",
      ephemeral: true,
    });
  } catch (error) {
    logger.error("[CRASH COMMANDE DELETEHISTORY]:", error);
    try { await interaction.followUp({ content: "Impossible de supprimer les notifications.", ephemeral: true }); } catch (err) { logger.warn("[Admin] Erreur followUp:", String(err)) }
  }
}

// ===== /status =====

async function handleStatus(interaction: ChatInputCommandInteraction) {
  const OWNER_ID = "620589482185457674";

  if (interaction.user.id !== OWNER_ID) {
    await interaction.reply({ content: "Accès refusé", ephemeral: true });
    return;
  }

  const newStatus = interaction.options.get("statut", true).value as string;

  const statusMap: Record<string, string> = {
    online: "En ligne 🟢",
    idle: "Inactif 🌙",
    dnd: "Ne pas déranger 🔴",
    invisible: "Invisible 👻",
  };

  try {
    await interaction.client.user.setPresence({
      status: newStatus as any,
      activities: [{
        name: 'Surveille les Helldivers',
        type: 3, // Watching
      }],
    });

    await interaction.reply({
      content: "Statut mis à jour avec succès : " + statusMap[newStatus],
      ephemeral: true,
    });
  } catch (error) {
    logger.error("[CRASH COMMANDE STATUS]:", error);
    await interaction.reply({
      content: "Impossible de mettre à jour le statut.",
      ephemeral: true,
    });
  }
}

// ===== /test-freegames =====

async function handleTestFreeGames(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  // 1. Vérifier que FREE_GAMES_CHANNEL_ID est configuré
  const channelId = process.env.FREE_GAMES_CHANNEL_ID;
  if (!channelId) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff3344)
          .setTitle("❌ Configuration manquante")
          .setDescription(
            "La variable d'environnement **FREE_GAMES_CHANNEL_ID** n'est pas définie.\n\n" +
            "Ajoute-la dans ton fichier `.env` puis redémarre le bot.\n" +
            "Voir `FREE_GAMES_SETUP.md` pour la procédure complète."
          ),
      ],
    });
    return;
  }

  // 2. Récupérer le salon
  const channel = await interaction.client.channels.fetch(channelId);
  if (!channel || !channel.isTextBased()) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff3344)
          .setTitle("❌ Salon introuvable")
          .setDescription(
            "Le salon avec l'ID `" + channelId + "` est introuvable ou n'est pas textuel.\n\n" +
            "Vérifie que :\n" +
            "1. L'ID est correct (Paramètres → Avancés → Mode développeur)\n" +
            "2. Le salon existe toujours\n" +
            "3. Le bot a accès au salon"
          ),
      ],
    });
    return;
  }

  // 3. Envoyer un embed de test (simule une alerte Epic Games)
  const testEmbed = new EmbedBuilder()
    .setColor(0x2a9d8f) // Vert Epic
    .setTitle("🎮 [Epic Games] ✅ Message de test")
    .setURL("https://store.epicgames.com/fr/free-games")
    .setAuthor({
      name: "Epic Games Store",
      iconURL: "https://store.epicgames.com/favicon.ico",
      url: "https://store.epicgames.com/fr/free-games",
    })
    .setDescription(
      "Ceci est un **message de test** envoyé par la commande `/test-freegames`.\n\n" +
      "Si tu vois ce message dans le bon salon avec la bonne couleur (vert Epic) et le bon logo, " +
      "ta configuration est **correcte** ✅\n\n" +
      "Les prochaines alertes de jeux gratuits seront postées ici toutes les 30 minutes."
    )
    .addFields(
      { name: "📅 Date du test", value: "<t:" + Math.floor(Date.now() / 1000) + ":F>", inline: true },
      { name: "👤 Demandé par", value: "<@" + interaction.user.id + ">", inline: true },
      { name: "🛒 Plateforme simulée", value: "Epic Games Store", inline: true }
    )
    .setFooter({ text: "Free Games Tracker • Test de configuration" })
    .setTimestamp();

  try {
    await (channel as TextChannel).send({ embeds: [testEmbed] });

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x53fc18)
          .setTitle("✅ Message de test envoyé")
          .setDescription(
            "Un embed de test a été posté dans <#" + channelId + ">.\n\n" +
            "Vérifie visuellement que :\n" +
            "✅ La couleur est bien **verte** (Epic)\n" +
            "✅ Le logo **Epic Games Store** est visible\n" +
            "✅ Le contenu est correctement formaté"
          ),
      ],
    });

    logger.info("[TestFreeGames] Message de test envoyé dans " + channelId + " par " + interaction.user.tag);
  } catch (sendError) {
    const msg = sendError instanceof Error ? sendError.message : String(sendError);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff3344)
          .setTitle("❌ Erreur d'envoi")
          .setDescription(
            "Le bot n'a pas pu envoyer le message dans <#" + channelId + ">.\n\n" +
            "**Erreur :** `" + msg + "`\n\n" +
            "Vérifie que le bot a bien les permissions `Envoyer des messages` et `Inclure dans les embeds` sur ce salon."
          ),
      ],
    });
    logger.error("[TestFreeGames] Erreur envoi:", msg);
  }
}

// ===== /add-source =====

async function handleAddSource(interaction: ChatInputCommandInteraction) {
  if (!(await requireAdmin(interaction))) return;

  const type = interaction.options.get("type", true).value as string;
  const handle = interaction.options.get("handle", true).value as string;
  const channel = interaction.options.get("salon", true).channel;
  const guild = interaction.guild;

  if (!guild || !channel) {
    await interaction.reply({ content: "Cette commande doit être utilisée sur un serveur avec un salon valide.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const existingSource = await prisma.source.findFirst({
      where: {
        urlOrHandle: handle,
        type: type,
        channelId: channel.id,
      },
    });

    if (existingSource) {
      await interaction.editReply({ content: "⚠️ Cette source existe déjà." });
      return;
    }

    await prisma.source.create({
      data: {
        guildId: guild.id,
        channelId: channel.id,
        type: type,
        urlOrHandle: handle,
      },
    });

    const embed = new EmbedBuilder()
      .setTitle("✅ Source ajoutée")
      .setColor(0x53fc18)
      .addFields(
        { name: "Type", value: type, inline: true },
        { name: "Handle", value: handle, inline: true },
        { name: "Salon", value: `<#${channel.id}>`, inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    logger.info(`[Admin] Source ajoutée: ${type} - ${handle} par ${interaction.user.tag}`);
  } catch (error) {
    logger.error("[CRASH COMMANDE ADD-SOURCE]:", error);
    try {
      await interaction.editReply({ content: "❌ Impossible d'ajouter la source." });
    } catch {
      try { await interaction.followUp({ content: "❌ Impossible d'ajouter la source.", ephemeral: true }); } catch (err) { logger.warn("[Admin] Erreur followUp:", String(err)) }
    }
  }
}

// ===== /remove-source =====

async function handleRemoveSource(interaction: ChatInputCommandInteraction) {
  if (!(await requireAdmin(interaction))) return;

  const handle = interaction.options.get("handle", true).value as string;

  const source = await prisma.source.findFirst({
    where: { urlOrHandle: handle },
  });

  if (!source) {
    await interaction.reply({ content: "⚠️ Source introuvable.", ephemeral: true });
    return;
  }

  const confirmed = await requestConfirmation(
    interaction,
    "Supprimer la source **" + handle + "** ? Cette action est irréversible."
  );
  if (!confirmed) return;

  try {
    await prisma.source.delete({ where: { id: source.id } });
    await interaction.followUp({
      content: "✅ Source **" + handle + "** supprimée.",
      ephemeral: true,
    });
    logger.info(`[Admin] Source supprimée: ${handle} par ${interaction.user.tag}`);
  } catch (error) {
    logger.error("[CRASH COMMANDE REMOVE-SOURCE]:", error);
    try { await interaction.followUp({ content: "❌ Impossible de supprimer la source.", ephemeral: true }); } catch (err) { logger.warn("[Admin] Erreur followUp:", String(err)) }
  }
}

// ===== /list-sources =====

async function handleListSources(interaction: ChatInputCommandInteraction) {
  if (!(await requireAdmin(interaction))) return;

  await interaction.deferReply({ ephemeral: true });

  try {
    const sources = await prisma.source.findMany({
      orderBy: { createdAt: "desc" },
    });

    if (sources.length === 0) {
      await interaction.editReply({ content: "Aucune source configurée." });
      return;
    }

    const sourceLines = sources.map((s) => {
      return `**${s.type}** - \`${s.urlOrHandle}\` → <#${s.channelId}>`;
    });

    const embed = new EmbedBuilder()
      .setTitle("📋 Sources configurées")
      .setColor(0x2f3136)
      .setDescription(sourceLines.join("\n").slice(0, 4000) || "Aucune source")
      .setFooter({ text: `Total: ${sources.length} sources` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[CRASH COMMANDE LIST-SOURCES]:", error);
    try { await interaction.editReply({ content: "❌ Impossible d'afficher les sources." }); }
    catch { try { await interaction.followUp({ content: "❌ Impossible d'afficher les sources.", ephemeral: true }); } catch (err) { logger.warn("[Admin] Erreur followUp:", String(err)) } }
  }
}

// ===== /backup =====

async function handleBackup(interaction: ChatInputCommandInteraction) {
  if (!(await requireAdmin(interaction))) return;

  await interaction.deferReply({ ephemeral: true });

  try {
    await manualBackup(interaction.client);
    await interaction.editReply({ content: "✅ Backup manuel lancé. Vous recevrez une notification dans le LOG_CHANNEL_ID." });
  } catch (error) {
    logger.error("[CRASH COMMANDE BACKUP]:", error);
    try {
      await interaction.editReply({ content: "❌ Impossible de lancer le backup." });
    } catch {
      try { await interaction.followUp({ content: "❌ Impossible de lancer le backup.", ephemeral: true }); } catch (err) { logger.warn("[Admin] Erreur followUp:", String(err)) }
    }
  }
}

// ===== /create-workflow =====

async function handleCreateWorkflow(interaction: ChatInputCommandInteraction) {
  if (!(await requireAdmin(interaction))) return;

  const name = interaction.options.get("name", true).value as string;
  const description = interaction.options.get("description")?.value as string | undefined;
  const guild = interaction.guild;

  if (!guild) {
    await interaction.reply({ content: "Cette commande doit être utilisée sur un serveur.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const workflow = await prisma.workflow.create({
      data: {
        guildId: guild.id,
        name,
        description,
      },
    });

    const embed = new EmbedBuilder()
      .setTitle("✅ Workflow créé")
      .setColor(0x53fc18)
      .addFields(
        { name: "ID", value: workflow.id, inline: true },
        { name: "Nom", value: workflow.name, inline: true },
        { name: "Description", value: workflow.description || "Aucune", inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    logger.info(`[Admin] Workflow créé: ${name} par ${interaction.user.tag}`);
  } catch (error) {
    logger.error("[CRASH COMMANDE CREATE-WORKFLOW]:", error);
    try {
      await interaction.editReply({ content: "❌ Impossible de créer le workflow." });
    } catch {
      try { await interaction.followUp({ content: "❌ Impossible de créer le workflow.", ephemeral: true }); } catch (err) { logger.warn("[Admin] Erreur followUp:", String(err)) }
    }
  }
}

// ===== /list-workflows =====

async function handleListWorkflows(interaction: ChatInputCommandInteraction) {
  if (!(await requireAdmin(interaction))) return;

  await interaction.deferReply({ ephemeral: true });

  try {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.editReply({ content: "Cette commande doit être utilisée sur un serveur." });
      return;
    }

    const workflows = await prisma.workflow.findMany({
      where: { guildId: guild.id },
      include: {
        triggers: true,
        actions: true,
      },
    });

    if (workflows.length === 0) {
      await interaction.editReply({ content: "Aucun workflow configuré." });
      return;
    }

    const workflowLines = workflows.map((w) => {
      const status = w.enabled ? "✅ Actif" : "❌ Inactif";
      return `**${w.name}** (${status}) - ${w.triggers.length} triggers, ${w.actions.length} actions`;
    });

    const embed = new EmbedBuilder()
      .setTitle("📋 Workflows configurés")
      .setColor(0x2f3136)
      .setDescription(workflowLines.join("\n").slice(0, 4000) || "Aucun workflow")
      .setFooter({ text: `Total: ${workflows.length} workflows` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[CRASH COMMANDE LIST-WORKFLOWS]:", error);
    try { await interaction.editReply({ content: "❌ Impossible d'afficher les workflows." }); }
    catch { try { await interaction.followUp({ content: "❌ Impossible d'afficher les workflows.", ephemeral: true }); } catch (err) { logger.warn("[Admin] Erreur followUp:", String(err)) } }
  }
}

// ===== /toggle-workflow =====

async function handleToggleWorkflow(interaction: ChatInputCommandInteraction) {
  if (!(await requireAdmin(interaction))) return;

  const workflowId = interaction.options.get("workflow-id", true).value as string;

  await interaction.deferReply({ ephemeral: true });

  try {
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
    });

    if (!workflow) {
      await interaction.editReply({ content: "⚠️ Workflow introuvable." });
      return;
    }

    const updatedWorkflow = await prisma.workflow.update({
      where: { id: workflowId },
      data: { enabled: !workflow.enabled },
    });

    const status = updatedWorkflow.enabled ? "activé" : "désactivé";
    await interaction.editReply({ content: `✅ Workflow **${workflow.name}** ${status}.` });
    logger.info(`[Admin] Workflow ${status}: ${workflow.name} par ${interaction.user.tag}`);
  } catch (error) {
    logger.error("[CRASH COMMANDE TOGGLE-WORKFLOW]:", error);
    try {
      await interaction.editReply({ content: "❌ Impossible de modifier le workflow." });
    } catch {
      try { await interaction.followUp({ content: "❌ Impossible de modifier le workflow.", ephemeral: true }); } catch (err) { logger.warn("[Admin] Erreur followUp:", String(err)) }
    }
  }
}

// ===== /search-notifications =====

async function handleSearchNotifications(interaction: ChatInputCommandInteraction) {
  if (!(await requireAdmin(interaction))) return;

  const query = interaction.options.get("query")?.value as string | undefined;
  const platform = interaction.options.get("platform")?.value as string | undefined;
  const page = interaction.options.get("page")?.value as number | undefined;

  await interaction.deferReply({ ephemeral: true });

  try {
    const result = await searchNotifications({
      query,
      platform,
      page: page || 1,
      limit: 25,
    });

    if (result.notifications.length === 0) {
      await interaction.editReply({ content: "Aucune notification trouvée." });
      return;
    }

    const notificationLines = result.notifications.map((n) => {
      const date = n.sentAt.toLocaleDateString("fr-FR");
      const platformLabel = n.platform || "Unknown";
      const content = n.content.slice(0, 50) + (n.content.length > 50 ? "..." : "");
      return `[${date}] **${platformLabel}** - ${content}`;
    });

    const embed = new EmbedBuilder()
      .setTitle("🔍 Résultats de recherche")
      .setColor(0x2f3136)
      .setDescription(notificationLines.join("\n").slice(0, 4000) || "Aucun résultat")
      .addFields(
        { name: "Total", value: result.totalCount.toString(), inline: true },
        { name: "Page", value: `${result.currentPage}/${result.totalPages}`, inline: true }
      )
      .setFooter({ text: `Page ${result.currentPage} sur ${result.totalPages}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[CRASH COMMANDE SEARCH-NOTIFICATIONS]:", error);
    try {
      await interaction.editReply({ content: "❌ Impossible de rechercher les notifications." });
    } catch {
      try { await interaction.followUp({ content: "❌ Impossible de rechercher les notifications.", ephemeral: true }); } catch (err) { logger.warn("[Admin] Erreur followUp:", String(err)) }
    }
  }
}

// ===== /guild-config =====

async function handleGuildConfig(interaction: ChatInputCommandInteraction) {
  if (!(await requireAdmin(interaction))) return;

  const logChannel = interaction.options.getChannel("log-channel");
  const freeGamesChannel = interaction.options.getChannel("free-games-channel");
  const monitoringEnabled = interaction.options.getBoolean("monitoring-enabled");
  const monitoringInterval = interaction.options.getInteger("monitoring-interval");
  const maxRetroPosts = interaction.options.getInteger("max-retro-posts");

  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "Cette commande doit être utilisée sur un serveur.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const updateData: any = {};
    if (logChannel) updateData.logChannelId = logChannel.id;
    if (freeGamesChannel) updateData.freeGamesChannelId = freeGamesChannel.id;
    if (monitoringEnabled !== null) updateData.monitoringEnabled = monitoringEnabled;
    if (monitoringInterval !== null) updateData.monitoringIntervalMs = monitoringInterval;
    if (maxRetroPosts !== null) updateData.maxRetroPosts = maxRetroPosts;

    const config = await updateGuildConfig(guild.id, updateData);

    const embed = new EmbedBuilder()
      .setTitle("✅ Configuration de guilde mise à jour")
      .setColor(0x53fc18)
      .addFields(
        { name: "Salon de logs", value: config?.logChannelId || "Non configuré", inline: true },
        { name: "Salon jeux gratuits", value: config?.freeGamesChannelId || "Non configuré", inline: true },
        { name: "Monitoring", value: config?.monitoringEnabled ? "Activé" : "Désactivé", inline: true },
        { name: "Intervalle monitoring", value: `${config?.monitoringIntervalMs || 300000}ms`, inline: true },
        { name: "Max posts rétrospectifs", value: config?.maxRetroPosts?.toString() || "10", inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    logger.info(`[Admin] Guild config updated by ${interaction.user.tag}`);
  } catch (error) {
    logger.error("[CRASH COMMANDE GUILD-CONFIG]:", error);
    try {
      await interaction.editReply({ content: "❌ Impossible de mettre à jour la configuration." });
    } catch {
      try { await interaction.followUp({ content: "❌ Impossible de mettre à jour la configuration.", ephemeral: true }); } catch (err) { logger.warn("[Admin] Erreur followUp:", String(err)) }
    }
  }
}

async function handlePauseSource(interaction: ChatInputCommandInteraction) {
  if (!(await requireAdmin(interaction))) return;

  const handle = interaction.options.get("handle", true).value as string;

  await interaction.deferReply({ ephemeral: true });

  try {
    const source = await prisma.source.findFirst({
      where: { urlOrHandle: handle },
    });

    if (!source) {
      await interaction.editReply({ content: "⚠️ Source introuvable." });
      return;
    }

    await interaction.editReply({ content: "ℹ️ Fonctionnalité de pause à implémenter (nécessite un champ 'active' dans le schéma)." });
  } catch (error) {
    logger.error("[CRASH COMMANDE PAUSE-SOURCE]:", error);
    try { await interaction.editReply({ content: "❌ Impossible de mettre en pause la source." }); }
    catch { try { await interaction.followUp({ content: "❌ Impossible de mettre en pause la source.", ephemeral: true }); } catch (err) { logger.warn("[Admin] Erreur followUp:", String(err)) } }
  }
}
