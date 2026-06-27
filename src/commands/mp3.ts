import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  AutocompleteInteraction,
  GuildMember,
} from "discord.js";
import { join } from "path";
import { config } from "../config.js";
import {
  SOUNDS_DIR,
  AUTOCOMPLETE_LIMIT,
  listSoundFiles,
  findSoundFile,
  joinAndPlay,
  cleanupGuild,
} from "../services/audioService.js";
import logger from "../utils/logger.js";
import { existsSync } from "fs";

const FOOTER = { text: "Système Audio • Owner Only" };

// Slash Command

export const commands = [
  new SlashCommandBuilder()
    .setName("mp3")
    .setDescription("Joue un fichier MP3 local (Owner Only)")
    .addStringOption((option) =>
      option
        .setName("nom_du_son")
        .setDescription("Nom du fichier MP3 à jouer")
        .setRequired(true)
        .setAutocomplete(true),
    )
    .toJSON(),
];

// Autocomplete

export async function handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  if (interaction.commandName !== "mp3") return;

  const focused = interaction.options.getFocused(true);
  if (focused.name !== "nom_du_son") return;

  const focusedValue = focused.value.toLowerCase();
  const files = listSoundFiles();

  const filtered = focusedValue
    ? files
        .filter((f) => f.displayName.toLowerCase().includes(focusedValue))
        .slice(0, AUTOCOMPLETE_LIMIT)
    : files.slice(0, AUTOCOMPLETE_LIMIT);

  await interaction.respond(
    filtered.map((f) => ({ name: f.displayName.slice(0, 100), value: f.name })),
  );
}

// Command Handler

export async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  // Sécurité : Owner Only
  if (!config.ownerId || interaction.user.id !== config.ownerId) {
    if (!config.ownerId) {
      logger.warn("[MP3] OWNER_ID non configuré dans .env");
    }
    await interaction.reply({
      content: "🔒 Cette commande est réservée au propriétaire du bot.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const soundName = interaction.options.getString("nom_du_son", true).trim();

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    const sound = findSoundFile(soundName);

    if (!sound) {
      await interaction.editReply({
        content: `❌ Fichier **${soundName}** introuvable dans \`assets/sounds/\`.`,
      });
      return;
    }

    const member = interaction.member as GuildMember;
    const voiceChannel = member.voice.channel;

    if (!voiceChannel || !voiceChannel.joinable) {
      await interaction.editReply({
        content: "❌ Vous devez être dans un salon vocal accessible pour utiliser cette commande.",
      });
      return;
    }

    const filePath = join(SOUNDS_DIR, sound.name);

    if (!existsSync(filePath)) {
      logger.error(`[MP3] Fichier introuvable après vérification : ${filePath}`);
      await interaction.editReply({
        content: `❌ Le fichier \`${sound.name}\` est introuvable ou corrompu.`,
      });
      return;
    }

    // Nettoyer toute connexion existante
    const guildId = interaction.guildId!;
    cleanupGuild(guildId);

    // Utiliser le service audio robuste
    await joinAndPlay(interaction.guild!, voiceChannel.id, {
      type: "file",
      path: filePath,
      displayName: sound.displayName,
    });

    logger.info(`[MP3] ▶ ${interaction.user.tag} joue "${sound.displayName}" (${sound.name})`);

    // Embed de confirmation
    const embed = new EmbedBuilder()
      .setTitle("🔊 MP3")
      .setColor(0x9146ff)
      .setDescription(`▶ Lecture de **${sound.displayName}** en cours...`)
      .addFields(
        { name: "Fichier", value: `\`${sound.name}\``, inline: true },
        { name: "Salon", value: `${voiceChannel.name}`, inline: true },
      )
      .setFooter(FOOTER)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[MP3] Erreur:", String(error));
    try {
      await interaction.editReply({
        content: `❌ Erreur lors de la lecture : ${String(error).slice(0, 150)}`,
      });
    } catch {}
  }
}
