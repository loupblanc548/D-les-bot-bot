import logger from "../utils/logger.js";
// Commandes Communauté & Automatisation
// reminder, ticket-setup (+ gestion des boutons de ticket)

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
  ButtonInteraction,
  ChannelType,
  TextChannel,
  CategoryChannel,
} from "discord.js";
import prisma from "../prisma.js";
import { config } from "../config.js";
import { requireAdmin } from "../services/permissions.js";
import { createLog } from "../services/logs.js";

// Rappels persistés via Prisma (table Reminder)

// ===== Définition des commandes =====

export const commands = [
  new SlashCommandBuilder()
    .setName("ticket-setup")
    .setDescription("Crée le panneau de tickets dans ce salon (Staff)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON(),

  new SlashCommandBuilder()
    .setName("wishlist-notify")
    .setDescription("Active ou désactive les DMs pour les notifications wishlist")
    .addBooleanOption((opt) =>
      opt
        .setName("activer")
        .setDescription("Activer (true) ou désactiver (false) les DMs wishlist")
        .setRequired(true),
    )
    .addUserOption((option) =>
      option
        .setName("membre")
        .setDescription("Le membre à notifier (via @mention)")
        .setRequired(true),
    )
    .toJSON(),
];

// ===== Handler principal =====

export async function handleCommand(interaction: ChatInputCommandInteraction, _client: Client) {
  try {
    switch (interaction.commandName) {
      case "ticket-setup":
        await handleTicketSetup(interaction);
        break;
      case "wishlist-notify":
        if (!(await requireAdmin(interaction))) return;
        await handleWishlistNotify(interaction);
        break;
    }
  } catch (err) {
    logger.error("[Community] Erreur:", err);
    const errorEmbed = new EmbedBuilder()
      .setColor(0xff3344)
      .setDescription("Une erreur est survenue.");
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], flags: [MessageFlags.Ephemeral] });
      }
    } catch (err) {
      logger.warn("[Community] Erreur reply:", String(err));
    }
  }
}

// ===== Gestion des boutons de ticket (exporté pour index.ts) =====

export async function handleTicketButton(interaction: ButtonInteraction, _client: Client) {
  if (interaction.customId !== "ticket_create") return;

  try {
    const guild = interaction.guild!;
    const member = await guild.members.fetch(interaction.user.id);

    // Nom du salon ticket : ticket-{username}
    const channelName = "ticket-" + member.user.username.toLowerCase().replace(/[^a-z0-9]/g, "-");

    // Vérifier si un ticket existe déjà
    const existing = guild.channels.cache.find(
      (ch) => ch.name === channelName && ch.type === ChannelType.GuildText,
    );
    if (existing) {
      await interaction.reply({
        content: "Tu as déjà un ticket ouvert : " + existing.toString(),
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    // Trouver ou créer une catégorie "Tickets"
    let ticketCategory = guild.channels.cache.find(
      (ch) => ch.type === ChannelType.GuildCategory && ch.name.toLowerCase() === "tickets",
    ) as CategoryChannel | undefined;

    if (!ticketCategory) {
      ticketCategory = await guild.channels.create({
        name: "Tickets",
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
        ],
      });
    }

    // Construire les permissions pour les rôles staff
    const staffOverwrites: { id: string; allow: bigint[] }[] = [];
    for (const roleId of config.adminRoles) {
      if (roleId) {
        staffOverwrites.push({
          id: roleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        });
      }
    }
    for (const roleId of config.modRoles) {
      if (roleId) {
        staffOverwrites.push({
          id: roleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        });
      }
    }

    // Créer le salon privé
    const ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: ticketCategory.id,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: member.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        ...staffOverwrites,
      ],
    });

    // Message de bienvenue dans le ticket
    const welcomeEmbed = new EmbedBuilder()
      .setColor(0x00f0ff)
      .setTitle("🎫 Ticket créé")
      .setDescription(
        "Bienvenue " +
          member.toString() +
          " !\n\n" +
          "Le staff va prendre en charge ta demande rapidement.\n" +
          "Décris ton problème ou ta question en attendant.",
      )
      .setFooter({ text: "Systeme de Surveillance • v1.0.0" })
      .setTimestamp();

    const closeButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket_close")
        .setLabel("Fermer le ticket")
        .setStyle(ButtonStyle.Danger),
    );

    await ticketChannel.send({
      content: member.toString(),
      embeds: [welcomeEmbed],
      components: [closeButton],
    });

    await interaction.reply({
      content: "✅ Ticket créé : " + ticketChannel.toString(),
      flags: [MessageFlags.Ephemeral],
    });

    // Log
    await createLog({
      type: "member",
      action: "ticket_created",
      userId: interaction.user.id,
      targetId: ticketChannel.id,
      details: "Salon: #" + channelName,
    });
  } catch (err) {
    logger.error("[Community] Erreur création ticket:", err);
    try {
      await interaction.reply({
        content: "Impossible de créer le ticket.",
        flags: [MessageFlags.Ephemeral],
      });
    } catch (err) {
      logger.warn("[Community] Erreur reply:", String(err));
    }
  }
}

