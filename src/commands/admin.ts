import logger from "../utils/logger";
import {
  MessageFlags,
  TextChannel,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import prisma from "../prisma";
import { requireAdmin } from "../services/permissions";
import { getLogs } from "../services/logs";
import { requestConfirmation } from "../utils/confirm";

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
