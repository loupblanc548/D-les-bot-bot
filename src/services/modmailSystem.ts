/**
 * modmailSystem.ts — Modmail: DM the bot → private ticket for staff
 *
 * Users DM the bot → creates a thread in a modmail channel → staff replies
 * → user gets DM'd back. Full conversation tracking with close/transcript.
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
  ThreadChannel,
  User,
  Message,
} from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";

export interface ModmailTicket {
  id: string;
  userId: string;
  guildId: string;
  threadId: string;
  channelId: string;
  openedAt: Date;
  closed: boolean;
  closedBy?: string;
  messageCount: number;
}

const activeTickets = new Map<string, ModmailTicket>(); // userId -> ticket
const ticketByThread = new Map<string, ModmailTicket>(); // threadId -> ticket

// ─── Config ───────────────────────────────────────────────────────────

export interface ModmailConfig {
  channelId?: string;
  staffRoleId?: string;
  logChannelId?: string;
  categoryChannelId?: string;
}

const configs = new Map<string, ModmailConfig>();

export async function getModmailConfig(guildId: string): Promise<ModmailConfig> {
  const cached = configs.get(guildId);
  if (cached) return cached;
  try {
    const record = await prisma.guildConfig.findUnique({ where: { guildId } }).catch(() => null);
    if (record?.modmailConfig) {
      const parsed = JSON.parse(record.modmailConfig as string) as ModmailConfig;
      configs.set(guildId, parsed);
      return parsed;
    }
  } catch { /* ignore */ }
  return {};
}

export async function setModmailConfig(guildId: string, config: Partial<ModmailConfig>): Promise<void> {
  try {
    const current = await getModmailConfig(guildId);
    const merged = { ...current, ...config };
    configs.set(guildId, merged);
    await prisma.guildConfig.upsert({
      where: { guildId },
      create: { guildId, modmailConfig: JSON.stringify(merged) },
      update: { modmailConfig: JSON.stringify(merged) },
    }).catch(() => {});
  } catch (error) {
    logger.error("[Modmail] setModmailConfig:", String(error));
  }
}

// ─── Open ticket ──────────────────────────────────────────────────────

export async function openTicket(
  client: Client,
  guild: Guild,
  user: User,
  initialMessage: string,
): Promise<ModmailTicket | null> {
  // Check if user already has an open ticket
  const existing = activeTickets.get(user.id);
  if (existing && !existing.closed) {
    return existing;
  }

  const config = await getModmailConfig(guild.id);
  if (!config.channelId) {
    logger.warn("[Modmail] No channel configured for guild", guild.id);
    return null;
  }

  const channel = guild.channels.cache.get(config.channelId) as TextChannel | undefined;
  if (!channel || channel.type !== ChannelType.GuildText) return null;

  const ticketId = `mm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  // Create embed for the thread starter
  const embed = new EmbedBuilder()
    .setTitle(`📨 Modmail — ${user.tag}`)
    .setColor(0x5865f2)
    .addFields(
      { name: "👤 Utilisateur", value: `<@${user.id}>`, inline: true },
      { name: "🆔 ID", value: ticketId, inline: true },
      { name: "💬 Message", value: initialMessage.slice(0, 1024), inline: false },
    )
    .setTimestamp();

  const closeButton = new ButtonBuilder()
    .setCustomId(`modmail_close_${ticketId}`)
    .setLabel("🔒 Fermer")
    .setStyle(ButtonStyle.Danger);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(closeButton);

  const threadMessage = await channel.send({ embeds: [embed], components: [row] });

  // Create thread
  const thread = await threadMessage.startThread({
    name: `modmail-${user.username}`,
    autoArchiveDuration: 1440,
  });

  const ticket: ModmailTicket = {
    id: ticketId,
    userId: user.id,
    guildId: guild.id,
    threadId: thread.id,
    channelId: channel.id,
    openedAt: new Date(),
    closed: false,
    messageCount: 1,
  };

  activeTickets.set(user.id, ticket);
  ticketByThread.set(thread.id, ticket);

  // DM user confirmation
  const confirmEmbed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle("✅ Modmail ouvert")
    .setDescription("Votre message a été transmis au staff. Vous recevrez les réponses ici.")
    .setTimestamp();
  await user.send({ embeds: [confirmEmbed] }).catch(() => {});

  logger.info(`[Modmail] Opened ticket ${ticketId} for ${user.tag} in ${guild.id}`);
  return ticket;
}

// ─── Staff reply ──────────────────────────────────────────────────────

export async function staffReply(
  client: Client,
  threadId: string,
  staffUser: User,
  content: string,
): Promise<boolean> {
  const ticket = ticketByThread.get(threadId);
  if (!ticket || ticket.closed) return false;

  const user = await client.users.fetch(ticket.userId).catch(() => null);
  if (!user) return false;

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📨 Réponse du staff — ${staffUser.tag}`)
    .setDescription(content.slice(0, 4096))
    .setTimestamp();

  await user.send({ embeds: [embed] }).catch(() => {});
  ticket.messageCount++;
  return true;
}

