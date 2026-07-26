/**
 * customCommands.ts — Créer des commandes personnalisées depuis le panel
 */
import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("customcmd")
    .setDescription("Gère les commandes personnalisées du serveur")
    .addSubcommand((sub) =>
      sub.setName("create").setDescription("Crée une commande personnalisée")
        .addStringOption((o) => o.setName("nom").setDescription("Nom de la commande (sans /)").setRequired(true))
        .addStringOption((o) => o.setName("reponse").setDescription("Réponse du bot").setRequired(true))
        .addStringOption((o) => o.setName("description").setDescription("Description de la commande").setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub.setName("delete").setDescription("Supprime une commande personnalisée")
        .addStringOption((o) => o.setName("nom").setDescription("Nom de la commande à supprimer").setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("Liste toutes les commandes personnalisées"),
    )
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (interaction.commandName !== "customcmd") return;
  if (!interaction.guildId) return;

  const sub = interaction.options.getSubcommand();

  if (sub === "create") {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const name = interaction.options.getString("nom", true).toLowerCase().replace(/[^a-z0-9-]/g, "");
    const response = interaction.options.getString("reponse", true);
    const description = interaction.options.getString("description") || "Commande personnalisée";

    if (name.length < 1 || name.length > 32) {
      await interaction.editReply({ content: "❌ Le nom doit faire entre 1 et 32 caractères." });
      return;
    }

    try {
      await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS custom_commands (guildId TEXT, name TEXT, response TEXT, description TEXT, createdBy TEXT, createdAt TEXT, PRIMARY KEY (guildId, name))`;
      await prisma.$executeRaw`INSERT INTO custom_commands (guildId, name, response, description, createdBy, createdAt) VALUES (${interaction.guildId}, ${name}, ${response}, ${description}, ${interaction.user.id}, ${new Date().toISOString()}) ON CONFLICT (guildId, name) DO UPDATE SET response = ${response}, description = ${description}, createdBy = ${interaction.user.id}, createdAt = ${new Date().toISOString()}`;
    } catch (err) {
      logger.error(`[CustomCmd] DB error: ${err instanceof Error ? err.message : String(err)}`);
      await interaction.editReply({ content: "❌ Erreur lors de la création." });
      return;
    }

    logger.info(`[CustomCmd] Commande /${name} créée par ${interaction.user.username}`);
    await interaction.editReply({ content: `✅ Commande personnalisée \`${name}\` créée ! Elle répondra: "${response.substring(0, 100)}"` });
  }

  if (sub === "delete") {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const name = interaction.options.getString("nom", true).toLowerCase().replace(/[^a-z0-9-]/g, "");

    try {
      await prisma.$executeRaw`DELETE FROM custom_commands WHERE guildId = ${interaction.guildId} AND name = ${name}`;
    } catch (err) {
      logger.error(`[CustomCmd] Delete error: ${err instanceof Error ? err.message : String(err)}`);
    }

    await interaction.editReply({ content: `✅ Commande \`${name}\` supprimée.` });
  }

  if (sub === "list") {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    let cmds: { name: string; response: string; description: string }[] = [];
    try {
      cmds = await prisma.$queryRaw`SELECT name, response, description FROM custom_commands WHERE guildId = ${interaction.guildId}` as any;
    } catch (err) {
      logger.error(`[CustomCmd] List error: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (cmds.length === 0) {
      await interaction.editReply({ content: "Aucune commande personnalisée. Utilisez `/customcmd create` pour en créer une." });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("📝 Commandes personnalisées")
      .setColor(0x6366f1)
      .setDescription(cmds.map((c) => `**${c.name}** — ${c.description}\n> ${c.response.substring(0, 80)}`).join("\n\n"));

    await interaction.editReply({ embeds: [embed] });
  }
}

// Handler for custom command triggers (called from message events)
export async function handleCustomCommand(guildId: string, commandName: string): Promise<string | null> {
  try {
    const results = await prisma.$queryRaw`SELECT response FROM custom_commands WHERE guildId = ${guildId} AND name = ${commandName}` as any[];
    if (results.length > 0) return results[0].response;
  } catch (err) {
    logger.debug(`[CustomCmd] Trigger error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return null;
}
