/**
 * translateAuto.ts — /translate-auto
 *
 * Auto-détection de langue + traduction vers le français (ou autre cible).
 * Utilise le service translator existant (MyMemory + failover OpenRouter).
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import logger from "../utils/logger.js";
import { translateText, SUPPORTED_LANGUAGES, type LanguageCode } from "../utils/translator.js";

const FOOTER = { text: "Translation Auto • Circuit Breaker + Failover" };

const TARGET_LANG_CHOICES = [
  { name: "🇫🇷 Français", value: "fr" },
  { name: "🇬🇧 English", value: "en" },
  { name: "🇪🇸 Español", value: "es" },
  { name: "🇩🇪 Deutsch", value: "de" },
  { name: "🇮🇹 Italiano", value: "it" },
  { name: "🇵🇹 Português", value: "pt" },
  { name: "🇷🇺 Русский", value: "ru" },
  { name: "🇯🇵 日本語", value: "ja" },
  { name: "🇰🇷 한국어", value: "ko" },
  { name: "🇨🇳 中文", value: "zh" },
  { name: "🇸🇦 العربية", value: "ar" },
  { name: "🇹🇷 Türkçe", value: "tr" },
  { name: "🇵🇱 Polski", value: "pl" },
  { name: "🇳🇱 Nederlands", value: "nl" },
  { name: "🇺🇦 Українська", value: "uk" },
  { name: "🇨🇿 Čeština", value: "cs" },
  { name: "🇷🇴 Română", value: "ro" },
  { name: "🇭🇺 Magyar", value: "hu" },
  { name: "🇬🇷 Ελληνικά", value: "el" },
  { name: "🇻🇳 Tiếng Việt", value: "vi" },
  { name: "🇹🇭 ไทย", value: "th" },
  { name: "🇮🇩 Bahasa Indonesia", value: "id" },
  { name: "🇮🇸 Íslenska", value: "is" },
  { name: "🇫🇮 Suomi", value: "fi" },
  { name: "🇸🇪 Svenska", value: "sv" },
];

export const commands = [
  new SlashCommandBuilder()
    .setName("translate-auto")
    .setDescription("Traduit un texte avec auto-détection de la langue source")
    .addStringOption((opt) =>
      opt.setName("texte").setDescription("Le texte à traduire").setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("cible")
        .setDescription("Langue cible (défaut: Français)")
        .setRequired(false)
        .addChoices(...TARGET_LANG_CHOICES),
    )
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const text = interaction.options.getString("texte", true);
  const targetLang = (interaction.options.getString("cible") || "fr") as LanguageCode;

  if (text.length > 2000) {
    await interaction.reply({
      content: "❌ Le texte est trop long (max 2000 caractères).",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    const result = await translateText(text, targetLang, "auto");

    if (!result || !result.translatedText) {
      await interaction.editReply({
        content: "❌ Impossible de traduire le texte. Le service est peut-être indisponible.",
      });
      return;
    }

    const targetLangName =
      SUPPORTED_LANGUAGES[targetLang as keyof typeof SUPPORTED_LANGUAGES] || targetLang;
    const detectedLangName =
      SUPPORTED_LANGUAGES[result.detectedLanguage as keyof typeof SUPPORTED_LANGUAGES] ||
      result.detectedLanguage ||
      "Inconnue";

    const embed = new EmbedBuilder()
      .setTitle("🌍 Traduction Auto")
      .setColor(0x5865f2)
      .addFields(
        {
          name: `📝 Original (${detectedLangName})`,
          value: text.slice(0, 1024),
          inline: false,
        },
        {
          name: `✅ Traduction (${targetLangName})`,
          value: result.translatedText.slice(0, 1024),
          inline: false,
        },
      )
      .setFooter(FOOTER)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    logger.info(
      `[TranslateAuto] ${interaction.user.tag}: ${result.detectedLanguage} → ${targetLang} (${text.length} chars)`,
    );
  } catch (error) {
    logger.error(
      `[TranslateAuto] Erreur: ${error instanceof Error ? error.message : String(error)}`,
    );
    await interaction.editReply({
      content:
        `❌ Erreur lors de la traduction : ${error instanceof Error ? error.message : String(error)}`.slice(
          0,
          200,
        ),
    });
  }
}
