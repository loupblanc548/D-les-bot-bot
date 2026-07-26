/**
 * config.ts — Commande /config (configuration serveur via Prisma)
 *
 * Permet aux admins de configurer le bot par serveur.
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";

export const data = new SlashCommandBuilder()
  .setName("config")
  .setDescription("Configuration du bot pour ce serveur")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub.setName("view").setDescription("Voir la configuration actuelle"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("set")
      .setDescription("Modifier un paramètre")
      .addStringOption((opt) =>
        opt.setName("key").setDescription("Nom du paramètre").setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName("value").setDescription("Valeur du paramètre").setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName("reset").setDescription("Réinitialiser la configuration"),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: "❌ Cette commande nécessite un serveur.", ephemeral: true });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case "view":
      await viewConfig(interaction);
      break;
    case "set":
      await setConfig(interaction);
      break;
    case "reset":
      await resetConfig(interaction);
      break;
  }
}

async function viewConfig(interaction: ChatInputCommandInteraction): Promise<void> {
  const config = await getGuildConfig(interaction.guildId!);
  const entries = Object.entries(config).filter(([, v]) => v !== null && v !== undefined);

  const embed = new EmbedBuilder()
    .setTitle("⚙️ Configuration du serveur")
    .setColor(0x5865f2)
    .setDescription(
      entries.length > 0
        ? entries.map(([k, v]) => `**${k}**: ${v}`).join("\n")
        : "Aucune configuration personnalisée. Valeurs par défaut appliquées.",
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function setConfig(interaction: ChatInputCommandInteraction): Promise<void> {
  const key = interaction.options.getString("key")!;
  const value = interaction.options.getString("value")!;

  const ALLOWED_KEYS = ["prefix", "language", "autoModEnabled", "logChannelId", "welcomeMessage"];
  if (!ALLOWED_KEYS.includes(key)) {
    await interaction.reply({
      content: `❌ Clé invalide. Clés autorisées: ${ALLOWED_KEYS.join(", ")}`,
      ephemeral: true,
    });
    return;
  }

  try {
    await prisma.guildConfig.upsert({
      where: { guildId: interaction.guildId! },
      create: { guildId: interaction.guildId!, [key]: value },
      update: { [key]: value },
    });

    logger.info(`[Config] ${interaction.guildId}: ${key}=${value} by ${interaction.user.tag}`);
    await interaction.reply({ content: `✅ \`${key}\` mis à jour: \`${value}\``, ephemeral: true });
  } catch (err) {
    logger.warn(`[Config] setConfig failed: ${err instanceof Error ? err.message : String(err)}`);
    await interaction.reply({ content: "❌ Erreur lors de la sauvegarde.", ephemeral: true });
  }
}

async function resetConfig(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    await prisma.guildConfig.deleteMany({
      where: { guildId: interaction.guildId! },
    });
    await interaction.reply({ content: "✅ Configuration réinitialisée aux valeurs par défaut.", ephemeral: true });
  } catch {
    await interaction.reply({ content: "❌ Erreur lors de la réinitialisation.", ephemeral: true });
  }
}

async function getGuildConfig(guildId: string): Promise<Record<string, unknown>> {
  try {
    const config = await prisma.guildConfig.findUnique({ where: { guildId } });
    return config ? (config as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
