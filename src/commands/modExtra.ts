/**
 * modExtra.ts — Commandes slash modération étendues
 *
 * CMD-27: /permission-audit — audite les permissions du serveur
 * CMD-30: /report — signalement par un membre
 */

import {
  MessageFlags,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  PermissionFlagsBits,
  TextChannel,
} from "discord.js";
import logger from "../utils/logger.js";
import { config } from "../config.js";
import { createLog } from "../services/logs.js";
import { requireAdmin } from "../services/permissions.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("permission-audit")
    .setDescription("Audite les permissions des rôles du serveur (Admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),

  new SlashCommandBuilder()
    .setName("report")
    .setDescription("Signale un membre au staff")
    .addUserOption((opt) =>
      opt.setName("membre").setDescription("Le membre à signaler").setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName("raison").setDescription("La raison du signalement").setRequired(true),
    )
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction, _client: Client) {
  try {
    switch (interaction.commandName) {
      case "permission-audit":
        if (!(await requireAdmin(interaction))) return;
        await handlePermissionAudit(interaction);
        break;
      case "report":
        await handleReport(interaction);
        break;
    }
  } catch (err) {
    logger.error("[ModExtra] Erreur:", err);
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

async function handlePermissionAudit(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const guild = interaction.guild;
  if (!guild) return;

  const roles = guild.roles.cache
    .filter((r) => r.name !== "@everyone" && !r.managed)
    .sort((a, b) => b.position - a.position)
    .first(15);

  const dangerousPerms = [
    "Administrator",
    "BanMembers",
    "KickMembers",
    "ManageChannels",
    "ManageRoles",
    "ManageGuild",
    "ManageWebhooks",
    "ManageMessages",
    "MentionEveryone",
    "ViewAuditLog",
  ];

  const fields = roles.map((role) => {
    const perms = role.permissions.toArray();
    const dangerous = perms.filter((p) => dangerousPerms.includes(p));
    const memberCount = role.members.size;
    return {
      name: role.name.slice(0, 50),
      value: `**Membres:** ${memberCount}\n**Perms dangereuses:** ${dangerous.length > 0 ? dangerous.join(", ") : "Aucune"}`,
      inline: false,
    };
  });

  const embed = new EmbedBuilder()
    .setColor(0xff9900)
    .setTitle("🔒 Audit des Permissions")
    .setDescription(`Analyse des ${roles.length} rôles les plus élevés du serveur`)
    .addFields(...fields.slice(0, 10))
    .setTimestamp()
    .setFooter({ text: "Audit automatique" });

  await interaction.editReply({ embeds: [embed] });
  logger.info(`[PermAudit] ${interaction.user.tag} a audité les permissions de ${guild.name}`);
}

async function handleReport(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getUser("membre", true);
  const reason = interaction.options.getString("raison", true);

  // Log the report
  await createLog({
    type: "report",
    action: `Signalement: ${target.tag} par ${interaction.user.tag} — ${reason}`,
    userId: interaction.user.id,
    targetId: target.id,
    details: reason.slice(0, 500),
  });

  // Send to log channel
  const logChannelId = config.logChannel;
  if (logChannelId) {
    const channel = await interaction.client.channels.fetch(logChannelId).catch(() => null);
    if (channel?.isTextBased()) {
      const embed = new EmbedBuilder()
        .setColor(0xff3344)
        .setTitle("📢 Signalement")
        .addFields(
          { name: "Signalé", value: `<@${target.id}> (${target.tag})`, inline: true },
          { name: "Par", value: `<@${interaction.user.id}>`, inline: true },
          { name: "Raison", value: reason.slice(0, 1000), inline: false },
        )
        .setTimestamp();
      await (channel as TextChannel).send({ embeds: [embed] });
    }
  }

  await interaction.reply({
    content: `✅ Ton signalement concernant ${target.tag} a été transmis au staff.`,
    flags: [MessageFlags.Ephemeral],
  });
  logger.info(`[Report] ${interaction.user.tag} reported ${target.tag}: ${reason.slice(0, 50)}`);
}
