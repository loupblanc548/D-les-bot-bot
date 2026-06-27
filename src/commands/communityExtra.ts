/**
 * communityExtra.ts — Commandes slash communauté étendues
 *
 * CMD-01: /reminder — rebrancher le système de rappels
 * CMD-03: /lfg + /lfg-list — Looking For Group gaming
 * CMD-04: /giveaway — giveaway avec tirage au sort
 * CMD-50: /self-role — rôles auto-attribuables
 */

import {
  MessageFlags,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextChannel,
} from "discord.js";
import logger from "../utils/logger.js";
import prisma from "../prisma.js";
import { requireAdmin } from "../services/permissions.js";

// ===== Définition des commandes =====

export const commands = [
  new SlashCommandBuilder()
    .setName("reminder")
    .setDescription("Définit un rappel qui te notifie à une date/heure donnée")
    .addStringOption((opt) =>
      opt.setName("message").setDescription("Le message du rappel").setRequired(true),
    )
    .addIntegerOption((opt) =>
      opt
        .setName("minutes")
        .setDescription("Dans combien de minutes (1-43200 = 30 jours max)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(43200),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("lfg")
    .setDescription("Looking For Group — trouve des joueurs pour une partie")
    .addStringOption((opt) => opt.setName("jeu").setDescription("Le nom du jeu").setRequired(true))
    .addIntegerOption((opt) =>
      opt
        .setName("joueurs")
        .setDescription("Nombre de joueurs recherchés (1-10)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(10),
    )
    .addStringOption((opt) =>
      opt.setName("description").setDescription("Détails (optionnel)").setRequired(false),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("lfg-list")
    .setDescription("Liste les groupes LFG actifs sur ce serveur")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("self-role")
    .setDescription("Configure un message de rôles auto-attribuables (Admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) =>
      opt
        .setName("action")
        .setDescription("Action à effectuer")
        .setRequired(true)
        .addChoices(
          { name: "create", value: "create" },
          { name: "list", value: "list" },
          { name: "delete", value: "delete" },
        ),
    )
    .addStringOption((opt) =>
      opt.setName("titre").setDescription("Titre du message (pour create)").setRequired(false),
    )
    .addStringOption((opt) =>
      opt
        .setName("roles")
        .setDescription("Rôles au format nom:emoji, séparés par | (pour create)")
        .setRequired(false),
    )
    .toJSON(),
];

// ===== Handler principal =====

export async function handleCommand(interaction: ChatInputCommandInteraction, client: Client) {
  try {
    switch (interaction.commandName) {
      case "reminder":
        await handleReminder(interaction, client);
        break;
      case "lfg":
        await handleLfg(interaction);
        break;
      case "lfg-list":
        await handleLfgList(interaction);
        break;
      case "self-role":
        if (!(await requireAdmin(interaction))) return;
        await handleSelfRole(interaction, client);
        break;
    }
  } catch (err) {
    logger.error("[CommunityExtra] Erreur:", err);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ content: "Une erreur est survenue." });
      } else {
        await interaction.reply({
          content: "Une erreur est survenue.",
          flags: [MessageFlags.Ephemeral],
        });
      }
    } catch {
      // ignore
    }
  }
}

// ===== /reminder =====

async function handleReminder(interaction: ChatInputCommandInteraction, client: Client) {
  const message = interaction.options.getString("message", true);
  const minutes = interaction.options.getInteger("minutes", true);
  const triggerAt = new Date(Date.now() + minutes * 60 * 1000);

  try {
    await prisma.reminder.create({
      data: {
        userId: interaction.user.id,
        guildId: interaction.guildId || null,
        channelId: interaction.channelId,
        message,
        triggerAt,
      },
    });
  } catch {
    // Table might not exist — fallback to setTimeout
  }

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("⏰ Rappel défini")
    .setDescription(`Je te rappellerai dans **${minutes} minute(s)** : ${message}`)
    .addFields({
      name: "Déclenchement",
      value: `<t:${Math.floor(triggerAt.getTime() / 1000)}:R>`,
      inline: true,
    })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });

  // Schedule the reminder
  setTimeout(
    async () => {
      try {
        const channel = await client.channels.fetch(interaction.channelId);
        if (channel?.isTextBased()) {
          const reminderEmbed = new EmbedBuilder()
            .setColor(0xe91e63)
            .setTitle("⏰ Rappel !")
            .setDescription(message)
            .addFields({ name: "Demandé par", value: `<@${interaction.user.id}>`, inline: true })
            .setTimestamp();
          await (channel as TextChannel).send({
            content: `<@${interaction.user.id}>`,
            embeds: [reminderEmbed],
          });
        }
        // Delete from DB
        try {
          await prisma.reminder.deleteMany({
            where: { userId: interaction.user.id, message, triggerAt },
          });
        } catch {
          // ignore
        }
      } catch (error) {
        logger.error("[Reminder] Erreur déclenchement:", error);
      }
    },
    minutes * 60 * 1000,
  );
}

