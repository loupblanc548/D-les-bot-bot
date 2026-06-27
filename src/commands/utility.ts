import logger from "../utils/logger.js";
// Commandes Utilitaires UI & Affichage
// embed-builder (Modal), say, translate

import {
  Message,
  MessageFlags,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
  TextChannel,
  ChannelType,
} from "discord.js";
import { createLog } from "../services/logs.js";

// ===== Définition des commandes =====

export const commands = [
  new SlashCommandBuilder()
    .setName("embed-builder")
    .setDescription("Ouvre un formulaire pour créer un embed personnalisé")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .toJSON(),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Fait parler le bot dans un salon spécifique")
    .addChannelOption((opt) =>
      opt
        .setName("salon")
        .setDescription("Le salon où envoyer le message")
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    )
    .addStringOption((opt) =>
      opt.setName("message").setDescription("Le message à envoyer").setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .toJSON(),
  // /poll
  new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Créer un sondage interactif")
    .addStringOption((o) =>
      o.setName("question").setDescription("La question du sondage").setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("options")
        .setDescription("Options séparées par des virgules (max 10, ex: Oui,Non,Peut-être)")
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .toJSON(),
];

// ===== Handler principal =====

export async function handleCommand(interaction: ChatInputCommandInteraction, client: Client) {
  try {
    switch (interaction.commandName) {
      case "embed-builder":
        await handleEmbedBuilder(interaction);
        break;
      case "poll":
        await handlePoll(interaction);
        break;
      case "say":
        await handleSay(interaction, client);
        break;
    }
  } catch (err) {
    logger.error("[Utility] Erreur:", err);
    const errorEmbed = new EmbedBuilder()
      .setColor(0xff3344)
      .setDescription("Une erreur est survenue.");
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], flags: [MessageFlags.Ephemeral] });
      }
    } catch {
      // silencieux
    }
  }
}

// ===== Gestion des modals (exporté pour index.ts) =====

export async function handleModalSubmit(interaction: ModalSubmitInteraction, _client: Client) {
  if (interaction.customId !== "embed_builder_modal") return;

  try {
    const title = interaction.fields.getTextInputValue("embed_title");
    const description = interaction.fields.getTextInputValue("embed_description");
    const colorHex = interaction.fields.getTextInputValue("embed_color") || "5865F2";
    const imageUrl = interaction.fields.getTextInputValue("embed_image") || "";

    // Valider la couleur hex
    const colorInt = parseInt(colorHex.replace("#", ""), 16);
    if (isNaN(colorInt)) {
      await interaction.reply({
        content: "Code couleur invalide. Utilise un hexadécimal comme `5865F2`.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(colorInt)
      .setTitle(title)
      .setDescription(description)
      .setFooter({ text: "Créé par " + interaction.user.tag })
      .setTimestamp();

    if (imageUrl) {
      embed.setImage(imageUrl);
    }

    await (interaction.channel as TextChannel).send({ embeds: [embed] });

    await interaction.reply({
      content: "Embed envoyé !",
      flags: [MessageFlags.Ephemeral],
    });

    // Log
    await createLog({
      type: "member",
      action: "embed_builder_used",
      userId: interaction.user.id,
      details: 'Titre: "' + title + '"',
    });
  } catch (err) {
    logger.error("[Utility] Erreur modal embed-builder:", err);
    try {
      await interaction.reply({
        content: "Erreur lors de la création de l'embed.",
        flags: [MessageFlags.Ephemeral],
      });
    } catch {
      // silencieux
    }
  }
}

// ===== /embed-builder (affiche le Modal) =====

async function handleEmbedBuilder(interaction: ChatInputCommandInteraction) {
  const modal = new ModalBuilder().setCustomId("embed_builder_modal").setTitle("Créer un embed");

  const titleInput = new TextInputBuilder()
    .setCustomId("embed_title")
    .setLabel("Titre de l'embed")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(256)
    .setPlaceholder("Annonce importante");

  const descriptionInput = new TextInputBuilder()
    .setCustomId("embed_description")
    .setLabel("Description")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(4000)
    .setPlaceholder("Contenu détaillé de l'embed...");

  const colorInput = new TextInputBuilder()
    .setCustomId("embed_color")
    .setLabel("Couleur (hex)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(7)
    .setPlaceholder("5865F2")
    .setValue("5865F2");

  const imageInput = new TextInputBuilder()
    .setCustomId("embed_image")
    .setLabel("URL de l'image (optionnel)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(500)
    .setPlaceholder("https://example.com/image.png");

  const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput);
  const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput);
  const row3 = new ActionRowBuilder<TextInputBuilder>().addComponents(colorInput);
  const row4 = new ActionRowBuilder<TextInputBuilder>().addComponents(imageInput);

  modal.addComponents(row1, row2, row3, row4);

  await interaction.showModal(modal);
}

// ===== /poll =====
async function handlePoll(interaction: ChatInputCommandInteraction) {
  const question = interaction.options.getString("question", true);
  const optionsStr = interaction.options.getString("options", true);

  const optionsList = optionsStr
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o.length > 0);

  // Validations AVANT deferReply (utilisent reply)
  if (optionsList.length < 2) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("Erreur")
          .setColor(0xff3344)
          .setDescription("Il faut au moins 2 options."),
      ],
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  if (optionsList.length > 10) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("Erreur")
          .setColor(0xff3344)
          .setDescription("Maximum 10 options."),
      ],
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.deferReply();
  try {
    const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

    const description = optionsList.map((opt, idx) => `${emojis[idx]} **${opt}**`).join(`\n\n`);

    const embed = new EmbedBuilder()
      .setTitle(question)
      .setDescription(description)
      .setColor(0x3498db)
      .setFooter({
        text: `Sondage de ${interaction.user.tag}`,
        iconURL: interaction.user.displayAvatarURL(),
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    const message = await interaction.fetchReply();
    for (let idx = 0; idx < optionsList.length; idx++) {
      try {
        await (message as Message).react(emojis[idx]);
      } catch (_) {
        // Reaction impossible, on continue
      }
    }
  } catch (error) {
    logger.error("[CRASH COMMANDE POLL]:", error);
    try {
      await interaction.editReply({ content: "❌ Erreur lors de la création du sondage." });
    } catch {
      try {
        await interaction.followUp({
          content: "❌ Erreur lors de la création du sondage.",
          ephemeral: true,
        });
      } catch {
        // Ignore follow-up errors
      }
    }
  }
}

// ===== /say =====

async function handleSay(interaction: ChatInputCommandInteraction, client: Client) {
  const channel = interaction.options.getChannel("salon", true) as TextChannel;
  const message = interaction.options.getString("message", true);

  // Vérification AVANT deferReply (utilise reply)
  if (
    !channel
      .permissionsFor(client.user!)
      ?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])
  ) {
    await interaction.reply({
      content: "Je n'ai pas la permission d'envoyer des messages dans ce salon.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  try {
    await channel.send(message);

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x53fc18)
          .setDescription("Message envoyé dans " + channel.toString()),
      ],
    });

    // Log
    await createLog({
      type: "member",
      action: "say_command_used",
      userId: interaction.user.id,
      targetId: channel.id,
      details: '"' + message.slice(0, 200) + '"',
    });
  } catch (error) {
    logger.error("[CRASH COMMANDE SAY]:", error);
    try {
      await interaction.editReply({ content: "❌ Erreur lors de l'envoi du message." });
    } catch {
      try {
        await interaction.followUp({
          content: "❌ Erreur lors de l'envoi du message.",
          ephemeral: true,
        });
      } catch {
        // Ignore follow-up errors
      }
    }
  }
}
