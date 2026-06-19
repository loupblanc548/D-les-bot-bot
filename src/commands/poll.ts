import logger from "../utils/logger.js";
import {
  MessageFlags,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType,
  ButtonInteraction,
} from "discord.js";
import prisma from "../prisma.js";

const FOOTER = { text: "Sondage • Phase 1" };

export const commands = [
  new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Créer un sondage interactif avec boutons")
    .addStringOption((option) =>
      option.setName("question").setDescription("Question du sondage").setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("option1").setDescription("Option 1").setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("option2").setDescription("Option 2").setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("option3").setDescription("Option 3 (optionnel)").setRequired(false),
    )
    .addStringOption((option) =>
      option.setName("option4").setDescription("Option 4 (optionnel)").setRequired(false),
    )
    .addIntegerOption((option) =>
      option
        .setName("duration")
        .setDescription("Durée en minutes (optionnel)")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(10080),
    )
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  const question = interaction.options.getString("question", true);
  const option1 = interaction.options.getString("option1", true);
  const option2 = interaction.options.getString("option2", true);
  const option3 = interaction.options.getString("option3");
  const option4 = interaction.options.getString("option4");
  const duration = interaction.options.getInteger("duration");

  const guildId = interaction.guildId;
  const channelId = interaction.channelId;
  const authorId = interaction.user.id;

  if (!guildId) {
    await interaction.reply({
      content: "❌ Cette commande ne peut être utilisée que dans un serveur.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const options = [
    { id: 0, label: option1, votes: 0 },
    { id: 1, label: option2, votes: 0 },
  ];

  if (option3) options.push({ id: 2, label: option3, votes: 0 });
  if (option4) options.push({ id: 3, label: option4, votes: 0 });

  const expiresAt = duration ? new Date(Date.now() + duration * 60 * 1000) : null;

  try {
    await interaction.deferReply();

    const embed = new EmbedBuilder()
      .setTitle(`📊 ${question}`)
      .setDescription(options.map((opt, i) => `${i + 1}. ${opt.label} - 0 votes`).join("\n"))
      .setColor(0x5865f2)
      .setFooter(FOOTER)
      .setTimestamp();

    if (expiresAt) {
      embed.addFields({
        name: "⏱️ Fin dans",
        value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`,
      });
    }

    const buttons = options.map((opt) =>
      new ButtonBuilder()
        .setCustomId(`poll_vote_${opt.id}`)
        .setLabel(opt.label.substring(0, 80))
        .setStyle(ButtonStyle.Primary),
    );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);

    const message = await interaction.editReply({ embeds: [embed], components: [row] });

    await prisma.poll.create({
      data: {
        guildId,
        channelId,
        messageId: message.id,
        authorId,
        question,
        options: JSON.stringify(options),
        active: true,
        expiresAt,
      },
    });

    logger.info(`[Poll] Sondage créé par ${authorId}: ${question}`);
  } catch (error) {
    logger.error("[Poll] Erreur création sondage:", error);
    try {
      if (interaction.deferred) {
        await interaction.editReply({ content: "❌ Erreur lors de la création du sondage." });
      } else {
        await interaction.reply({
          content: "❌ Erreur lors de la création du sondage.",
          flags: [MessageFlags.Ephemeral],
        });
      }
    } catch (err) {
      logger.error("[Poll] Erreur reply:", err);
    }
  }
}

export async function handleButtonInteraction(interaction: ButtonInteraction) {
  const customId = interaction.customId;

  if (!customId.startsWith("poll_vote_")) return;

  const optionIndex = parseInt(customId.replace("poll_vote_", ""), 10);
  const userId = interaction.user.id;
  const messageId = interaction.message.id;

  try {
    const poll = await prisma.poll.findFirst({
      where: { messageId },
      include: { votes: true },
    });

    if (!poll) {
      await interaction.reply({
        content: "❌ Sondage introuvable.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    if (!poll.active) {
      await interaction.reply({
        content: "❌ Ce sondage est terminé.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const existingVote = await prisma.pollVote.findUnique({
      where: { pollId_userId: { pollId: poll.id, userId } },
    });

    if (existingVote) {
      await prisma.pollVote.update({
        where: { id: existingVote.id },
        data: { option: optionIndex },
      });
    } else {
      await prisma.pollVote.create({
        data: { pollId: poll.id, userId, option: optionIndex },
      });
    }

    const allVotes = await prisma.pollVote.findMany({ where: { pollId: poll.id } });
    const voteCounts = allVotes.reduce(
      (acc, vote) => {
        acc[vote.option] = (acc[vote.option] || 0) + 1;
        return acc;
      },
      {} as Record<number, number>,
    );

    const options = JSON.parse(poll.options) as Array<{ id: number; label: string; votes: number }>;
    const updatedOptions = options.map((opt) => ({
      ...opt,
      votes: voteCounts[opt.id] || 0,
    }));

    await prisma.poll.update({
      where: { id: poll.id },
      data: { options: JSON.stringify(updatedOptions) },
    });

    const embed = new EmbedBuilder()
      .setTitle(`📊 ${poll.question}`)
      .setDescription(
        updatedOptions.map((opt, i) => `${i + 1}. ${opt.label} - ${opt.votes} votes`).join("\n"),
      )
      .setColor(0x5865f2)
      .setFooter(FOOTER)
      .setTimestamp();

    if (poll.expiresAt) {
      embed.addFields({
        name: "⏱️ Fin dans",
        value: `<t:${Math.floor(poll.expiresAt.getTime() / 1000)}:R>`,
      });
    }

    await interaction.update({ embeds: [embed] });

    logger.info(`[Poll] Vote de ${userId} pour option ${optionIndex}`);
  } catch (error) {
    logger.error("[Poll] Erreur vote:", error);
    await interaction.reply({
      content: "❌ Erreur lors du vote.",
      flags: [MessageFlags.Ephemeral],
    });
  }
}
