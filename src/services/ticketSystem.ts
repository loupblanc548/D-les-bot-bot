import { Client, TextChannel, EmbedBuilder, ChannelType } from "discord.js";
import logger from "../utils/logger.js";
import prisma from "../prisma.js";

const TICKET_CATEGORY = process.env.TICKET_CATEGORY_ID || "";
const TICKET_LOG_CHANNEL = process.env.TICKET_LOG_CHANNEL_ID || "";

interface TicketConfig {
  guildId: string;
  channelName: string;
  userId: string;
  reason: string;
}

export async function createTicket(client: Client, config: TicketConfig): Promise<string | null> {
  try {
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) return null;

    const channelName = `ticket-${config.channelName}`.slice(0, 50);
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: TICKET_CATEGORY || undefined,
      permissionOverwrites: [
        { id: guild.roles.everyone, deny: ["ViewChannel"] },
        { id: config.userId, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] },
      ],
    });

    const embed = new EmbedBuilder()
      .setTitle("🎫 Ticket de support")
      .setDescription(
        `**Utilisateur:** <@${config.userId}>\n**Raison:** ${config.reason}\n\nUn membre du staff va vous répondre rapidement.`,
      )
      .setColor(0x00aaff)
      .setFooter({ text: "Surveillance System • Tickets" })
      .setTimestamp();

    await channel.send({ embeds: [embed] });
    logger.info(`[Tickets] Ticket créé: #${channel.name} pour <@${config.userId}>`);
    return channel.id;
  } catch (err) {
    logger.error(`[Tickets] Erreur création: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export async function closeTicket(
  client: Client,
  channelId: string,
  closedBy: string,
): Promise<void> {
  try {
    const ticket = await prisma.sanction.findFirst({
      where: { reason: { contains: channelId } },
    });
    void ticket;

    if (TICKET_LOG_CHANNEL) {
      const logChannel = client.channels.cache.get(TICKET_LOG_CHANNEL) as TextChannel;
      if (logChannel?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setTitle("🎫 Ticket fermé")
          .setDescription(`Ticket <#${channelId}> fermé par <@${closedBy}>`)
          .setColor(0xff6600)
          .setTimestamp();
        await logChannel.send({ embeds: [embed] });
      }
    }
    logger.info(`[Tickets] Ticket ${channelId} fermé par ${closedBy}`);
  } catch (err) {
    logger.error(`[Tickets] Erreur fermeture: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function startTicketSystem(_client: Client): void {
  logger.info("[Tickets] Système de tickets activé");
}
