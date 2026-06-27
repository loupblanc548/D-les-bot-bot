/**
 * audioPanel.ts — Panel audio interactif avec boutons persistants
 *
 * /volume        — Ajuste le volume avec boutons +/-
 * /seek          — Avance/recule avec boutons
 * /audio-effects — Applique un effet (bassboost, nightcore, vaporwave, 8d)
 * /radio-stop    — Arrête le flash info radio
 *
 * Chaque commande déploie un panel interactif avec boutons dans le salon
 * où la commande est utilisée, permettant un contrôle en temps réel.
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
  setVolume,
  getVolume,
  setEffect,
  getEffect,
  getPlaybackPosition,
  seekPlayback,
  stopRadio,
  isRadioPlaying,
  type AudioEffect,
} from "../services/audioService.js";

const FOOTER = { text: "Panel Audio • Contrôle interactif" };
const PANEL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ─── Définitions des commandes ───────────────────────────────────────────────

export const commands = [
  new SlashCommandBuilder()
    .setName("volume")
    .setDescription("Ajuste le volume de lecture audio avec un panel interactif")
    .addIntegerOption((opt) =>
      opt
        .setName("niveau")
        .setDescription("Volume 0-100 (optionnel, sinon utilise les boutons)")
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(100),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("seek")
    .setDescription("Avance ou recule dans la lecture avec un panel interactif")
    .addIntegerOption((opt) =>
      opt
        .setName("secondes")
        .setDescription("Position en secondes (optionnel, sinon utilise les boutons)")
        .setRequired(false)
        .setMinValue(0),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("audio-effects")
    .setDescription("Applique un effet audio (bassboost, nightcore, vaporwave, 8d)")
    .addStringOption((opt) =>
      opt
        .setName("effet")
        .setDescription("Effet à appliquer")
        .setRequired(false)
        .addChoices(
          { name: "🔊 Aucun (désactivé)", value: "none" },
          { name: "🎵 Bass Boost", value: "bassboost" },
          { name: "⚡ Nightcore", value: "nightcore" },
          { name: "🌴 Vaporwave", value: "vaporwave" },
          { name: "🎧 8D Audio", value: "8d" },
        ),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("radio-stop")
    .setDescription("Arrête le flash info radio-gaming en cours")
    .toJSON(),
];

// ─── Handler principal ───────────────────────────────────────────────────────

export async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    switch (interaction.commandName) {
      case "volume":
        await handleVolume(interaction);
        break;
      case "seek":
        await handleSeek(interaction);
        break;
      case "audio-effects":
        await handleAudioEffects(interaction);
        break;
      case "radio-stop":
        await handleRadioStop(interaction);
        break;
    }
  } catch (error) {
    logger.error(
      `[AudioPanel] Erreur ${interaction.commandName}: ${error instanceof Error ? error.message : String(error)}`,
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
    void interaction.reply({
      content: "❌ Cette commande ne fonctionne qu'en serveur.",
      flags: [MessageFlags.Ephemeral],
    });
    return null;
  }
  return interaction.guildId;
}

function checkAudioActive(guildId: string): boolean {
  return getGuildAudioState(guildId) !== null;
}

function createVolumeBar(volume: number): string {
  const filled = Math.round((volume / 100) * 10);
  return "█".repeat(filled) + "░".repeat(10 - filled);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── /volume ─────────────────────────────────────────────────────────────────

async function handleVolume(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = requireGuildId(interaction);
  if (!guildId) return;

  if (!checkAudioActive(guildId)) {
    await interaction.reply({
      content: "⚠️ Aucune lecture audio en cours. Utilise `/play` ou `/mp3` d'abord.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const directVolume = interaction.options.getInteger("niveau");
  if (directVolume !== null) {
    setVolume(guildId, directVolume);
    await interaction.reply({
      content: `🔊 Volume réglé sur **${directVolume}%**`,
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const currentVol = getVolume(guildId) ?? 100;

  const embed = new EmbedBuilder()
    .setTitle("🔊 Contrôle du Volume")
    .setColor(0x57f287)
    .setDescription("Utilise les boutons ci-dessous pour ajuster le volume en temps réel.")
    .addFields({
      name: "Volume actuel",
      value: `${createVolumeBar(currentVol)} **${currentVol}%**`,
      inline: false,
    })
    .setFooter(FOOTER)
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("vol_mute").setLabel("🔇 Muet").setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("vol_minus20")
      .setLabel("🔉 -20")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("vol_minus10")
      .setLabel("🔉 -10")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("vol_plus10").setLabel("🔊 +10").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("vol_plus20").setLabel("🔊 +20").setStyle(ButtonStyle.Primary),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("vol_25").setLabel("25%").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("vol_50").setLabel("50%").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("vol_75").setLabel("75%").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("vol_100").setLabel("100%").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("vol_close")
      .setLabel("✅ Fermer")
      .setStyle(ButtonStyle.Success),
  );

  const reply = await interaction.reply({
    embeds: [embed],
    components: [row, row2],
    fetchReply: true,
  });

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: PANEL_TIMEOUT_MS,
  });

  collector.on("collect", async (btn: ButtonInteraction) => {
    if (btn.user.id !== interaction.user.id) {
      await btn.reply({
        content: "❌ Seul l'auteur de la commande peut contrôler le volume.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    let newVol = getVolume(guildId) ?? 100;

    switch (btn.customId) {
      case "vol_mute":
        newVol = 0;
        break;
      case "vol_minus20":
        newVol -= 20;
        break;
      case "vol_minus10":
        newVol -= 10;
        break;
      case "vol_plus10":
        newVol += 10;
        break;
      case "vol_plus20":
        newVol += 20;
        break;
      case "vol_25":
        newVol = 25;
        break;
      case "vol_50":
        newVol = 50;
        break;
      case "vol_75":
        newVol = 75;
        break;
      case "vol_100":
        newVol = 100;
        break;
      case "vol_close":
        collector.stop("closed");
        await btn.update({
          embeds: [embed.setColor(0x95a5a6).setDescription("Panel de volume fermé.")],
          components: [],
        });
        return;
    }

    setVolume(guildId, newVol);
    const actualVol = getVolume(guildId) ?? 0;

    const updatedEmbed = new EmbedBuilder()
      .setTitle("🔊 Contrôle du Volume")
      .setColor(0x57f287)
      .setDescription("Utilise les boutons ci-dessous pour ajuster le volume en temps réel.")
      .addFields({
        name: "Volume actuel",
        value: `${createVolumeBar(actualVol)} **${actualVol}%**`,
        inline: false,
      })
      .setFooter(FOOTER)
      .setTimestamp();

    await btn.update({ embeds: [updatedEmbed], components: [row, row2] });
  });

  collector.on("end", async (_collected, reason) => {
    if (reason === "time") {
      try {
        await interaction.editReply({ components: [] });
      } catch {}
    }
  });
}

// ─── /seek ───────────────────────────────────────────────────────────────────

async function handleSeek(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = requireGuildId(interaction);
  if (!guildId) return;

  if (!checkAudioActive(guildId)) {
    await interaction.reply({
      content: "⚠️ Aucune lecture audio en cours.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const directSeek = interaction.options.getInteger("secondes");
  if (directSeek !== null) {
    await seekPlayback(guildId, directSeek);
    await interaction.reply({
      content: `⏩ Position réglée sur **${formatTime(directSeek)}**`,
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const pos = getPlaybackPosition(guildId) ?? 0;

  const embed = new EmbedBuilder()
    .setTitle("⏩ Contrôle de Position")
    .setColor(0x5865f2)
    .setDescription("Utilise les boutons pour avancer ou reculer dans la lecture.")
    .addFields({
      name: "Position actuelle",
      value: `⏱️ **${formatTime(pos)}**`,
      inline: false,
    })
    .setFooter(FOOTER)
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("seek_back30")
      .setLabel("⏪ -30s")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("seek_back10")
      .setLabel("◀ -10s")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("seek_fwd10").setLabel("▶ +10s").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("seek_fwd30").setLabel("⏩ +30s").setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("seek_close")
      .setLabel("✅ Fermer")
      .setStyle(ButtonStyle.Success),
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
        content: "❌ Seul l'auteur peut contrôler la position.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    if (btn.customId === "seek_close") {
      collector.stop("closed");
      await btn.update({
        embeds: [embed.setColor(0x95a5a6).setDescription("Panel de position fermé.")],
        components: [],
      });
      return;
    }

    const currentPos = getPlaybackPosition(guildId) ?? 0;
    let newPos = currentPos;

    switch (btn.customId) {
      case "seek_back30":
        newPos = Math.max(0, currentPos - 30);
        break;
      case "seek_back10":
        newPos = Math.max(0, currentPos - 10);
        break;
      case "seek_fwd10":
        newPos = currentPos + 10;
        break;
      case "seek_fwd30":
        newPos = currentPos + 30;
        break;
    }

    await seekPlayback(guildId, newPos);

    const updatedEmbed = new EmbedBuilder()
      .setTitle("⏩ Contrôle de Position")
      .setColor(0x5865f2)
      .setDescription("Utilise les boutons pour avancer ou reculer dans la lecture.")
      .addFields({
        name: "Position actuelle",
        value: `⏱️ **${formatTime(newPos)}**`,
        inline: false,
      })
      .setFooter(FOOTER)
      .setTimestamp();

    await btn.update({ embeds: [updatedEmbed], components: [row] });
  });

  collector.on("end", async (_collected, reason) => {
    if (reason === "time") {
      try {
        await interaction.editReply({ components: [] });
      } catch {}
    }
  });
}

// ─── /audio-effects ──────────────────────────────────────────────────────────

async function handleAudioEffects(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = requireGuildId(interaction);
  if (!guildId) return;

  if (!checkAudioActive(guildId)) {
    await interaction.reply({
      content: "⚠️ Aucune lecture audio en cours.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const directEffect = interaction.options.getString("effet") as AudioEffect | null;
  if (directEffect) {
    setEffect(guildId, directEffect);
    const effectName = getEffectLabel(directEffect);
    await interaction.reply({
      content: `🎵 Effet audio appliqué : **${effectName}**`,
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const currentEffect = getEffect(guildId) ?? "none";

  const embed = new EmbedBuilder()
    .setTitle("🎵 Effets Audio")
    .setColor(0x9b59b6)
    .setDescription("Sélectionne un effet audio à appliquer en temps réel.")
    .addFields({
      name: "Effet actuel",
      value: getEffectLabel(currentEffect),
      inline: false,
    })
    .setFooter(FOOTER)
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("fx_none")
      .setLabel("🔊 Aucun")
      .setStyle(currentEffect === "none" ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("fx_bassboost")
      .setLabel("🎵 Bass Boost")
      .setStyle(currentEffect === "bassboost" ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("fx_nightcore")
      .setLabel("⚡ Nightcore")
      .setStyle(currentEffect === "nightcore" ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("fx_vaporwave")
      .setLabel("🌴 Vaporwave")
      .setStyle(currentEffect === "vaporwave" ? ButtonStyle.Success : ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("fx_8d")
      .setLabel("🎧 8D Audio")
      .setStyle(currentEffect === "8d" ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("fx_close").setLabel("✅ Fermer").setStyle(ButtonStyle.Danger),
  );

  const reply = await interaction.reply({
    embeds: [embed],
    components: [row, row2],
    fetchReply: true,
  });

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: PANEL_TIMEOUT_MS,
  });

  collector.on("collect", async (btn: ButtonInteraction) => {
    if (btn.user.id !== interaction.user.id) {
      await btn.reply({
        content: "❌ Seul l'auteur peut changer les effets.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    if (btn.customId === "fx_close") {
      collector.stop("closed");
      await btn.update({
        embeds: [embed.setColor(0x95a5a6).setDescription("Panel d'effets fermé.")],
        components: [],
      });
      return;
    }

    const effectMap: Record<string, AudioEffect> = {
      fx_none: "none",
      fx_bassboost: "bassboost",
      fx_nightcore: "nightcore",
      fx_vaporwave: "vaporwave",
      fx_8d: "8d",
    };

    const selectedEffect = effectMap[btn.customId];
    if (!selectedEffect) return;

    setEffect(guildId, selectedEffect);

    // Reconstruire les boutons avec le style mis à jour
    const newRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("fx_none")
        .setLabel("🔊 Aucun")
        .setStyle(selectedEffect === "none" ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("fx_bassboost")
        .setLabel("🎵 Bass Boost")
        .setStyle(selectedEffect === "bassboost" ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("fx_nightcore")
        .setLabel("⚡ Nightcore")
        .setStyle(selectedEffect === "nightcore" ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("fx_vaporwave")
        .setLabel("🌴 Vaporwave")
        .setStyle(selectedEffect === "vaporwave" ? ButtonStyle.Success : ButtonStyle.Secondary),
    );

    const newRow2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("fx_8d")
        .setLabel("🎧 8D Audio")
        .setStyle(selectedEffect === "8d" ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("fx_close")
        .setLabel("✅ Fermer")
        .setStyle(ButtonStyle.Danger),
    );

    const updatedEmbed = new EmbedBuilder()
      .setTitle("🎵 Effets Audio")
      .setColor(0x9b59b6)
      .setDescription("Sélectionne un effet audio à appliquer en temps réel.")
      .addFields({
        name: "Effet actuel",
        value: getEffectLabel(selectedEffect),
        inline: false,
      })
      .setFooter(FOOTER)
      .setTimestamp();

    await btn.update({ embeds: [updatedEmbed], components: [newRow, newRow2] });
  });

  collector.on("end", async (_collected, reason) => {
    if (reason === "time") {
      try {
        await interaction.editReply({ components: [] });
      } catch {}
    }
  });
}

// ─── /radio-stop ─────────────────────────────────────────────────────────────

async function handleRadioStop(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = requireGuildId(interaction);
  if (!guildId) return;

  if (!isRadioPlaying()) {
    await interaction.reply({
      content: "⚠️ Aucun flash info radio en cours.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("📻 Arrêt du Flash Info Radio")
    .setColor(0xed4245)
    .setDescription("Le flash info radio-gaming va être arrêté. Confirme l'arrêt.")
    .setFooter(FOOTER)
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("radio_confirm_stop")
      .setLabel("✅ Confirmer l'arrêt")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("radio_cancel")
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
        content: "❌ Seul l'auteur peut confirmer l'arrêt.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    if (btn.customId === "radio_confirm_stop") {
      const stopped = stopRadio(guildId);
      collector.stop("stopped");

      const resultEmbed = new EmbedBuilder()
        .setTitle("📻 Radio Arrêtée")
        .setColor(stopped ? 0x57f287 : 0xed4245)
        .setDescription(
          stopped ? "✅ Le flash info radio a été arrêté." : "⚠️ Impossible d'arrêter la radio.",
        )
        .setTimestamp();

      await btn.update({ embeds: [resultEmbed], components: [] });
    } else if (btn.customId === "radio_cancel") {
      collector.stop("cancelled");
      await btn.update({
        embeds: [embed.setColor(0x95a5a6).setDescription("Arrêt annulé.")],
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getEffectLabel(effect: AudioEffect): string {
  switch (effect) {
    case "bassboost":
      return "🎵 Bass Boost";
    case "nightcore":
      return "⚡ Nightcore";
    case "vaporwave":
      return "🌴 Vaporwave";
    case "8d":
      return "🎧 8D Audio";
    default:
      return "🔊 Aucun effet";
  }
}
