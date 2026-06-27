/**
 * dashboard.ts — Commande /dashboard (CMD-02) + /bot-health (CMD-56)
 *
 * /dashboard : vue d'ensemble globale admin (stats serveur, bot, modération)
 * /bot-health : santé du bot (memory, CPU, latence, erreurs)
 */

import {
  MessageFlags,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import logger from "../utils/logger.js";
import prisma from "../prisma.js";
import { requireAdmin } from "../services/permissions.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("dashboard")
    .setDescription("Vue d'ensemble globale du serveur et du bot (Admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),

  new SlashCommandBuilder()
    .setName("bot-health")
    .setDescription("Affiche la santé du bot (mémoire, latence, uptime)")
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction, client: Client) {
  try {
    switch (interaction.commandName) {
      case "dashboard":
        if (!(await requireAdmin(interaction))) return;
        await handleDashboard(interaction, client);
        break;
      case "bot-health":
        await handleBotHealth(interaction, client);
        break;
    }
  } catch (err) {
    logger.error("[Dashboard] Erreur:", err);
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

async function handleDashboard(interaction: ChatInputCommandInteraction, client: Client) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply({ content: "Commande utilisable uniquement dans un serveur." });
    return;
  }

  const memUsage = process.memoryUsage();
  const heapMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  const ping = client.ws.ping;
  const uptime = process.uptime();
  const uptimeStr = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`;

  const totalMembers = guild.memberCount;
  const onlineMembers = guild.members.cache.filter((m) => m.presence?.status !== "offline").size;
  const botCount = guild.members.cache.filter((m) => m.user.bot).size;
  const channelCount = guild.channels.cache.size;
  const roleCount = guild.roles.cache.size;

  // Stats DB
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  let logCount24h = 0;
  let notifCount24h = 0;
  let modCount24h = 0;

  try {
    logCount24h = await prisma.log.count({ where: { createdAt: { gte: since24h } } });
  } catch {
    /* ignore */
  }
  try {
    notifCount24h = await prisma.notification.count({ where: { sentAt: { gte: since24h } } });
  } catch {
    /* ignore */
  }
  try {
    modCount24h = await prisma.log.count({
      where: {
        type: { in: ["ban", "kick", "mute", "warn", "timeout"] },
        createdAt: { gte: since24h },
      },
    });
  } catch {
    /* ignore */
  }

  const embed = new EmbedBuilder()
    .setColor(0x2f3136)
    .setTitle("📊 Dashboard — Vue d'ensemble")
    .setThumbnail(guild.iconURL() || null)
    .addFields(
      {
        name: "🖥️ Serveur",
        value: `**Membres:** ${totalMembers}\n**En ligne:** ${onlineMembers}\n**Bots:** ${botCount}\n**Salons:** ${channelCount}\n**Rôles:** ${roleCount}`,
        inline: true,
      },
      {
        name: "🤖 Bot",
        value: `**Mémoire:** ${heapMB}MB\n**Latence:** ${ping}ms\n**Uptime:** ${uptimeStr}\n**Serveurs:** ${client.guilds.cache.size}`,
        inline: true,
      },
      {
        name: "📈 Activité 24h",
        value: `**Logs:** ${logCount24h}\n**Notifications:** ${notifCount24h}\n**Sanctions:** ${modCount24h}`,
        inline: true,
      },
    )
    .setTimestamp()
    .setFooter({ text: `Dashboard de ${guild.name}` });

  await interaction.editReply({ embeds: [embed] });
}

async function handleBotHealth(interaction: ChatInputCommandInteraction, client: Client) {
  const memUsage = process.memoryUsage();
  const heapMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  const rssMB = Math.round(memUsage.rss / 1024 / 1024);
  const ping = client.ws.ping;
  const uptime = process.uptime();
  const uptimeStr = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`;

  const status = heapMB > 500 ? "⚠️" : ping > 500 ? "⚠️" : "✅";
  const color = heapMB > 500 || ping > 500 ? 0xff9900 : 0x57f287;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${status} Bot Health Check`)
    .addFields(
      { name: "Mémoire (Heap)", value: `${heapMB}MB`, inline: true },
      { name: "Mémoire (RSS)", value: `${rssMB}MB`, inline: true },
      { name: "Latence API", value: `${ping}ms`, inline: true },
      { name: "Uptime", value: uptimeStr, inline: true },
      { name: "Serveurs", value: `${client.guilds.cache.size}`, inline: true },
      { name: "Status", value: status, inline: true },
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
}
