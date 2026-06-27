/**
 * queueControls.ts — Contrôles de playlist avec panels interactifs
 *
 * /loop     — Active/désactive la boucle (off / track / queue) avec boutons
 * /shuffle  — Mélange la playlist avec boutons
 * /skip     — Passe au morceau suivant avec boutons
 * /previous — Revient au morceau précédent avec boutons
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
  ButtonInteraction,
} from "discord.js";
import logger from "../utils/logger.js";
import {
  getGuildAudioState,
  getQueue,
  setLoopMode,
  getLoopMode,
  shuffleQueue,
  skipTrack,
  previousTrack,
  stopPlayback,
  getQueuePosition,
  type LoopMode,
} from "../services/audioService.js";

const FOOTER = { text: "Queue Controls • Panel interactif" };
const PANEL_TIMEOUT_MS = 5 * 60 * 1000;

// ─── Définitions des commandes ───────────────────────────────────────────────

export const commands = [
  new SlashCommandBuilder()
    .setName("loop")
    .setDescription("Active/désactive la boucle de lecture (off / morceau / queue)")
    .addStringOption((opt) =>
      opt
        .setName("mode")
        .setDescription("Mode de boucle")
        .setRequired(false)
        .addChoices(
          { name: "🔴 Désactivé", value: "off" },
          { name: "🔂 Morceau (loop track)", value: "track" },
          { name: "🔁 Queue (loop all)", value: "queue" },
        ),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("shuffle")
    .setDescription("Mélange la playlist en cours")
    .toJSON(),

  new SlashCommandBuilder().setName("skip").setDescription("Passe au morceau suivant").toJSON(),

  new SlashCommandBuilder()
    .setName("previous")
    .setDescription("Revient au morceau précédent")
    .toJSON(),
];

// ─── Handler principal ───────────────────────────────────────────────────────

export async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    switch (interaction.commandName) {
      case "loop":
        await handleLoop(interaction);
        break;
      case "shuffle":
        await handleShuffle(interaction);
        break;
      case "skip":
        await handleSkip(interaction);
        break;
      case "previous":
        await handlePrevious(interaction);
        break;
    }
  } catch (error) {
    logger.error(
      `[QueueCtrl] Erreur ${interaction.commandName}: ${error instanceof Error ? error.message : String(error)}`,
    );
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: `❌ Erreur : ${String(error).slice(0, 150)}` });
      } else {
        await interaction.reply({
          content: `❌ Erreur : ${String(error).slice(0, 150)}`,
          flags: [MessageFlags.Ephemeral],
        });
      }
    } catch {}
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function requireGuildId(interaction: ChatInputCommandInteraction): string | null {
  if (!interaction.guildId) {
    void interaction.reply({ content: "❌ Serveur uniquement.", flags: [MessageFlags.Ephemeral] });
    return null;
  }
  return interaction.guildId;
}

function checkAudioActive(guildId: string): boolean {
  return getGuildAudioState(guildId) !== null;
}

function getLoopLabel(mode: LoopMode): string {
  switch (mode) {
    case "track":
      return "🔂 Boucle morceau";
    case "queue":
      return "🔁 Boucle queue";
    default:
      return "🔴 Désactivé";
  }
}

function getLoopEmoji(mode: LoopMode): string {
  switch (mode) {
    case "track":
      return "🔂";
    case "queue":
      return "🔁";
    default:
      return "🔴";
  }
}

// ─── /loop ───────────────────────────────────────────────────────────────────

async function handleLoop(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = requireGuildId(interaction);
  if (!guildId) return;

  if (!checkAudioActive(guildId)) {
    await interaction.reply({
      content: "⚠️ Aucune lecture en cours.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const directMode = interaction.options.getString("mode") as LoopMode | null;
  if (directMode) {
    setLoopMode(guildId, directMode);
    await interaction.reply({
      content: `${getLoopEmoji(directMode)} Mode boucle : **${getLoopLabel(directMode)}**`,
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const currentMode = getLoopMode(guildId) ?? "off";

  const embed = new EmbedBuilder()
    .setTitle(`${getLoopEmoji(currentMode)} Contrôle de Boucle`)
    .setColor(0x9b59b6)
    .setDescription("Sélectionne un mode de boucle avec les boutons ci-dessous.")
    .addFields({
      name: "Mode actuel",
      value: getLoopLabel(currentMode),
      inline: false,
    })
    .setFooter(FOOTER)
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("loop_off")
      .setLabel("🔴 Off")
      .setStyle(currentMode === "off" ? ButtonStyle.Danger : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("loop_track")
      .setLabel("🔂 Morceau")
      .setStyle(currentMode === "track" ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("loop_queue")
      .setLabel("🔁 Queue")
      .setStyle(currentMode === "queue" ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("loop_close")
      .setLabel("✅ Fermer")
      .setStyle(ButtonStyle.Primary),
  );

  const reply = await interaction.reply({
    embeds: [embed],
    components: [row],
    fetchReply: true,
  });

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: PANEL_TIMEOUT_MS,
  });

  collector.on("collect", async (btn: ButtonInteraction) => {
    if (btn.user.id !== interaction.user.id) {
      await btn.reply({
        content: "❌ Seul l'auteur peut changer le mode.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    if (btn.customId === "loop_close") {
      collector.stop("closed");
      await btn.update({
        embeds: [embed.setColor(0x95a5a6).setDescription("Panel de boucle fermé.")],
        components: [],
      });
      return;
    }

    const modeMap: Record<string, LoopMode> = {
      loop_off: "off",
      loop_track: "track",
      loop_queue: "queue",
    };

    const selectedMode = modeMap[btn.customId];
    if (!selectedMode) return;

    setLoopMode(guildId, selectedMode);

    const newRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("loop_off")
        .setLabel("🔴 Off")
        .setStyle(selectedMode === "off" ? ButtonStyle.Danger : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("loop_track")
        .setLabel("🔂 Morceau")
        .setStyle(selectedMode === "track" ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("loop_queue")
        .setLabel("🔁 Queue")
        .setStyle(selectedMode === "queue" ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("loop_close")
        .setLabel("✅ Fermer")
        .setStyle(ButtonStyle.Primary),
    );

    const updatedEmbed = new EmbedBuilder()
      .setTitle(`${getLoopEmoji(selectedMode)} Contrôle de Boucle`)
      .setColor(0x9b59b6)
      .setDescription("Sélectionne un mode de boucle avec les boutons ci-dessous.")
      .addFields({
        name: "Mode actuel",
        value: getLoopLabel(selectedMode),
        inline: false,
      })
      .setFooter(FOOTER)
      .setTimestamp();

    await btn.update({ embeds: [updatedEmbed], components: [newRow] });
  });

  collector.on("end", async (_collected, reason) => {
    if (reason === "time") {
      try {
        await interaction.editReply({ components: [] });
      } catch {}
    }
  });
}

// ─── /shuffle ────────────────────────────────────────────────────────────────

async function handleShuffle(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = requireGuildId(interaction);
  if (!guildId) return;

  if (!checkAudioActive(guildId)) {
    await interaction.reply({
      content: "⚠️ Aucune lecture en cours.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const queue = getQueue(guildId);
  if (queue.length === 0) {
    await interaction.reply({
      content: "⚠️ La playlist est vide.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("🔀 Shuffle")
    .setColor(0xe67e22)
    .setDescription(`Mélanger la playlist de **${queue.length} morceau(s)** ?`)
    .addFields({
      name: "Queue actuelle",
      value: queue
        .slice(0, 10)
        .map((s, i) => `${i + 1}. ${s.displayName}`)
        .join("\n")
        .slice(0, 1024),
      inline: false,
    })
    .setFooter(FOOTER)
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("shuffle_confirm")
      .setLabel("🔀 Confirmer")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("shuffle_cancel")
      .setLabel("❌ Annuler")
      .setStyle(ButtonStyle.Secondary),
  );

  const reply = await interaction.reply({
    embeds: [embed],
    components: [row],
    fetchReply: true,
  });

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 30_000,
  });

  collector.on("collect", async (btn: ButtonInteraction) => {
    if (btn.user.id !== interaction.user.id) {
      await btn.reply({
        content: "❌ Seul l'auteur peut confirmer.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    if (btn.customId === "shuffle_confirm") {
      shuffleQueue(guildId);
      const shuffledQueue = getQueue(guildId);

      const resultEmbed = new EmbedBuilder()
        .setTitle("🔀 Playlist Mélangée")
        .setColor(0x57f287)
        .setDescription(`✅ **${shuffledQueue.length}** morceau(s) mélangé(s) !`)
        .addFields({
          name: "Nouvel ordre",
          value: shuffledQueue
            .slice(0, 10)
            .map((s, i) => `${i + 1}. ${s.displayName}`)
            .join("\n")
            .slice(0, 1024),
          inline: false,
        })
        .setFooter(FOOTER)
        .setTimestamp();

      collector.stop("shuffled");
      await btn.update({ embeds: [resultEmbed], components: [] });
    } else {
      collector.stop("cancelled");
      await btn.update({
        embeds: [embed.setColor(0x95a5a6).setDescription("Shuffle annulé.")],
        components: [],
      });
    }
  });

  collector.on("end", async (_collected, reason) => {
    if (reason === "time") {
      try {
        await interaction.editReply({ components: [] });
      } catch {}
    }
  });
}

// ─── /skip ───────────────────────────────────────────────────────────────────

async function handleSkip(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = requireGuildId(interaction);
  if (!guildId) return;

  if (!checkAudioActive(guildId)) {
    await interaction.reply({
      content: "⚠️ Aucune lecture en cours.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const queue = getQueue(guildId);
  const pos = getQueuePosition(guildId);
  const nextIndex = pos ? pos.index + 1 : 0;
  const nextTrack = queue[nextIndex];

  const embed = new EmbedBuilder()
    .setTitle("⏭️ Skip")
    .setColor(0x5865f2)
    .setDescription("Passer au morceau suivant ?")
    .setFooter(FOOTER)
    .setTimestamp();

  if (nextTrack) {
    embed.addFields({
      name: "Prochain morceau",
      value: `▶️ **${nextTrack.displayName}**`,
      inline: false,
    });
  } else {
    embed.addFields({
      name: "Prochain morceau",
      value: "⚠️ Fin de la playlist — la lecture s'arrêtera",
      inline: false,
    });
  }

  if (pos) {
    embed.addFields({
      name: "Position",
      value: `${pos.index + 1} / ${pos.total}`,
      inline: true,
    });
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("skip_confirm")
      .setLabel("⏭️ Confirmer")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("skip_cancel")
      .setLabel("❌ Annuler")
      .setStyle(ButtonStyle.Secondary),
  );

  const reply = await interaction.reply({
    embeds: [embed],
    components: [row],
    fetchReply: true,
  });

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 30_000,
  });

  collector.on("collect", async (btn: ButtonInteraction) => {
    if (btn.user.id !== interaction.user.id) {
      await btn.reply({ content: "❌ Seul l'auteur peut skip.", flags: [MessageFlags.Ephemeral] });
      return;
    }

    if (btn.customId === "skip_confirm") {
      const next = skipTrack(guildId);

      if (next) {
        // Arrêter le morceau courant — le player émettra Idle et on rejouera
        stopPlayback(guildId);

        const resultEmbed = new EmbedBuilder()
          .setTitle("⏭️ Skipé")
          .setColor(0x57f287)
          .setDescription(`▶️ Morceau suivant : **${next.displayName}**`)
          .setFooter(FOOTER)
          .setTimestamp();

        collector.stop("skipped");
        await btn.update({ embeds: [resultEmbed], components: [] });
      } else {
        stopPlayback(guildId);

        const resultEmbed = new EmbedBuilder()
          .setTitle("⏹️ Fin de playlist")
          .setColor(0xed4245)
          .setDescription("Playlist terminée — aucune autre piste à jouer.")
          .setFooter(FOOTER)
          .setTimestamp();

        collector.stop("ended");
        await btn.update({ embeds: [resultEmbed], components: [] });
      }
    } else {
      collector.stop("cancelled");
      await btn.update({
        embeds: [embed.setColor(0x95a5a6).setDescription("Skip annulé.")],
        components: [],
      });
    }
  });

  collector.on("end", async (_collected, reason) => {
    if (reason === "time") {
      try {
        await interaction.editReply({ components: [] });
      } catch {}
    }
  });
}

// ─── /previous ───────────────────────────────────────────────────────────────

async function handlePrevious(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = requireGuildId(interaction);
  if (!guildId) return;

  if (!checkAudioActive(guildId)) {
    await interaction.reply({
      content: "⚠️ Aucune lecture en cours.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const pos = getQueuePosition(guildId);

  const embed = new EmbedBuilder()
    .setTitle("⏮️ Previous")
    .setColor(0x5865f2)
    .setDescription("Revenir au morceau précédent ?")
    .setFooter(FOOTER)
    .setTimestamp();

  if (pos && pos.index > 0) {
    const prevQueue = getQueue(guildId);
    embed.addFields({
      name: "Morceau précédent",
      value: `◀️ **${prevQueue[pos.index - 1]?.displayName ?? "Historique"}**`,
      inline: false,
    });
  } else {
    embed.addFields({
      name: "Morceau précédent",
      value: "ℹ️ Utilisera l'historique de lecture si disponible",
      inline: false,
    });
  }

  if (pos) {
    embed.addFields({
      name: "Position",
      value: `${pos.index + 1} / ${pos.total}`,
      inline: true,
    });
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("prev_confirm")
      .setLabel("⏮️ Confirmer")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("prev_cancel")
      .setLabel("❌ Annuler")
      .setStyle(ButtonStyle.Secondary),
  );

  const reply = await interaction.reply({
    embeds: [embed],
    components: [row],
    fetchReply: true,
  });

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 30_000,
  });

  collector.on("collect", async (btn: ButtonInteraction) => {
    if (btn.user.id !== interaction.user.id) {
      await btn.reply({
        content: "❌ Seul l'auteur peut revenir en arrière.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    if (btn.customId === "prev_confirm") {
      const prev = previousTrack(guildId);

      if (prev) {
        stopPlayback(guildId);

        const resultEmbed = new EmbedBuilder()
          .setTitle("⏮️ Retour")
          .setColor(0x57f287)
          .setDescription(`◀️ Morceau précédent : **${prev.displayName}**`)
          .setFooter(FOOTER)
          .setTimestamp();

        collector.stop("prev");
        await btn.update({ embeds: [resultEmbed], components: [] });
      } else {
        const resultEmbed = new EmbedBuilder()
          .setTitle("⚠️ Aucun précédent")
          .setColor(0xed4245)
          .setDescription("Aucun morceau précédent dans l'historique ou la queue.")
          .setFooter(FOOTER)
          .setTimestamp();

        collector.stop("none");
        await btn.update({ embeds: [resultEmbed], components: [] });
      }
    } else {
      collector.stop("cancelled");
      await btn.update({
        embeds: [embed.setColor(0x95a5a6).setDescription("Previous annulé.")],
        components: [],
      });
    }
  });

  collector.on("end", async (_collected, reason) => {
    if (reason === "time") {
      try {
        await interaction.editReply({ components: [] });
      } catch {}
    }
  });
}
