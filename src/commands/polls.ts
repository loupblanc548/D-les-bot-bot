/**
 * polls.ts — Système de sondages avec barres de progression en temps réel
 */
import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType,
} from "discord.js";
import logger from "../utils/logger.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Crée un sondage avec options et barres de progression")
    .addStringOption((o) => o.setName("question").setDescription("La question").setRequired(true))
    .addStringOption((o) => o.setName("option1").setDescription("Option 1").setRequired(true))
    .addStringOption((o) => o.setName("option2").setDescription("Option 2").setRequired(true))
    .addStringOption((o) => o.setName("option3").setDescription("Option 3").setRequired(false))
    .addStringOption((o) => o.setName("option4").setDescription("Option 4").setRequired(false))
    .addStringOption((o) => o.setName("option5").setDescription("Option 5").setRequired(false))
    .addIntegerOption((o) =>
      o.setName("duree").setDescription("Durée en minutes (défaut: 60)").setRequired(false).setMinValue(1).setMaxValue(10080),
    )
    .toJSON(),
];

const activePolls = new Map<string, { question: string; options: string[]; votes: Map<number, string[]>; endTime: number }>();

function renderBar(percent: number, length = 20): string {
  const filled = Math.round((percent / 100) * length);
  return "█".repeat(filled) + "░".repeat(length - filled);
}

export async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (interaction.commandName !== "poll") return;

  const question = interaction.options.getString("question", true);
  const duration = interaction.options.getInteger("duree") || 60;
  const options: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const opt = interaction.options.getString(`option${i}`);
    if (opt) options.push(opt);
  }

  if (options.length < 2) {
    await interaction.reply({ content: "❌ Au moins 2 options requises.", flags: [MessageFlags.Ephemeral] });
    return;
  }

  const endTime = Date.now() + duration * 60 * 1000;
  const pollId = `poll_${Date.now()}`;
  activePolls.set(pollId, { question, options, votes: new Map(), endTime });

  const buttons = options.map((opt, i) =>
    new ButtonBuilder().setCustomId(`poll_vote_${pollId}_${i}`).setLabel(`${i + 1}. ${opt.substring(0, 70)}`).setStyle(ButtonStyle.Primary),
  );

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + 5)));
  }

  const embed = buildPollEmbed(pollId, interaction.user.username);
  await interaction.reply({ embeds: [embed], components: rows });

  const message = await interaction.fetchReply();
  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: duration * 60 * 1000,
  });

  collector.on("collect", async (btnInteraction) => {
    const poll = activePolls.get(pollId);
    if (!poll) return;

    const match = btnInteraction.customId.match(/poll_vote_.*_(\d+)$/);
    if (!match) return;
    const optionIdx = parseInt(match[1]);

    // Remove previous vote from this user
    for (const [idx, voters] of poll.votes) {
      const pos = voters.indexOf(btnInteraction.user.id);
      if (pos !== -1) voters.splice(pos, 1);
    }

    // Add new vote
    if (!poll.votes.has(optionIdx)) poll.votes.set(optionIdx, []);
    poll.votes.get(optionIdx)!.push(btnInteraction.user.id);

    const updatedEmbed = buildPollEmbed(pollId, interaction.user.username);
    await btnInteraction.update({ embeds: [updatedEmbed] });
  });

  collector.on("end", async () => {
    activePolls.delete(pollId);
    const finalEmbed = buildPollEmbed(pollId, interaction.user.username, true);
    await message.edit({ embeds: [finalEmbed], components: [] }).catch(() => {});
  });
}

function buildPollEmbed(pollId: string, author: string, finished = false): EmbedBuilder {
  const poll = activePolls.get(pollId);
  if (!poll) return new EmbedBuilder().setTitle("Sondage terminé");

  const totalVotes = Array.from(poll.votes.values()).reduce((sum, voters) => sum + voters.length, 0);

  const embed = new EmbedBuilder()
    .setTitle("📊 " + poll.question)
    .setColor(finished ? 0x6366f1 : 0x818cf8)
    .setFooter({ text: finished ? "Sondage terminé" : `Se termine <t:${Math.floor(poll.endTime / 1000)}:R> • ${totalVotes} vote(s)` });

  poll.options.forEach((opt, i) => {
    const votes = poll.votes.get(i)?.length || 0;
    const percent = totalVotes > 0 ? (votes / totalVotes) * 100 : 0;
    const bar = renderBar(percent);
    embed.addFields({
      name: `${i + 1}. ${opt}`,
      value: `${bar} **${percent.toFixed(0)}%** (${votes})`,
      inline: false,
    });
  });

  return embed;
}
