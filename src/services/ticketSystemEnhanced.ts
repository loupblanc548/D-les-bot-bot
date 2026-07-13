/**
 * ticketSystemEnhanced.ts — Enhanced ticket system with HTML transcripts,
 * claiming, feedback, and panel buttons.
 *
 * Extends the basic ticketSystem with:
 * - Button-based ticket panel
 * - Ticket claiming (staff can claim a ticket)
 * - HTML transcript generation on close
 * - Ticket feedback (rating after close)
 * - Ticket categories
 */

import {
  Client,
  Guild,
  TextChannel,
  ChannelType,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  AttachmentBuilder,
  PermissionFlagsBits,
  Message,
} from "discord.js";
import logger from "../utils/logger.js";

export type TicketStatus = "open" | "claimed" | "closed";
export type TicketCategory = "support" | "report" | "appeal" | "question" | "other";

export interface Ticket {
  id: string;
  guildId: string;
  channelId: string;
  userId: string;
  category: TicketCategory;
  subject: string;
  status: TicketStatus;
  claimedBy?: string;
  createdAt: Date;
  closedAt?: Date;
  closedBy?: string;
  feedback?: { rating: number; comment?: string };
}

const activeTickets = new Map<string, Ticket>(); // channelId -> ticket
const ticketsByUser = new Map<string, Ticket[]>(); // userId -> tickets

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  support: "🆘 Support",
  report: "🚨 Signalement",
  appeal: "⚖️ Appel de sanction",
  question: "❓ Question",
  other: "📝 Autre",
};

const CATEGORY_COLORS: Record<TicketCategory, number> = {
  support: 0x3498db,
  report: 0xe74c3c,
  appeal: 0xf39c12,
  question: 0x2ecc71,
  other: 0x95a5a6,
};

// ─── Panel ────────────────────────────────────────────────────────────

export async function createTicketPanel(
  guild: Guild,
  channelId: string,
  title: string,
  description: string,
): Promise<Message | null> {
  const channel = guild.channels.cache.get(channelId) as TextChannel | undefined;
  if (!channel || channel.type !== ChannelType.GuildText) return null;

  const embed = new EmbedBuilder()
    .setTitle(`🎫 ${title}`)
    .setColor(0x5865f2)
    .setDescription(description)
    .setTimestamp();

  const buttons = (Object.keys(CATEGORY_LABELS) as TicketCategory[]).map((cat) =>
    new ButtonBuilder()
      .setCustomId(`ticket_create_${cat}`)
      .setLabel(CATEGORY_LABELS[cat])
      .setStyle(ButtonStyle.Primary),
  );

  // Split into rows (max 5 per row)
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < buttons.length; i += 5) {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + 5));
    rows.push(row);
  }

  return channel.send({ embeds: [embed], components: rows });
}

// ─── Create ticket ────────────────────────────────────────────────────

