/**
 * musicGroup.ts — Commandes musicales avec DisTube
 */
import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  Client,
  EmbedBuilder,
  GuildMember,
} from "discord.js";
import { getDisTube, formatQueue, formatSong } from "../services/musicService.js";
import { RepeatMode } from "distube";

export const commands = [
  new SlashCommandBuilder()
    .setName("music")
    .setDescription("Commandes musicales (lecture, queue, playlist, radio)")
    .addSubcommand((sc) =>
      sc
        .setName("play")
        .setDescription("Joue une musique (YouTube/Spotify/SoundCloud/700+ sites)")
        .addStringOption((o) => o.setName("requete").setDescription("Titre ou URL").setRequired(true)),
    )
    .addSubcommand((sc) => sc.setName("stop").setDescription("Arrête la musique et déconnecte le bot"))
    .addSubcommand((sc) => sc.setName("pause").setDescription("Met en pause"))
    .addSubcommand((sc) => sc.setName("resume").setDescription("Reprend la lecture"))
    .addSubcommand((sc) => sc.setName("skip").setDescription("Passe à la musique suivante"))
    .addSubcommand((sc) => sc.setName("previous").setDescription("Revient à la musique précédente"))
    .addSubcommand((sc) => sc.setName("shuffle").setDescription("Active le mode aléatoire"))
    .addSubcommand((sc) =>
      sc
        .setName("loop")
        .setDescription("Mode de boucle")
        .addStringOption((o) =>
          o
            .setName("mode")
            .setDescription("Mode de boucle")
            .setRequired(false)
            .addChoices(
              { name: "Désactivé", value: "off" },
              { name: "Musique actuelle", value: "track" },
              { name: "File d'attente", value: "queue" },
            ),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("volume")
        .setDescription("Régler le volume")
        .addIntegerOption((o) => o.setName("volume").setDescription("Volume 0-100").setRequired(true).setMinValue(0).setMaxValue(100)),
    )
    .addSubcommand((sc) => sc.setName("queue").setDescription("Voir la file d'attente"))
    .addSubcommand((sc) => sc.setName("nowplaying").setDescription("Musique en cours de lecture"))
    .addSubcommand((sc) =>
      sc
        .setName("filter")
        .setDescription("Active/désactive un filtre audio")
        .addStringOption((o) =>
          o
            .setName("filtre")
            .setDescription("Le filtre à appliquer")
            .setRequired(true)
            .addChoices(
              { name: "Bass Boost", value: "bassboost" },
              { name: "Nightcore", value: "nightcore" },
              { name: "Vaporwave", value: "vaporwave" },
              { name: "8D", value: "8d" },
              { name: "Tremolo", value: "tremolo" },
              { name: "Karaoke", value: "karaoke" },
              { name: "Désactiver tous les filtres", value: "off" },
            ),
        ),
    )
    .addSubcommand((sc) => sc.setName("autoplay").setDescription("Active/désactive la lecture automatique"))
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
  const dt = getDisTube();
  if (!dt) {
    await interaction.reply({ content: "❌ Le système de musique n'est pas initialisé.", ephemeral: true });
    return;
  }

  const action = interaction.options.getSubcommand();
  const member = interaction.member as GuildMember;
  const guildId = interaction.guildId!;

  const queue = dt.getQueue(guildId);
  const embed = new EmbedBuilder().setColor(0x1db954);

  switch (action) {
    case "play": {
      const query = interaction.options.getString("requete", true);
      const voiceChannel = member.voice?.channel;
      if (!voiceChannel) {
        await interaction.reply({ content: "❌ Tu dois être dans un salon vocal.", ephemeral: true });
        return;
      }
      await interaction.deferReply();
      try {
        await dt.play(voiceChannel, query, {
          member,
          textChannel: interaction.channel as import("discord.js").GuildTextBasedChannel | undefined,
        });
        const updatedQueue = dt.getQueue(guildId);
        const song = updatedQueue?.songs[updatedQueue.songs.length - 1];
        embed.setTitle("🎵 Ajouté à la file").setDescription(formatSong(song!));
        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        await interaction.editReply(`❌ Erreur: ${error instanceof Error ? error.message : "erreur inconnue"}`);
      }
      break;
    }

    case "stop": {
      if (!queue) {
        await interaction.reply({ content: "❌ Aucune musique en cours.", ephemeral: true });
        return;
      }
      await dt.stop(guildId);
      embed.setTitle("⏹️ Musique arrêtée").setDescription("File d'attente vidée et bot déconnecté.");
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "pause": {
      if (!queue) {
        await interaction.reply({ content: "❌ Aucune musique en cours.", ephemeral: true });
        return;
      }
      queue.pause();
      embed.setTitle("⏸️ Pause").setDescription("Musique mise en pause.");
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "resume": {
      if (!queue) {
        await interaction.reply({ content: "❌ Aucune musique en cours.", ephemeral: true });
        return;
      }
      queue.resume();
      embed.setTitle("▶️ Reprise").setDescription("Lecture reprise.");
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "skip": {
      if (!queue) {
        await interaction.reply({ content: "❌ Aucune musique en cours.", ephemeral: true });
        return;
      }
      try {
        const song = await dt.skip(guildId);
        embed.setTitle("⏭️ Skip").setDescription(`Maintenant: ${formatSong(song)}`);
        await interaction.reply({ embeds: [embed] });
      } catch {
        await interaction.reply({ content: "❌ Impossible de passer.", ephemeral: true });
      }
      break;
    }

    case "previous": {
      if (!queue) {
        await interaction.reply({ content: "❌ Aucune musique en cours.", ephemeral: true });
        return;
      }
      try {
        const song = await dt.previous(guildId);
        embed.setTitle("⏮️ Précédent").setDescription(`Maintenant: ${formatSong(song)}`);
        await interaction.reply({ embeds: [embed] });
      } catch {
        await interaction.reply({ content: "❌ Aucune musique précédente.", ephemeral: true });
      }
      break;
    }

    case "shuffle": {
      if (!queue) {
        await interaction.reply({ content: "❌ Aucune musique en cours.", ephemeral: true });
        return;
      }
      queue.shuffle();
      embed.setTitle("🔀 Shuffle").setDescription("File d'attente mélangée.");
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "loop": {
      if (!queue) {
        await interaction.reply({ content: "❌ Aucune musique en cours.", ephemeral: true });
        return;
      }
      const modeStr = interaction.options.getString("mode") ?? "off";
      const modeMap: Record<string, RepeatMode> = {
        off: RepeatMode.DISABLED,
        track: RepeatMode.SONG,
        queue: RepeatMode.QUEUE,
      };
      queue.setRepeatMode(modeMap[modeStr] ?? RepeatMode.DISABLED);
      embed.setTitle("🔁 Loop").setDescription(`Mode: **${modeStr}**`);
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "volume": {
      if (!queue) {
        await interaction.reply({ content: "❌ Aucune musique en cours.", ephemeral: true });
        return;
      }
      const vol = interaction.options.getInteger("volume", true);
      queue.setVolume(vol);
      embed.setTitle("🔊 Volume").setDescription(`Volume réglé à **${vol}%**`);
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "queue": {
      if (!queue || queue.songs.length === 0) {
        await interaction.reply({ content: "📭 File d'attente vide.", ephemeral: true });
        return;
      }
      embed
        .setTitle("📋 File d'attente")
        .setDescription(formatQueue(queue))
        .setFooter({ text: `${queue.songs.length} morceau(x) • Volume: ${queue.volume}%` });
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "nowplaying": {
      if (!queue || !queue.songs[0]) {
        await interaction.reply({ content: "❌ Aucune musique en cours.", ephemeral: true });
        return;
      }
      const song = queue.songs[0];
      embed
        .setTitle("🎵 En cours de lecture")
        .setDescription(formatSong(song))
        .addFields(
          { name: "Durée", value: `\`${song.formattedDuration}\``, inline: true },
          { name: "Volume", value: `\`${queue.volume}%\``, inline: true },
          { name: "Loop", value: `\`${queue.repeatMode === 0 ? "Off" : queue.repeatMode === 1 ? "Track" : "Queue"}\``, inline: true },
        );
      if (song.thumbnail) embed.setThumbnail(song.thumbnail);
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "filter": {
      if (!queue) {
        await interaction.reply({ content: "❌ Aucune musique en cours.", ephemeral: true });
        return;
      }
      const filter = interaction.options.getString("filtre", true);
      if (filter === "off") {
        queue.filters.clear();
        embed.setTitle("🎚️ Filtres").setDescription("Tous les filtres désactivés.");
      } else {
        const isActive = queue.filters.names.includes(filter);
        if (isActive) {
          queue.filters.remove(filter);
        } else {
          queue.filters.add(filter);
        }
        const nowActive = queue.filters.names.includes(filter);
        embed
          .setTitle("🎚️ Filtre audio")
          .setDescription(`Filtre **${filter}** ${nowActive ? "activé" : "désactivé"}.`);
      }
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "autoplay": {
      if (!queue) {
        await interaction.reply({ content: "❌ Aucune musique en cours.", ephemeral: true });
        return;
      }
      const newState = !queue.autoplay;
      queue.toggleAutoplay();
      embed
        .setTitle("🔄 Autoplay")
        .setDescription(`Lecture automatique **${newState ? "activée" : "désactivée"}**.`);
      await interaction.reply({ embeds: [embed] });
      break;
    }

    default:
      await interaction.reply({ content: "❌ Commande inconnue.", ephemeral: true });
  }
}
