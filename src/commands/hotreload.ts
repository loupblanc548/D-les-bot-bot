import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, Client } from "discord.js";
import logger from "../utils/logger";
import { requireAdmin } from "../services/permissions";
import {
  enableMaintenanceMode,
  disableMaintenanceMode,
  reloadConfig,
  reloadCommands,
  enableAutoReload,
  disableAutoReload,
  getHotReloadStatus,
} from "../utils/hot-reload";

export const data = new SlashCommandBuilder()
  .setName("hotreload")
  .setDescription("Gestion du hot reload du bot (admin only)")
  .addSubcommand(subcommand =>
    subcommand
      .setName("reload")
      .setDescription("Recharge les commandes et la configuration")
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName("maintenance")
      .setDescription("Active/désactive le mode maintenance")
      .addBooleanOption(option =>
        option
          .setName("enable")
          .setDescription("Activer le mode maintenance")
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName("auto")
      .setDescription("Active/désactive le rechargement automatique")
      .addBooleanOption(option =>
        option
          .setName("enable")
          .setDescription("Activer le rechargement automatique")
          .setRequired(true)
      )
      .addIntegerOption(option =>
        option
          .setName("interval")
          .setDescription("Intervalle en secondes (défaut: 300)")
          .setRequired(false)
          .setMinValue(60)
          .setMaxValue(3600)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName("status")
      .setDescription("Affiche le statut du hot reload")
  );

export async function execute(interaction: ChatInputCommandInteraction, client: Client) {
  await requireAdmin(interaction);
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case "reload":
      await handleReload(interaction, client);
      break;
    case "maintenance":
      await handleMaintenance(interaction, client);
      break;
    case "auto":
      await handleAuto(interaction, client);
      break;
    case "status":
      await handleStatus(interaction);
      break;
  }
}

async function handleReload(interaction: ChatInputCommandInteraction, client: Client) {
  await interaction.deferReply({ ephemeral: true });

  try {
    reloadConfig();
    await reloadCommands(client);

    const embed = new EmbedBuilder()
      .setTitle("🔄 Hot Reload")
      .setDescription("Commandes et configuration rechargées avec succès")
      .setColor(0x00ff00)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[HotReload] Erreur lors du rechargement:", error);
    const embed = new EmbedBuilder()
      .setTitle("❌ Erreur")
      .setDescription(`Erreur lors du rechargement: ${String(error)}`)
      .setColor(0xff0000)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
}

async function handleMaintenance(interaction: ChatInputCommandInteraction, client: Client) {
  const enable = interaction.options.getBoolean("enable", true);

  await interaction.deferReply({ ephemeral: true });

  try {
    if (enable) {
      await enableMaintenanceMode(client);
      const embed = new EmbedBuilder()
        .setTitle("🔧 Mode Maintenance")
        .setDescription("Mode maintenance activé. Les commandes sont désactivées.")
        .setColor(0xffaa00)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } else {
      await disableMaintenanceMode(client);
      const embed = new EmbedBuilder()
        .setTitle("✅ Mode Normal")
        .setDescription("Mode maintenance désactivé. Les commandes sont réactivées.")
        .setColor(0x00ff00)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }
  } catch (error) {
    logger.error("[HotReload] Erreur lors du changement de mode:", error);
    const embed = new EmbedBuilder()
      .setTitle("❌ Erreur")
      .setDescription(`Erreur: ${String(error)}`)
      .setColor(0xff0000)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
}

async function handleAuto(interaction: ChatInputCommandInteraction, client: Client) {
  const enable = interaction.options.getBoolean("enable", true);
  const intervalSeconds = interaction.options.getInteger("interval") || 300;

  await interaction.deferReply({ ephemeral: true });

  try {
    if (enable) {
      enableAutoReload(client, intervalSeconds * 1000);
      const embed = new EmbedBuilder()
        .setTitle("🔄 Auto-Reload Activé")
        .setDescription(`Rechargement automatique toutes les ${intervalSeconds} secondes`)
        .setColor(0x00ff00)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } else {
      disableAutoReload();
      const embed = new EmbedBuilder()
        .setTitle("⏹️ Auto-Reload Désactivé")
        .setDescription("Rechargement automatique désactivé")
        .setColor(0xffaa00)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }
  } catch (error) {
    logger.error("[HotReload] Erreur lors du changement d'auto-reload:", error);
    const embed = new EmbedBuilder()
      .setTitle("❌ Erreur")
      .setDescription(`Erreur: ${String(error)}`)
      .setColor(0xff0000)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
}

async function handleStatus(interaction: ChatInputCommandInteraction) {
  const status = getHotReloadStatus();

  const embed = new EmbedBuilder()
    .setTitle("📊 Statut Hot Reload")
    .addFields(
      {
        name: "Rechargement en cours",
        value: status.isReloading ? "✅ Oui" : "❌ Non",
        inline: true,
      },
      {
        name: "Auto-reload",
        value: status.autoReloadEnabled ? "✅ Activé" : "❌ Désactivé",
        inline: true,
      }
    )
    .setColor(0x00ff00)
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