// ===== /ticket-setup =====

async function handleTicketSetup(interaction: ChatInputCommandInteraction) {
  const embed = new EmbedBuilder()
    .setColor(0x00f0ff)
    .setTitle("🎫 Support - Tickets")
    .setDescription(
      "Besoin d'aide ? Clique sur le bouton ci-dessous pour creer un ticket.\n" +
        "Le staff te repondra dans un salon prive des que possible.",
    )
    .addFields({
      name: "📋 Regles",
      value:
        "- Sois precis dans ta demande\n" +
        "- Ne cree qu'un seul ticket a la fois\n" +
        "- Reste courtois avec le staff",
    })
    .setFooter({ text: interaction.guild!.name });

  const button = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_create")
      .setLabel("🎫 Créer un ticket")
      .setEmoji("🎫")
      .setStyle(ButtonStyle.Primary),
  );

  await (interaction.channel as TextChannel).send({
    embeds: [embed],
    components: [button],
  });

  await interaction.reply({
    content: "✅ Panneau de tickets créé !",
    flags: [MessageFlags.Ephemeral],
  });
}

// ===== Gestion de la fermeture des tickets (exporté pour index.ts) =====

export async function handleTicketClose(interaction: ButtonInteraction, _client: Client) {
  if (interaction.customId !== "ticket_close") return;

  try {
    const channel = interaction.channel as TextChannel;
    if (!channel || !channel.name.startsWith("ticket-")) {
      await interaction.reply({
        content: "Ce salon n'est pas un ticket.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    await interaction.reply({
      content: "Fermeture du ticket dans 5 secondes...",
      flags: [MessageFlags.Ephemeral],
    });

    setTimeout(async () => {
      try {
        await channel.delete("Ticket fermé");
        await createLog({
          type: "member",
          action: "ticket_closed",
          userId: interaction.user.id,
          targetId: channel.id,
          details: "Salon: #" + channel.name,
        });
      } catch (err) {
        logger.error("[Community] Erreur fermeture ticket:", err);
      }
    }, 5000);
  } catch (err) {
    logger.error("[Community] Erreur handleTicketClose:", err);
    try {
      await interaction.reply({
        content: "Erreur lors de la fermeture du ticket.",
        flags: [MessageFlags.Ephemeral],
      });
    } catch (err) {
      logger.warn("[Community] Erreur reply:", String(err));
    }
  }
}

// ===== /wishlist-notify =====

async function handleWishlistNotify(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const activer = interaction.options.getBoolean("activer", true);
  const targetUser = interaction.options.getUser("membre", true);
  const targetUserId = targetUser.id;
  const targetDisplayName = targetUser.displayName;

  try {
    await prisma.userPreference.upsert({
      where: { userId: targetUserId },
      update: { wishlistDm: activer },
      create: { userId: targetUserId, wishlistDm: activer },
    });

    logger.info(
      "✅ [WishlistNotify] DMs wishlist",
      activer ? "activés" : "désactivés",
      "pour",
      targetDisplayName,
      "(" + targetUserId + ")",
      "par",
      interaction.user.displayName,
      "(" + interaction.user.id + ")",
    );

    const isSelf = targetUserId === interaction.user.id;
    const description = isSelf
      ? activer
        ? "Vous recevrez désormais des DMs pour les notifications wishlist."
        : "Vous ne recevrez plus de DMs pour les notifications wishlist."
      : activer
        ? "Les DMs wishlist ont été activés pour **" + targetDisplayName + "**."
        : "Les DMs wishlist ont été désactivés pour **" + targetDisplayName + "**.";

    const embed = new EmbedBuilder()
      .setTitle(activer ? "✅ DMs wishlist activés" : "🚫 DMs wishlist désactivés")
      .setDescription(description)
      .setColor(activer ? 0x53fc18 : 0xff3344)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error("💥 [CRASH WishlistNotify] Erreur Prisma :", err);
    await interaction.editReply({
      content:
        "❌ Une erreur interne est survenue lors de la modification des préférences. L'erreur a été logguée dans la console.",
    });
  }
}
