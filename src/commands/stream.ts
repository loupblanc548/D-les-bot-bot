/**
 * stream.ts — Commande slash /stream
 * Permet au bot principal (#6851) de contrôler le Go Live du selfbot (johnhelldivers26)
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { startVideoStream, stopVideoStream, isStreamActive } from "../services/videoStream.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("stream")
    .setDescription("Contrôle le Go Live (stream des jeux en direct)")
    .addStringOption((o) =>
      o
        .setName("action")
        .setDescription("Action à effectuer")
        .setRequired(true)
        .addChoices(
          { name: "▶️ Démarrer", value: "start" },
          { name: "⏹️ Arrêter", value: "stop" },
          { name: "🔄 Redémarrer", value: "restart" },
          { name: "📊 Statut", value: "status" },
        ),
    )
    .toJSON(),
];

export async function handleStreamCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const action = interaction.options.getString("action", true);
  const active = isStreamActive();

  switch (action) {
    case "start": {
      if (active) {
        await interaction.reply({
          content: "ℹ️ Le stream est déjà en cours.",
          ephemeral: true,
        });
        return;
      }
      await interaction.reply({
        content: "▶️ Démarrage du Go Live...",
        ephemeral: true,
      });
      startVideoStream();
      return;
    }

    case "stop": {
      if (!active) {
        await interaction.reply({
          content: "ℹ️ Le stream n'est pas en cours.",
          ephemeral: true,
        });
        return;
      }
      stopVideoStream();
      await interaction.reply({
        content: "⏹️ Stream arrêté.",
        ephemeral: true,
      });
      return;
    }

    case "restart": {
      await interaction.reply({
        content: "🔄 Redémarrage du stream...",
        ephemeral: true,
      });
      stopVideoStream();
      setTimeout(() => startVideoStream(), 3000);
      return;
    }

    case "status": {
      const embed = new EmbedBuilder()
        .setTitle("📊 Statut du Go Live")
        .setColor(active ? 0x00ff00 : 0xff0000)
        .addFields(
          {
            name: "État",
            value: active ? "🟢 En cours" : "🔴 Arrêté",
            inline: true,
          },
          {
            name: "Selfbot",
            value: "johnhelldivers26",
            inline: true,
          },
          {
            name: "Contrôlé par",
            value: "Bot #6851",
            inline: true,
          },
        )
        .setFooter({ text: "Go Live Controller" })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }
  }
}
