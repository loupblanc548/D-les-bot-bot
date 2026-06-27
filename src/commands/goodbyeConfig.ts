/**
 * goodbyeConfig.ts — Commande /goodbye-config
 *
 * Configurable mais DÉSACTIVÉ par défaut. L'admin doit explicitement activer.
 *
 * Subcommands : set-channel, set-message, set-title, set-color, toggle, view, test
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  ChannelType,
  TextChannel,
} from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";
import { sendGoodbyeMessage } from "../services/welcomeGoodbye.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("goodbye-config")
    .setDescription("Configure le message de départ (admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sc) =>
      sc
        .setName("set-channel")
        .setDescription("Définit le salon où envoyer les messages de départ")
        .addChannelOption((o) =>
          o
            .setName("salon")
            .setDescription("Salon de départ")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("set-message")
        .setDescription("Définit le message de départ")
        .addStringOption((o) =>
          o
            .setName("message")
            .setDescription("Message (variables: {user} {username} {tag} {server} {count})")
            .setRequired(true)
            .setMaxLength(1000),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("set-title")
        .setDescription("Définit le titre de l'embed de départ")
        .addStringOption((o) =>
          o.setName("titre").setDescription("Titre de l'embed").setRequired(true).setMaxLength(100),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("set-color")
        .setDescription("Définit la couleur de l'embed")
        .addStringOption((o) =>
          o
            .setName("couleur")
            .setDescription("Code hex sans # (ex: ed4245)")
            .setRequired(true)
            .addChoices(
              { name: "🔵 Bleu Discord", value: "5865f2" },
              { name: "🟢 Vert", value: "57f287" },
              { name: "🔴 Rouge", value: "ed4245" },
              { name: "🟡 Jaune", value: "fee75c" },
              { name: "🟣 Violet", value: "9b59b6" },
              { name: "🟠 Orange", value: "e67e22" },
              { name: "🌸 Rose", value: "eb459e" },
              { name: "⚪ Blanc", value: "ffffff" },
              { name: "⚫ Noir", value: "2f3136" },
            ),
        ),
    )
    .addSubcommand((sc) =>
      sc.setName("toggle").setDescription("Active ou désactive le message de départ"),
    )
    .addSubcommand((sc) => sc.setName("view").setDescription("Affiche la configuration actuelle"))
    .addSubcommand((sc) =>
      sc.setName("test").setDescription("Envoie un message de départ de test pour toi"),
    )
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;

  try {
    switch (sub) {
      case "set-channel":
        await handleSetChannel(interaction, guildId);
        break;
      case "set-message":
        await handleSetMessage(interaction, guildId);
        break;
      case "set-title":
        await handleSetTitle(interaction, guildId);
        break;
      case "set-color":
        await handleSetColor(interaction, guildId);
        break;
      case "toggle":
        await handleToggle(interaction, guildId);
        break;
      case "view":
        await handleView(interaction, guildId);
        break;
      case "test":
        await handleTest(interaction);
        break;
    }
  } catch (error) {
    logger.error("[GoodbyeConfig] Erreur:", error);
    try {
      if (interaction.deferred) {
        await interaction.editReply({ content: "❌ Une erreur est survenue." });
      } else {
        await interaction.reply({
          content: "❌ Une erreur est survenue.",
          flags: [MessageFlags.Ephemeral],
        });
      }
    } catch {}
  }
}

async function handleSetChannel(interaction: ChatInputCommandInteraction, guildId: string) {
  const channel = interaction.options.getChannel("salon", true) as TextChannel;

  await prisma.goodbyeConfig.upsert({
    where: { guildId },
    update: { channelId: channel.id },
    create: { guildId, channelId: channel.id },
  });

  await interaction.reply({
    content: `✅ Salon de départ défini sur ${channel}.\n⚠️ Le message de départ est encore **désactivé**. Utilise \`/goodbye-config toggle\` pour l'activer.`,
    flags: [MessageFlags.Ephemeral],
  });
}

async function handleSetMessage(interaction: ChatInputCommandInteraction, guildId: string) {
  const message = interaction.options.getString("message", true);

  await prisma.goodbyeConfig.upsert({
    where: { guildId },
    update: { message },
    create: { guildId, message },
  });

  await interaction.reply({
    content: `✅ Message de départ défini.\nVariables disponibles: \`{user}\` \`{username}\` \`{tag}\` \`{server}\` \`{count}\``,
    flags: [MessageFlags.Ephemeral],
  });
}

async function handleSetTitle(interaction: ChatInputCommandInteraction, guildId: string) {
  const title = interaction.options.getString("titre", true);

  await prisma.goodbyeConfig.upsert({
    where: { guildId },
    update: { title },
    create: { guildId, title },
  });

  await interaction.reply({
    content: `✅ Titre défini sur **${title}**.`,
    flags: [MessageFlags.Ephemeral],
  });
}

async function handleSetColor(interaction: ChatInputCommandInteraction, guildId: string) {
  const color = interaction.options.getString("couleur", true);

  await prisma.goodbyeConfig.upsert({
    where: { guildId },
    update: { color },
    create: { guildId, color },
  });

  await interaction.reply({
    content: `✅ Couleur définie sur **#${color}**.`,
    flags: [MessageFlags.Ephemeral],
  });
}

async function handleToggle(interaction: ChatInputCommandInteraction, guildId: string) {
  const config = await prisma.goodbyeConfig.findUnique({ where: { guildId } });

  if (!config?.channelId) {
    await interaction.reply({
      content: "❌ Tu dois d'abord définir un salon avec `/goodbye-config set-channel`.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const newEnabled = !config.enabled;

  await prisma.goodbyeConfig.upsert({
    where: { guildId },
    update: { enabled: newEnabled },
    create: { guildId, enabled: newEnabled, channelId: config.channelId },
  });

  await interaction.reply({
    content: newEnabled
      ? "✅ Message de départ **activé** ! Les membres qui quittent recevront un message."
      : "❌ Message de départ **désactivé**.",
    flags: [MessageFlags.Ephemeral],
  });
  logger.info(`[GoodbyeConfig] Toggle ${newEnabled ? "ON" : "OFF"} by ${interaction.user.tag}`);
}

async function handleView(interaction: ChatInputCommandInteraction, guildId: string) {
  const config = await prisma.goodbyeConfig.findUnique({ where: { guildId } });

  if (!config) {
    await interaction.reply({
      content:
        "Aucune configuration définie. Utilise `/goodbye-config set-channel` pour commencer.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("⚙️ Configuration du message de départ")
    .setColor(parseInt(config.color, 16))
    .addFields(
      { name: "Statut", value: config.enabled ? "✅ Activé" : "❌ Désactivé", inline: true },
      {
        name: "Salon",
        value: config.channelId ? `<#${config.channelId}>` : "Non défini",
        inline: true,
      },
      { name: "Couleur", value: `#${config.color}`, inline: true },
      { name: "Titre", value: config.title },
      { name: "Message", value: config.message.slice(0, 1024) },
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
}

async function handleTest(interaction: ChatInputCommandInteraction) {
  await interaction.reply({
    content: "📤 Envoi du message de test...",
    flags: [MessageFlags.Ephemeral],
  });
  await sendGoodbyeMessage(interaction.member as any);
}
