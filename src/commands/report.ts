import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  Client,
  User,
  EmbedBuilder,
} from "discord.js";
import { sendUserReport, setReportChannel, setUserReportChannel } from "../services/reportChannel.js";
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
        .setDescription("Définit le salon des alertes bot (admin)")
        .addChannelOption((o) => o.setName("salon").setDescription("Salon où le bot envoie ses alertes de sécurité").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("set-user-channel")
        .setDescription("Définit le salon des signalements utilisateurs (admin)")
        .addChannelOption((o) => o.setName("salon").setDescription("Salon où les utilisateurs peuvent signaler").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc.setName("channel-info").setDescription("Affiche les salons de signalement configurés"),
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
      content: `✅ Salon des alertes bot défini sur ${channel} (${channel.id})`,
      ephemeral: true,
    });
    logger.info(`[Report] Bot alert channel set to ${channel.id} by ${interaction.user.tag}`);
    return;
  }

  if (action === "set-user-channel") {
    if (!interaction.memberPermissions?.has("ManageGuild")) {
      await interaction.reply({ content: "❌ Vous devez avoir la permission de gérer le serveur.", ephemeral: true });
      return;
    }
    const channel = interaction.options.getChannel("salon", true);
    await setUserReportChannel(interaction.guildId!, channel.id);
    await interaction.reply({
      content: `✅ Salon des signalements utilisateurs défini sur ${channel} (${channel.id})`,
      ephemeral: true,
    });
    logger.info(`[Report] User report channel set to ${channel.id} by ${interaction.user.tag}`);
    return;
  }

  if (action === "channel-info") {
    const prisma = (await import("../prisma.js")).default;
    const cfg = await prisma.guildConfig.findUnique({ where: { guildId: interaction.guildId! } });
    const botChannelId = cfg?.reportChannelId;
    const userChannelId = cfg?.userReportChannelId;
    const botChannel = botChannelId ? client.channels.cache.get(botChannelId) : null;
    const userChannel = userChannelId ? client.channels.cache.get(userChannelId) : null;
    await interaction.reply({
      content:
        `📢 **Salons de signalement:**\n` +
        `🤖 Alertes bot : ${botChannel || botChannelId || "❌ Non configuré"}\n` +
        `👤 Signalements utilisateurs : ${userChannel || userChannelId || "❌ Non configuré (fallback: alertes bot)"}`,
      ephemeral: true,
    });
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
