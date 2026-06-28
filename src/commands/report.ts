import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  Client,
  User,
  EmbedBuilder,
} from "discord.js";
import { sendUserReport } from "../services/reportChannel.js";
import { setReportChannel } from "../services/reportChannel.js";
import logger from "../utils/logger.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("report")
    .setDescription("📢 Signalement — rapporte un utilisateur ou un problème")
    .addSubcommand((sc) =>
      sc
        .setName("user")
        .setDescription("Signale un utilisateur problématique")
        .addUserOption((o) => o.setName("cible").setDescription("L'utilisateur à signaler").setRequired(true))
        .addStringOption((o) => o.setName("raison").setDescription("Raison du signalement").setRequired(true))
        .addStringOption((o) => o.setName("message-url").setDescription("Lien du message incriminé").setRequired(false)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("message")
        .setDescription("Signale un message problématique (sans cibler un utilisateur précis)")
        .addStringOption((o) => o.setName("raison").setDescription("Raison du signalement").setRequired(true))
        .addStringOption((o) => o.setName("message-url").setDescription("Lien du message incriminé").setRequired(false)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("set-channel")
        .setDescription("Définit le salon de signalement (admin)")
        .addChannelOption((o) => o.setName("salon").setDescription("Le salon de signalement").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc.setName("channel-info").setDescription("Affiche le salon de signalement actuel"),
    )
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction, client: Client) {
  const action = interaction.options.getSubcommand();

  if (action === "set-channel") {
    if (!interaction.memberPermissions?.has("ManageGuild")) {
      await interaction.reply({ content: "❌ Vous devez avoir la permission de gérer le serveur.", ephemeral: true });
      return;
    }
    const channel = interaction.options.getChannel("salon", true);
    await setReportChannel(interaction.guildId!, channel.id);
    await interaction.reply({
      content: `✅ Salon de signalement défini sur ${channel} (${channel.id})`,
      ephemeral: true,
    });
    logger.info(`[Report] Channel set to ${channel.id} by ${interaction.user.tag}`);
    return;
  }

  if (action === "channel-info") {
    const prisma = (await import("../prisma.js")).default;
    const cfg = await prisma.guildConfig.findUnique({ where: { guildId: interaction.guildId! } });
    const channelId = cfg?.reportChannelId;
    if (!channelId) {
      await interaction.reply({ content: "❌ Aucun salon de signalement configuré. Utilisez `/report set-channel`.", ephemeral: true });
      return;
    }
    const channel = client.channels.cache.get(channelId);
    await interaction.reply({ content: `📢 Salon de signalement : ${channel || channelId} (${channelId})`, ephemeral: true });
    return;
  }

  if (action === "user") {
    const target = interaction.options.getUser("cible", true);
    const reason = interaction.options.getString("raison", true);
    const messageUrl = interaction.options.getString("message-url") || undefined;

    if (target.id === interaction.user.id) {
      await interaction.reply({ content: "❌ Vous ne pouvez pas vous signaler vous-même.", ephemeral: true });
      return;
    }

    await sendUserReport(client, interaction.guildId!, interaction.user, target, reason, messageUrl);
    await interaction.reply({
      content: `✅ Signalement envoyé contre ${target.tag}. Les modérateurs ont été notifiés.`,
      ephemeral: true,
    });
    logger.info(`[Report] ${interaction.user.tag} a signalé ${target.tag}: ${reason}`);
    return;
  }

  if (action === "message") {
    const reason = interaction.options.getString("raison", true);
    const messageUrl = interaction.options.getString("message-url") || undefined;

    await sendUserReport(client, interaction.guildId!, interaction.user, null, reason, messageUrl);
    await interaction.reply({
      content: "✅ Signalement envoyé. Les modérateurs ont été notifiés.",
      ephemeral: true,
    });
    logger.info(`[Report] ${interaction.user.tag} a signalé un message: ${reason}`);
    return;
  }
}
