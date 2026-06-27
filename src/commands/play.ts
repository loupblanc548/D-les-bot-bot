/**
 * play.ts — Commande /play (streaming URL YouTube/SoundCloud/flux brut)
 *
 * Utilise play-dl pour extraire et streamer le flux audio en arrière-plan.
 * Contourne les blocages 403 de YouTube via play-dl.
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  GuildMember,
} from "discord.js";
import { config } from "../config.js";
import logger from "../utils/logger.js";
import {
  joinAndPlay,
  getGuildAudioState,
  stopPlayback,
  pausePlayback,
  resumePlayback,
  cleanupGuild,
} from "../services/audioService.js";

const FOOTER = { text: "Système Audio • Streaming URL" };

export const commands = [
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("Joue une URL audio (YouTube, SoundCloud, flux brut) en vocal")
    .addStringOption((option) =>
      option
        .setName("url")
        .setDescription("URL à streamer (YouTube, SoundCloud, etc.)")
        .setRequired(true),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Arrête la lecture audio en cours")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("pause")
    .setDescription("Met en pause la lecture audio")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("resume")
    .setDescription("Reprend la lecture audio en pause")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("queue-status")
    .setDescription("Affiche le statut de lecture audio actuel")
    .toJSON(),
];

// ─── Handlers ────────────────────────────────────────────────────────────────

export async function handlePlayCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!config.ownerId || interaction.user.id !== config.ownerId) {
    await interaction.reply({
      content: "🔒 Cette commande est réservée au propriétaire du bot.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const url = interaction.options.getString("url", true).trim();

  // Validation URL basique
  try {
    new URL(url);
  } catch {
    await interaction.reply({
      content: "❌ URL invalide.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const member = interaction.member as GuildMember;
  const voiceChannel = member.voice?.channel;

  if (!voiceChannel || !voiceChannel.joinable) {
    await interaction.editReply({
      content: "❌ Tu dois être dans un salon vocal accessible.",
    });
    return;
  }

  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply({ content: "❌ Serveur introuvable." });
    return;
  }

  try {
    // Extraire un nom lisible depuis l'URL
    const displayName = extractDisplayName(url);

    await joinAndPlay(guild, voiceChannel.id, {
      type: "url",
      url,
      displayName,
    });

    const embed = new EmbedBuilder()
      .setTitle("🎵 Streaming audio")
      .setColor(0x9146ff)
      .setDescription(`▶ Lecture de **${displayName}** en cours...`)
      .addFields(
        { name: "URL", value: url.slice(0, 200), inline: false },
        { name: "Salon", value: voiceChannel.name, inline: true },
      )
      .setFooter(FOOTER)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    logger.info(`[Play] ▶ ${interaction.user.tag} stream: ${url}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[Play] Erreur: ${msg}`);
    cleanupGuild(guild.id);

    await interaction.editReply({
      content: `❌ Erreur de streaming: ${msg.slice(0, 200)}`,
    });
  }
}

export async function handleStopCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) return;

  const stopped = stopPlayback(interaction.guildId);
  if (stopped) {
    await interaction.reply({
      content: "⏹️ Lecture arrêtée.",
      flags: [MessageFlags.Ephemeral],
    });
  } else {
    await interaction.reply({
      content: "⚠️ Aucune lecture en cours.",
      flags: [MessageFlags.Ephemeral],
    });
  }
}

export async function handlePauseCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) return;

  const paused = pausePlayback(interaction.guildId);
  if (paused) {
    await interaction.reply({
      content: "⏸️ Lecture en pause.",
      flags: [MessageFlags.Ephemeral],
    });
  } else {
    await interaction.reply({
      content: "⚠️ Aucune lecture en cours.",
      flags: [MessageFlags.Ephemeral],
    });
  }
}

export async function handleResumeCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) return;

  const resumed = resumePlayback(interaction.guildId);
  if (resumed) {
    await interaction.reply({
      content: "▶️ Lecture reprise.",
      flags: [MessageFlags.Ephemeral],
    });
  } else {
    await interaction.reply({
      content: "⚠️ Aucune lecture en pause.",
      flags: [MessageFlags.Ephemeral],
    });
  }
}

export async function handleQueueStatusCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId) return;

  const state = getGuildAudioState(interaction.guildId);
  if (!state) {
    await interaction.reply({
      content: "⚠️ Aucune activité audio.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const status = state.isPlaying ? "▶️ En lecture" : state.isPaused ? "⏸️ En pause" : "⏹️ Idle";

  const embed = new EmbedBuilder()
    .setTitle("📊 Statut audio")
    .setColor(0x5865f2)
    .addFields(
      { name: "Statut", value: status, inline: true },
      { name: "Source", value: state.currentSource || "N/A", inline: false },
    )
    .setFooter(FOOTER)
    .setTimestamp();

  await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractDisplayName(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace("www.", "");

    if (host.includes("youtube") || host.includes("youtu.be")) {
      const videoId = parsed.searchParams.get("v") || parsed.pathname.slice(1);
      return `YouTube (${videoId.slice(0, 11)})`;
    }
    if (host.includes("soundcloud")) {
      return `SoundCloud (${parsed.pathname.slice(1, 30)})`;
    }
    return `${host} (${parsed.pathname.slice(1, 20) || "stream"})`;
  } catch {
    return url.slice(0, 50);
  }
}
