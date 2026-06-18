import logger from "../utils/logger.js";
import {
  MessageFlags,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { requireAdmin } from "../services/permissions.js";
import { translateText, getSupportedLanguages, summarizeMessages } from "../services/ai-extra.js";

const FOOTER = { text: "Système de Surveillance • IA" };

const langChoices = Object.entries(getSupportedLanguages()).map(
  ([code, name]) => ({ name: `${name} (${code})`, value: code })
);

export const commands = [
  new SlashCommandBuilder()
    .setName("ai-translate")
    .setDescription("Traduit un texte dans une autre langue via IA")
    .addStringOption((o) =>
      o.setName("texte").setDescription("Le texte à traduire").setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName("langue")
        .setDescription("Langue cible (défaut: français)")
        .setRequired(false)
        .addChoices(...langChoices.slice(0, 25))
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("summarize")
    .setDescription("Résume les messages récents d'un salon via IA")
    .addIntegerOption((o) =>
      o
        .setName("nombre")
        .setDescription("Nombre de messages à analyser (10-100, défaut: 25)")
        .setMinValue(10)
        .setMaxValue(100)
        .setRequired(false)
    )
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  try {
    switch (interaction.commandName) {
      case "ai-translate":
        await handleTranslate(interaction);
        break;
      case "summarize":
        if (!(await requireAdmin(interaction))) return;
        await handleSummarize(interaction);
        break;
    }
  } catch (err) {
    logger.error("[AI-Extra] Erreur:", err);
    const errorEmbed = new EmbedBuilder()
      .setColor(0xff3344)
      .setDescription("Une erreur est survenue.");
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], flags: [MessageFlags.Ephemeral] });
      }
    } catch { /* ignore */ }
  }
}

async function handleTranslate(interaction: ChatInputCommandInteraction) {
  const text = interaction.options.getString("texte", true);
  const targetLang = interaction.options.getString("langue") || "fr";

  if (text.length > 2000) {
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xffaa00).setDescription("⚠️ Le texte est trop long (max 2000 caractères).")],
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.deferReply();
  const result = await translateText(text, targetLang);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🌐 Traduction")
    .addFields(
      { name: "📥 Source", value: `\`\`\`${text.slice(0, 1000)}\`\`\`` },
      { name: `📤 ${result.targetLanguage}`, value: `\`\`\`${result.translation.slice(0, 1000)}\`\`\`` }
    )
    .setFooter(FOOTER)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function handleSummarize(interaction: ChatInputCommandInteraction) {
  const count = interaction.options.getInteger("nombre") || 25;

  if (!interaction.channel) {
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xff3344).setDescription("❌ Salon introuvable.")],
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.deferReply();

  try {
    const fetched = await interaction.channel.messages.fetch({ limit: count });

    if (fetched.size < 5) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xffaa00)
            .setDescription("⚠️ Pas assez de messages dans ce salon pour faire un résumé (minimum 5)."),
        ],
      });
      return;
    }

    const messages = [...fetched.values()]
      .reverse()
      .map((msg) => ({
        author: msg.author.displayName,
        content: msg.content || "[contenu non textuel]",
      }));

    const summary = await summarizeMessages(messages);

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("📋 Résumé de la conversation")
      .setDescription(summary)
      .addFields({
        name: "📊 Stats",
        value: `${fetched.size} messages analysés`,
        inline: false,
      })
      .setFooter(FOOTER)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error("[Summarize] Erreur:", String(err));
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff3344)
          .setDescription("❌ Impossible de lire les messages. Vérifie les permissions du bot."),
      ],
    });
  }
}
