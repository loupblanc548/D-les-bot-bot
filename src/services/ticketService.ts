/**
 * ticketService.ts — Système de tickets complet
 *
 * Inspiré de discord-tickets/bot :
 * - Panels configurables (multi-panel)
 * - Création de salon privé avec permissions
 * - Claim (prise en charge par un staff)
 * - Fermeture avec transcript
 * - Persistance DB (Prisma)
 */

import {
  Guild,
  TextChannel,
  CategoryChannel,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ButtonInteraction,
  GuildMember,
  MessageFlags,
} from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";
import { createLog } from "./logs.js";

// ─── Panel Management ────────────────────────────────────────────────────────

export async function createPanel(opts: {
  guildId: string;
  channelId: string;
  messageId: string;
  title: string;
  description: string;
  buttonLabel: string;
  buttonEmoji: string;
  categoryId?: string | null;
  staffRoleId?: string | null;
  welcomeMsg: string;
}): Promise<void> {
  await prisma.ticketPanel.create({
    data: {
      guildId: opts.guildId,
      channelId: opts.channelId,
      messageId: opts.messageId,
      title: opts.title,
      description: opts.description,
      buttonLabel: opts.buttonLabel,
      buttonEmoji: opts.buttonEmoji,
      categoryId: opts.categoryId ?? null,
      staffRoleId: opts.staffRoleId ?? null,
      welcomeMsg: opts.welcomeMsg,
    },
  });
}

export async function getPanel(guildId: string, channelId: string, messageId: string) {
  return prisma.ticketPanel.findUnique({
    where: {
      guildId_channelId_messageId: { guildId, channelId, messageId },
    },
  });
}

export async function listPanels(guildId: string) {
  return prisma.ticketPanel.findMany({ where: { guildId } });
}

export async function deletePanel(guildId: string, panelId: string): Promise<boolean> {
  const result = await prisma.ticketPanel.deleteMany({
    where: { id: panelId, guildId },
  });
  return result.count > 0;
}

// ─── Ticket Creation ─────────────────────────────────────────────────────────

export async function createTicket(
  guild: Guild,
  member: GuildMember,
  panelId?: string | null,
  topic?: string | null,
): Promise<TextChannel | null> {
  try {
    const channelName = `ticket-${member.user.username.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;

    // Vérifier si un ticket ouvert existe déjà
    const existing = await prisma.ticket.findFirst({
      where: { guildId: guild.id, userId: member.id, status: "open" },
    });
    if (existing) {
      const ch = guild.channels.cache.get(existing.channelId);
      if (ch) return null;
    }

    // Récupérer la config du panel
    let categoryId: string | undefined;
    let staffRoleId: string | undefined;
    let welcomeMsg = "Bienvenue ! Décris ton problème, le staff va te répondre rapidement.";

    if (panelId) {
      const panel = await prisma.ticketPanel.findUnique({ where: { id: panelId } });
      if (panel) {
        categoryId = panel.categoryId ?? undefined;
        staffRoleId = panel.staffRoleId ?? undefined;
        welcomeMsg = panel.welcomeMsg;
      }
    }

    // Trouver ou créer la catégorie
    let category: CategoryChannel | undefined;
    if (categoryId) {
      category = guild.channels.cache.get(categoryId) as CategoryChannel | undefined;
    }
    if (!category) {
      category = guild.channels.cache.find(
        (ch) => ch.type === ChannelType.GuildCategory && ch.name.toLowerCase() === "tickets",
      ) as CategoryChannel | undefined;
    }
    if (!category) {
      category = await guild.channels.create({
        name: "Tickets",
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        ],
      });
    }

    // Permissions
    const overwrites = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: member.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
        ],
      },
    ];

    if (staffRoleId) {
      overwrites.push({
        id: staffRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages,
        ],
      });
    }

    const ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: overwrites,
    });

    // Persister en DB
    await prisma.ticket.create({
      data: {
        guildId: guild.id,
        channelId: ticketChannel.id,
        userId: member.id,
        panelId: panelId ?? null,
        topic: topic ?? null,
        status: "open",
      },
    });

    // Message de bienvenue
    const embed = new EmbedBuilder()
      .setColor(0x00f0ff)
      .setTitle("🎫 Ticket créé")
      .setDescription(`${welcomeMsg}\n\n**Utilisateur:** ${member.toString()}\n**Sujet:** ${topic || "Non précisé"}`)
      .setFooter({ text: `Ticket ID: ${ticketChannel.id}` })
      .setTimestamp();

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket_claim")
        .setLabel("Prendre en charge")
        .setEmoji("✋")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("ticket_close")
        .setLabel("Fermer")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Danger),
    );

    await ticketChannel.send({
      content: member.toString(),
      embeds: [embed],
      components: [buttons],
    });

    await createLog({
      type: "member",
      action: "ticket_created",
      userId: member.id,
      targetId: ticketChannel.id,
      details: `Salon: #${channelName}${topic ? ` — Sujet: ${topic}` : ""}`,
    });

    logger.info(`[Ticket] Created #${channelName} for ${member.user.tag}`);
    return ticketChannel;
  } catch (error) {
    logger.error("[Ticket] Error creating ticket:", error);
    return null;
  }
}

