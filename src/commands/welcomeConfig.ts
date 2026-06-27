/**
 * welcomeConfig.ts — Commande /welcome-config
 *
 * Configurable mais DÉSACTIVÉ par défaut. L'admin doit explicitement activer.
 *
 * Subcommands : set-channel, set-message, set-title, set-color, set-image, toggle, view, test
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
import { sendWelcomeMessage } from "../services/welcomeGoodbye.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("welcome-config")
    .setDescription("Configure le message de bienvenue (admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sc) =>
      sc
        .setName("set-channel")
        .setDescription("Définit le salon où envoyer les messages de bienvenue")
        .addChannelOption((o) =>
          o
            .setName("salon")
            .setDescription("Salon de bienvenue")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("set-message")
        .setDescription("Définit le message de bienvenue")
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
        .setDescription("Définit le titre de l'embed de bienvenue")
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
            .setDescription("Code hex sans # (ex: 5865f2)")
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
      sc
        .setName("set-image")
        .setDescription("Active/désactive l'image de bienvenue générée")
        .addBooleanOption((o) =>
          o
            .setName("activer")
            .setDescription("True = image générée, False = sans image")
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("url")
            .setDescription(
              "URL d'une image personnalisée (optionnel, si image générée désactivée)",
            )
            .setRequired(false),
        ),
    )
    .addSubcommand((sc) =>
      sc.setName("toggle").setDescription("Active ou désactive le message de bienvenue"),
    )
    .addSubcommand((sc) => sc.setName("view").setDescription("Affiche la configuration actuelle"))
    .addSubcommand((sc) =>
      sc.setName("test").setDescription("Envoie un message de bienvenue de test pour toi"),
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
      case "set-image":
        await handleSetImage(interaction, guildId);
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
    logger.error("[WelcomeConfig] Erreur:", error);
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

  await prisma.welcomeConfig.upsert({
    where: { guildId },
    update: { channelId: channel.id },
    create: { guildId, channelId: channel.id },
  });

  await interaction.reply({
    content: `✅ Salon de bienvenue défini sur ${channel}.\n⚠️ Le message de bienvenue est encore **désactivé**. Utilise \`/welcome-config toggle\` pour l'activer.`,
    flags: [MessageFlags.Ephemeral],
  });
}

async function handleSetMessage(interaction: ChatInputCommandInteraction, guildId: string) {
  const message = interaction.options.getString("message", true);

  await prisma.welcomeConfig.upsert({
    where: { guildId },
    update: { message },
    create: { guildId, message },
  });

  await interaction.reply({
    content: `✅ Message de bienvenue défini.\nVariables disponibles: \`{user}\` \`{username}\` \`{tag}\` \`{server}\` \`{count}\``,
    flags: [MessageFlags.Ephemeral],
  });
}

async function handleSetTitle(interaction: ChatInputCommandInteraction, guildId: string) {
  const title = interaction.options.getString("titre", true);

  await prisma.welcomeConfig.upsert({
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

  await prisma.welcomeConfig.upsert({
    where: { guildId },
    update: { color },
    create: { guildId, color },
  });

  await interaction.reply({
    content: `✅ Couleur définie sur **#${color}**.`,
    flags: [MessageFlags.Ephemeral],
  });
}

async function handleSetImage(interaction: ChatInputCommandInteraction, guildId: string) {
  const activate = interaction.options.getBoolean("activer", true);
  const url = interaction.options.getString("url");

  await prisma.welcomeConfig.upsert({
    where: { guildId },
    update: { useImage: activate, imageUrl: url || undefined },
    create: { guildId, useImage: activate, imageUrl: url || undefined },
  });

  await interaction.reply({
    content: activate
      ? "✅ Image de bienvenue **activée** (générée automatiquement)."
      : url
        ? `✅ Image générée **désactivée**. Image personnalisée définie sur l'URL fournie.`
        : "✅ Image de bienvenue **désactivée**.",
    flags: [MessageFlags.Ephemeral],
  });
}

async function handleToggle(interaction: ChatInputCommandInteraction, guildId: string) {
  const config = await prisma.welcomeConfig.findUnique({ where: { guildId } });

  if (!config?.channelId) {
    await interaction.reply({
      content: "❌ Tu dois d'abord définir un salon avec `/welcome-config set-channel`.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const newEnabled = !config.enabled;

  await prisma.welcomeConfig.upsert({
    where: { guildId },
    update: { enabled: newEnabled },
    create: { guildId, enabled: newEnabled, channelId: config.channelId },
  });

  await interaction.reply({
    content: newEnabled
      ? "✅ Message de bienvenue **activé** ! Les nouveaux membres recevront un message."
      : "❌ Message de bienvenue **désactivé**.",
    flags: [MessageFlags.Ephemeral],
  });
  logger.info(`[WelcomeConfig] Toggle ${newEnabled ? "ON" : "OFF"} by ${interaction.user.tag}`);
}

async function handleView(interaction: ChatInputCommandInteraction, guildId: string) {
  const config = await prisma.welcomeConfig.findUnique({ where: { guildId } });

  if (!config) {
    await interaction.reply({
      content:
        "Aucune configuration définie. Utilise `/welcome-config set-channel` pour commencer.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("⚙️ Configuration du message de bienvenue")
    .setColor(parseInt(config.color, 16))
    .addFields(
      { name: "Statut", value: config.enabled ? "✅ Activé" : "❌ Désactivé", inline: true },
      {
        name: "Salon",
        value: config.channelId ? `<#${config.channelId}>` : "Non défini",
        inline: true,
      },
      { name: "Couleur", value: `#${config.color}`, inline: true },
      {
        name: "Image générée",
        value: config.useImage ? "✅ Activée" : "❌ Désactivée",
        inline: true,
      },
      { name: "Image URL", value: config.imageUrl || "Aucune", inline: true },
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
  await sendWelcomeMessage(interaction.member as any);
}