// ─── User reply (from DM) ─────────────────────────────────────────────

export async function userReply(
  client: Client,
  userId: string,
  content: string,
): Promise<boolean> {
  const ticket = activeTickets.get(userId);
  if (!ticket || ticket.closed) return false;

  const guild = client.guilds.cache.get(ticket.guildId);
  if (!guild) return false;

  const thread = guild.channels.cache.get(ticket.threadId) as ThreadChannel | undefined;
  if (!thread) return false;

  const embed = new EmbedBuilder()
    .setColor(0x95a5a6)
    .setTitle("💬 Réponse utilisateur")
    .setDescription(content.slice(0, 4096))
    .setTimestamp();

  await thread.send({ embeds: [embed] }).catch(() => {});
  ticket.messageCount++;
  return true;
}

// ─── Close ticket ─────────────────────────────────────────────────────

export async function closeTicket(
  client: Client,
  threadId: string,
  closedBy: string,
): Promise<ModmailTicket | null> {
  const ticket = ticketByThread.get(threadId);
  if (!ticket || ticket.closed) return null;

  ticket.closed = true;
  ticket.closedBy = closedBy;

  const guild = client.guilds.cache.get(ticket.guildId);
  if (guild) {
    const thread = guild.channels.cache.get(ticket.threadId) as ThreadChannel | undefined;
    if (thread) {
      const embed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle("🔒 Ticket fermé")
        .setDescription(`Fermé par <@${closedBy}>\nMessages: ${ticket.messageCount}`)
        .setTimestamp();
      await thread.send({ embeds: [embed] }).catch(() => {});
      await thread.setArchived(true, "Modmail closed").catch(() => {});
    }
  }

  // DM user
  const user = await client.users.fetch(ticket.userId).catch(() => null);
  if (user) {
    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle("🔒 Modmail fermé")
      .setDescription("Votre ticket modmail a été fermé par le staff. Vous pouvez en ouvrir un nouveau en envoyant un DM au bot.")
      .setTimestamp();
    await user.send({ embeds: [embed] }).catch(() => {});
  }

  activeTickets.delete(ticket.userId);
  ticketByThread.delete(threadId);

  logger.info(`[Modmail] Closed ticket ${ticket.id} by ${closedBy}`);
  return ticket;
}

// ─── Generate transcript ──────────────────────────────────────────────

export async function generateTranscript(
  client: Client,
  threadId: string,
): Promise<string> {
  const ticket = ticketByThread.get(threadId);
  if (!ticket) return "Ticket not found";

  const guild = client.guilds.cache.get(ticket.guildId);
  if (!guild) return "Guild not found";

  const thread = guild.channels.cache.get(ticket.threadId) as ThreadChannel | undefined;
  if (!thread) return "Thread not found";

  const messages = await thread.messages.fetch({ limit: 100 });
  const sorted = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Modmail Transcript — ${ticket.id}</title>`;
  html += `<style>body{font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:20px;background:#36393f;color:#dcddde}h1{color:#5865f2}.msg{padding:10px;margin:5px 0;border-radius:8px;background:#40444b}.author{font-weight:bold;color:#5865f2}.timestamp{font-size:0.8em;color:#72767d}.content{margin-top:5px}</style>`;
  html += `</head><body><h1>📨 Modmail Transcript</h1>`;
  html += `<p><b>Ticket:</b> ${ticket.id}<br><b>User:</b> <@${ticket.userId}><br><b>Opened:</b> ${ticket.openedAt.toISOString()}<br><b>Messages:</b> ${ticket.messageCount}</p><hr>`;

  for (const [, msg] of sorted) {
    const isStaff = msg.author.id !== ticket.userId;
    html += `<div class="msg">`;
    html += `<span class="author">${msg.author.tag}${isStaff ? " (Staff)" : ""}</span> `;
    html += `<span class="timestamp">${msg.createdAt.toISOString()}</span>`;
    html += `<div class="content">${msg.content.replace(/</g, "&lt;")}</div>`;
    html += `</div>`;
  }

  html += `</body></html>`;
  return html;
}

// ─── Stats ────────────────────────────────────────────────────────────

export function getModmailStats(): { activeCount: number; totalTracked: number } {
  return {
    activeCount: Array.from(activeTickets.values()).filter((t) => !t.closed).length,
    totalTracked: activeTickets.size,
  };
}

export function getTicketByThreadId(threadId: string): ModmailTicket | null {
  return ticketByThread.get(threadId) ?? null;
}

export function hasOpenTicket(userId: string): boolean {
  const ticket = activeTickets.get(userId);
  return !!ticket && !ticket.closed;
}