export async function createEnhancedTicket(
  client: Client,
  guild: Guild,
  userId: string,
  category: TicketCategory,
  subject: string,
  staffRoleId?: string,
  categoryChannelId?: string,
): Promise<Ticket | null> {
  try {
    const ticketId = `tk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const channelName = `ticket-${subject.slice(0, 40).replace(/\s+/g, "-").toLowerCase()}`;

    const permissionOverwrites = [
      { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: userId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
    ];

    if (staffRoleId) {
      permissionOverwrites.push({
        id: staffRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels,
        ],
      });
    }

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: categoryChannelId || undefined,
      permissionOverwrites,
    });

    const ticket: Ticket = {
      id: ticketId,
      guildId: guild.id,
      channelId: channel.id,
      userId,
      category,
      subject,
      status: "open",
      createdAt: new Date(),
    };

    // Welcome embed
    const embed = new EmbedBuilder()
      .setTitle(`${CATEGORY_LABELS[category]} — ${subject}`)
      .setColor(CATEGORY_COLORS[category])
      .setDescription(
        `Bienvenue <@${userId}>!\n\nUn membre du staff va vous répondre rapidement. En attendant, décrivez votre demande en détail.`,
      )
      .addFields(
        { name: "🆔 Ticket ID", value: ticketId, inline: true },
        { name: "📂 Catégorie", value: CATEGORY_LABELS[category], inline: true },
        { name: "👤 Ouvert par", value: `<@${userId}>`, inline: true },
      )
      .setTimestamp();

    // Action buttons
    const claimBtn = new ButtonBuilder()
      .setCustomId(`ticket_claim_${ticketId}`)
      .setLabel("🙋 Prendre en charge")
      .setStyle(ButtonStyle.Primary);
    const closeBtn = new ButtonBuilder()
      .setCustomId(`ticket_close_${ticketId}`)
      .setLabel("🔒 Fermer")
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(claimBtn, closeBtn);

    await channel.send({ content: `<@${userId}>`, embeds: [embed], components: [row] });

    activeTickets.set(channel.id, ticket);

    // Track by user
    if (!ticketsByUser.has(userId)) ticketsByUser.set(userId, []);
    ticketsByUser.get(userId)!.push(ticket);

    logger.info(`[TicketEnhanced] Created ${ticketId} for ${userId}: ${subject}`);
    return ticket;
  } catch (error) {
    logger.error("[TicketEnhanced] createEnhancedTicket:", String(error));
    return null;
  }
}

// ─── Claim ────────────────────────────────────────────────────────────

export async function claimTicket(channelId: string, staffId: string): Promise<Ticket | null> {
  const ticket = activeTickets.get(channelId);
  if (!ticket || ticket.status === "closed") return null;

  ticket.status = "claimed";
  ticket.claimedBy = staffId;

  const channel = (await ticket.guildId) as unknown;
  void channel;

  logger.info(`[TicketEnhanced] ${ticket.id} claimed by ${staffId}`);
  return ticket;
}

// ─── Close with transcript ────────────────────────────────────────────

export async function closeEnhancedTicket(
  client: Client,
  channelId: string,
  closedBy: string,
  logChannelId?: string,
): Promise<{ ticket: Ticket; transcript: string } | null> {
  const ticket = activeTickets.get(channelId);
  if (!ticket || ticket.status === "closed") return null;

  const guild = client.guilds.cache.get(ticket.guildId);
  if (!guild) return null;

  const channel = guild.channels.cache.get(channelId) as TextChannel | undefined;
  if (!channel) return null;

  // Generate transcript
  const transcript = await generateTicketTranscript(channel, ticket);

  ticket.status = "closed";
  ticket.closedAt = new Date();
  ticket.closedBy = closedBy;

  // Send transcript to log channel
  if (logChannelId) {
    const logChannel = guild.channels.cache.get(logChannelId) as TextChannel | undefined;
    if (logChannel && logChannel.type === ChannelType.GuildText) {
      const embed = new EmbedBuilder()
        .setTitle("🎫 Ticket fermé")
        .setColor(0xe74c3c)
        .addFields(
          { name: "🆔 ID", value: ticket.id, inline: true },
          { name: "📂 Catégorie", value: CATEGORY_LABELS[ticket.category], inline: true },
          { name: "👤 Utilisateur", value: `<@${ticket.userId}>`, inline: true },
          { name: "🔒 Fermé par", value: `<@${closedBy}>`, inline: true },
          {
            name: "⏱️ Durée",
            value: `${Math.round((Date.now() - ticket.createdAt.getTime()) / 60_000)}min`,
            inline: true,
          },
        )
        .setTimestamp();

      const attachment = new AttachmentBuilder(Buffer.from(transcript, "utf-8"), {
        name: `transcript-${ticket.id}.html`,
      });

      await logChannel.send({ embeds: [embed], files: [attachment] });
    }
  }

  // DM user with feedback request
  const user = await client.users.fetch(ticket.userId).catch(() => null);
  if (user) {
    const feedbackEmbed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🎫 Ticket fermé — Feedback")
      .setDescription(
        `Votre ticket "${ticket.subject}" a été fermé.\n\nComment évalueriez-vous votre expérience?`,
      )
      .setTimestamp();

    const rate1 = new ButtonBuilder()
      .setCustomId(`ticket_fb_1_${ticket.id}`)
      .setLabel("⭐")
      .setStyle(ButtonStyle.Secondary);
    const rate2 = new ButtonBuilder()
      .setCustomId(`ticket_fb_2_${ticket.id}`)
      .setLabel("⭐⭐")
      .setStyle(ButtonStyle.Secondary);
    const rate3 = new ButtonBuilder()
      .setCustomId(`ticket_fb_3_${ticket.id}`)
      .setLabel("⭐⭐⭐")
      .setStyle(ButtonStyle.Secondary);
    const rate4 = new ButtonBuilder()
      .setCustomId(`ticket_fb_4_${ticket.id}`)
      .setLabel("⭐⭐⭐⭐")
      .setStyle(ButtonStyle.Secondary);
    const rate5 = new ButtonBuilder()
      .setCustomId(`ticket_fb_5_${ticket.id}`)
      .setLabel("⭐⭐⭐⭐⭐")
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      rate1,
      rate2,
      rate3,
      rate4,
      rate5,
    );
    await user.send({ embeds: [feedbackEmbed], components: [row] }).catch(() => {});
  }

  // Notify in channel then delete
  await channel
    .send({ content: "🔒 Ticket fermé. Ce channel sera supprimé dans 5 secondes." })
    .catch(() => {});
  setTimeout(() => {
    channel.delete("Ticket closed").catch(() => {});
  }, 5000);

  activeTickets.delete(channelId);
  logger.info(`[TicketEnhanced] Closed ${ticket.id} by ${closedBy}`);
  return { ticket, transcript };
}

// ─── HTML Transcript ──────────────────────────────────────────────────

async function generateTicketTranscript(channel: TextChannel, ticket: Ticket): Promise<string> {
  const messages = await channel.messages.fetch({ limit: 100 });
  const sorted = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ticket Transcript — ${ticket.id}</title>`;
  html += `<style>`;
  html += `body{font-family:Whitney,Arial,sans-serif;max-width:900px;margin:0 auto;padding:20px;background:#36393f;color:#dcddde}`;
  html += `h1{color:#5865f2;border-bottom:2px solid #5865f2;padding-bottom:10px}`;
  html += `.info{background:#40444b;padding:15px;border-radius:8px;margin:10px 0}`;
  html += `.msg{padding:10px;margin:5px 0;border-radius:8px;background:#40444b}`;
  html += `.author{font-weight:bold}`;
  html += `.staff{color:#5865f2}.user{color:#2ecc71}`;
  html += `.timestamp{font-size:0.8em;color:#72767d;float:right}`;
  html += `.content{margin-top:5px;word-wrap:break-word}`;
  html += `</style></head><body>`;
  html += `<h1>🎫 Ticket Transcript</h1>`;
  html += `<div class="info">`;
  html += `<b>Ticket ID:</b> ${ticket.id}<br>`;
  html += `<b>Subject:</b> ${ticket.subject}<br>`;
  html += `<b>Category:</b> ${CATEGORY_LABELS[ticket.category]}<br>`;
  html += `<b>User:</b> <@${ticket.userId}> (${ticket.userId})<br>`;
  html += `<b>Opened:</b> ${ticket.createdAt.toISOString()}<br>`;
  html += `<b>Closed:</b> ${ticket.closedAt?.toISOString() ?? "N/A"}<br>`;
  html += `<b>Closed by:</b> ${ticket.closedBy ?? "N/A"}`;
  html += `</div><hr>`;

  for (const [, msg] of sorted) {
    const isStaff = msg.author.id !== ticket.userId;
    const roleClass = isStaff ? "staff" : "user";
    const content = msg.content.replace(/</g, "&lt;").replace(/>/g, "&gt;");

    html += `<div class="msg">`;
    html += `<span class="author ${roleClass}">${msg.author.tag}${isStaff ? " [Staff]" : ""}</span>`;
    html += `<span class="timestamp">${msg.createdAt.toISOString()}</span>`;
    html += `<div class="content">${content || "<i>(empty/embed)</i>"}</div>`;

    if (msg.attachments.size > 0) {
      html += `<div class="content"><i>Attachments: ${msg.attachments.map((a) => a.url).join(", ")}</i></div>`;
    }

    html += `</div>`;
  }

  html += `</body></html>`;
  return html;
}

// ─── Feedback ─────────────────────────────────────────────────────────

export function setFeedback(ticketId: string, rating: number, comment?: string): boolean {
  for (const [, ticket] of activeTickets) {
    if (ticket.id === ticketId) {
      ticket.feedback = { rating, comment };
      logger.info(`[TicketEnhanced] Feedback for ${ticketId}: ${rating}/5`);
      return true;
    }
  }
  // Also check closed tickets in user map
  for (const [, tickets] of ticketsByUser) {
    const ticket = tickets.find((t) => t.id === ticketId);
    if (ticket) {
      ticket.feedback = { rating, comment };
      return true;
    }
  }
  return false;
}

// ─── Stats ────────────────────────────────────────────────────────────

export function getTicketStats(guildId: string): {
  open: number;
  claimed: number;
  closed: number;
  avgRating: number;
} {
  const all = Array.from(activeTickets.values()).filter((t) => t.guildId === guildId);
  const closed = all.filter((t) => t.status === "closed");
  const ratings = closed.filter((t) => t.feedback).map((t) => t.feedback!.rating);
  return {
    open: all.filter((t) => t.status === "open").length,
    claimed: all.filter((t) => t.status === "claimed").length,
    closed: closed.length,
    avgRating: ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0,
  };
}

export function getTicketByChannelId(channelId: string): Ticket | null {
  return activeTickets.get(channelId) ?? null;
}

export function getUserTickets(userId: string): Ticket[] {
  return ticketsByUser.get(userId) ?? [];
}