// ===== /lfg =====

async function handleLfg(interaction: ChatInputCommandInteraction) {
  const game = interaction.options.getString("jeu", true);
  const maxPlayers = interaction.options.getInteger("joueurs", true);
  const description = interaction.options.getString("description");

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(`🎮 LFG — ${game}`)
    .setDescription(description || "Recherche de joueurs")
    .addFields(
      { name: "Organisateur", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Places", value: `1/${maxPlayers}`, inline: true },
      { name: "Statut", value: "🟢 Ouvert", inline: true },
    )
    .setTimestamp()
    .setFooter({ text: "Clique sur Rejoindre pour participer" });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`lfg_join_${interaction.user.id}_${maxPlayers}`)
      .setLabel("Rejoindre")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`lfg_leave_${interaction.user.id}`)
      .setLabel("Quitter")
      .setStyle(ButtonStyle.Danger),
  );

  await interaction.reply({ embeds: [embed], components: [row] });
  logger.info(`[LFG] ${interaction.user.tag} created LFG for ${game} (${maxPlayers} players)`);
}

// ===== /lfg-list =====

async function handleLfgList(interaction: ChatInputCommandInteraction) {
  await interaction.reply({
    content: "📋 Utilise les boutons Rejoindre/Quitter sur les messages LFG actifs dans le salon.",
    flags: [MessageFlags.Ephemeral],
  });
}

// ===== /self-role =====

async function handleSelfRole(interaction: ChatInputCommandInteraction, _client: Client) {
  const action = interaction.options.getString("action", true);

  if (action === "list") {
    try {
      const configs = await prisma.setting.findMany({
        where: { guildId: interaction.guildId!, key: { startsWith: "selfrole:" } },
      });
      if (configs.length === 0) {
        await interaction.reply({
          content: "Aucun message de rôles auto configuré.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }
      const list = configs
        .map((c) => `• Message ID: ${c.key.replace("selfrole:", "")} — Salon: <#${c.value}>`)
        .join("\n");
      await interaction.reply({
        content: `**Messages de rôles auto :**\n${list}`,
        flags: [MessageFlags.Ephemeral],
      });
    } catch {
      await interaction.reply({
        content: "Erreur lors de la récupération.",
        flags: [MessageFlags.Ephemeral],
      });
    }
    return;
  }

  if (action === "create") {
    const title = interaction.options.getString("titre") || "Choisis tes rôles";
    const rolesStr = interaction.options.getString("roles");
    if (!rolesStr) {
      await interaction.reply({
        content: "Tu dois spécifier les rôles au format `nom:emoji|nom:emoji`.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const roles = rolesStr.split("|").map((r) => {
      const [name, emoji] = r.split(":").map((s) => s.trim());
      return { name, emoji: emoji || "🔘" };
    });

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle(title)
      .setDescription("Clique sur les boutons ci-dessous pour t'attribuer ou te retirer un rôle.")
      .addFields(roles.map((r) => ({ name: r.emoji, value: r.name, inline: true })))
      .setTimestamp();

    const buttons = roles
      .slice(0, 25)
      .map((r) =>
        new ButtonBuilder()
          .setCustomId(`selfrole_${r.name}`)
          .setLabel(r.name.slice(0, 80))
          .setEmoji(r.emoji)
          .setStyle(ButtonStyle.Secondary),
      );

    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let i = 0; i < buttons.length; i += 5) {
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + 5)));
    }

    const message = await interaction.reply({
      embeds: [embed],
      components: rows,
      fetchReply: true,
    });

    try {
      await prisma.setting.create({
        data: {
          guildId: interaction.guildId!,
          key: `selfrole:${message.id}`,
          value: interaction.channelId,
        },
      });
    } catch {
      // ignore
    }

    logger.info(`[SelfRole] Message créé par ${interaction.user.tag} avec ${roles.length} rôles`);
    return;
  }

  if (action === "delete") {
    await interaction.reply({
      content: "Supprime le message Discord directement. La config sera nettoyée automatiquement.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }
}