// ─── Ticket Claim ────────────────────────────────────────────────────────────

export async function claimTicket(
  interaction: ButtonInteraction,
  channelId: string,
  claimerId: string,
): Promise<boolean> {
  try {
    const ticket = await prisma.ticket.findFirst({
      where: { channelId, status: "open" },
    });
    if (!ticket) return false;
    if (ticket.claimedBy) return false;

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { claimedBy: claimerId },
    });

    const channel = interaction.channel as TextChannel;
    if (channel) {
      await channel.permissionOverwrites.edit(claimerId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        ManageMessages: true,
      });
    }

    logger.info(`[Ticket] Claimed #${channel.name} by ${interaction.user.tag}`);
    return true;
  } catch (error) {
    logger.error("[Ticket] Error claiming:", error);
    return false;
  }
}

// ─── Ticket Close with Transcript ────────────────────────────────────────────

export async function closeTicket(
  interaction: ButtonInteraction,
  closerId: string,
): Promise<boolean> {
  try {
    const channel = interaction.channel as TextChannel;
    if (!channel || !channel.name.startsWith("ticket-")) return false;

    const ticket = await prisma.ticket.findFirst({
      where: { channelId: channel.id, status: "open" },
    });
    if (!ticket) return false;

    // Générer le transcript
    const messages = await channel.messages.fetch({ limit: 100 });
    const sorted = Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    const transcript = sorted
      .map((m) => {
        const time = m.createdAt.toLocaleString("fr-FR");
        const author = m.author?.tag || "Unknown";
        return `[${time}] ${author}: ${m.content}`;
      })
      .join("\n");

    // Sauvegarder le transcript en DB
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        status: "closed",
        closedAt: new Date(),
        closedBy: closerId,
        transcript: transcript.slice(0, 65000),
      },
    });

    await interaction.reply({
      content: "🔒 Fermeture du ticket dans 5 secondes...",
      flags: [MessageFlags.Ephemeral],
    });

    setTimeout(async () => {
      try {
        await channel.delete("Ticket fermé");
        await createLog({
          type: "member",
          action: "ticket_closed",
          userId: closerId,
          targetId: channel.id,
          details: `Salon: #${channel.name}`,
        });
      } catch (err) {
        logger.error("[Ticket] Error deleting channel:", err);
      }
    }, 5000);

    logger.info(`[Ticket] Closed #${channel.name} by ${interaction.user.tag}`);
    return true;
  } catch (error) {
    logger.error("[Ticket] Error closing:", error);
    return false;
  }
}

// ─── Ticket Add User ─────────────────────────────────────────────────────────

export async function addUserToTicket(
  channel: TextChannel,
  userId: string,
): Promise<boolean> {
  try {
    await channel.permissionOverwrites.edit(userId, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    });
    return true;
  } catch {
    return false;
  }
}

// ─── Ticket List ─────────────────────────────────────────────────────────────

export async function listOpenTickets(guildId: string) {
  return prisma.ticket.findMany({
    where: { guildId, status: "open" },
    orderBy: { createdAt: "desc" },
  });
}

export async function getTicketByChannel(channelId: string) {
  return prisma.ticket.findFirst({ where: { channelId } });
}

export async function getTicketTranscript(ticketId: string) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  return ticket?.transcript ?? null;
}
