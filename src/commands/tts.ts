/**
 * tts.ts — Commande /tts (Text-to-Speech en vocal)
 *
 * Utilise l'API Google Translate TTS (gratuite, pas de clé requise)
 * pour générer un audio MP3 depuis du texte, puis le joue en vocal.
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  GuildMember,
} from "discord.js";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
} from "@discordjs/voice";
import { activePlayers, cleanupConnection, DISCONNECT_DELAY_MS } from "../services/audioPlayer.js";
import { writeFile, unlink, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import logger from "../utils/logger.js";

const TTS_DIR = join(tmpdir(), "bot-tts");
const TTS_MAX_LENGTH = 500;

const LANGUAGES = [
  { name: "Français", value: "fr" },
  { name: "English", value: "en" },
  { name: "Español", value: "es" },
  { name: "Deutsch", value: "de" },
  { name: "Italiano", value: "it" },
  { name: "Português", value: "pt" },
  { name: "日本語", value: "ja" },
  { name: "한국어", value: "ko" },
  { name: "中文", value: "zh" },
  { name: "Русский", value: "ru" },
  { name: "العربية", value: "ar" },
  { name: "Nederlands", value: "nl" },
];

export const commands = [
  new SlashCommandBuilder()
    .setName("tts")
    .setDescription("Lit du texte à voix haute dans ton salon vocal")
    .addStringOption((o) =>
      o
        .setName("texte")
        .setDescription("Texte à lire à voix haute (max 500 caractères)")
        .setRequired(true)
        .setMaxLength(TTS_MAX_LENGTH),
    )
    .addStringOption((o) =>
      o
        .setName("langue")
        .setDescription("Langue du texte")
        .setRequired(false)
        .addChoices(...LANGUAGES.map((l) => ({ name: l.name, value: l.value }))),
    )
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  const text = interaction.options.getString("texte", true);
  const lang = interaction.options.getString("langue") || "fr";

  const member = interaction.member as GuildMember;
  const voiceChannel = member?.voice?.channel;

  if (!voiceChannel) {
    await interaction.reply({
      content: "❌ Tu dois être dans un salon vocal pour utiliser cette commande.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    // Générer l'audio TTS via Google Translate
    const audioBuffer = await fetchTTS(text, lang);
    if (!audioBuffer) {
      await interaction.editReply({
        content: "❌ Impossible de générer l'audio. Réessaie plus tard.",
      });
      return;
    }

    // Sauvegarder temporairement
    await mkdir(TTS_DIR, { recursive: true });
    const filename = `tts-${randomUUID()}.mp3`;
    const filepath = join(TTS_DIR, filename);
    await writeFile(filepath, audioBuffer, { mode: 0o600 });

    // Rejoindre le vocal
    const guildId = interaction.guildId!;
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId,
      adapterCreator: interaction.guild!.voiceAdapterCreator,
    });

    // Créer le player et jouer
    const player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });

    const resource = createAudioResource(filepath);
    activePlayers.set(guildId, player);
    connection.subscribe(player);
    player.play(resource);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🗣️ Text-to-Speech")
      .setDescription(`Lecture en cours dans **${voiceChannel.name}**`)
      .addFields(
        { name: "Langue", value: lang, inline: true },
        { name: "Longueur", value: `${text.length} caractères`, inline: true },
      )
      .setFooter({ text: "TTS • Google Translate" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    logger.info(`[TTS] ${interaction.user.tag} lit "${text.slice(0, 50)}..." en ${lang}`);

    // Nettoyer à la fin
    player.once(AudioPlayerStatus.Idle, () => {
      logger.info("[TTS] Lecture terminée");
      setTimeout(() => {
        if (
          activePlayers.get(guildId) === player &&
          player.state.status === AudioPlayerStatus.Idle
        ) {
          cleanupConnection(guildId);
          logger.info(`[TTS] Déconnexion après ${DISCONNECT_DELAY_MS / 1000}s d'inactivité`);
        }
      }, DISCONNECT_DELAY_MS);

      // Supprimer le fichier temporaire
      unlink(filepath).catch(() => {});
    });
  } catch (error) {
    logger.error("[TTS] Erreur:", error);
    try {
      await interaction.editReply({ content: "❌ Une erreur est survenue." });
    } catch {}
  }
}

/**
 * Récupère l'audio TTS depuis l'API Google Translate.
 */
async function fetchTTS(text: string, lang: string): Promise<Buffer | null> {
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://translate.google.com/",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      logger.warn(`[TTS] HTTP ${res.status} depuis Google Translate`);
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    logger.error("[TTS] Erreur fetch:", error);
    return null;
  }
}
