/**
 * memoryCommands.ts — Commande /memory pour gérer la mémoire IA
 *
 * /memory list    — Affiche les faits mémorisés sur l'utilisateur
 * /memory forget  — Supprime un fait spécifique ou toute la mémoire
 * /memory search  — Recherche sémantique dans la mémoire vectorielle
 */

import {
  MessageFlags,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import logger from "../utils/logger.js";
import prisma from "../prisma.js";
import { searchVectorMemories } from "../services/vectorMemory.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("memory")
    .setDescription("Gère ta mémoire IA (faits, préférences, historique)")
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("Affiche tous les faits mémorisés sur toi"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("forget")
        .setDescription("Supprime un fait ou toute ta mémoire")
        .addStringOption((opt) =>
          opt
            .setName("key")
            .setDescription("La clé du fait à supprimer (ou 'all' pour tout effacer)")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("search")
        .setDescription("Recherche sémantique dans ta mémoire")
        .addStringOption((opt) =>
          opt.setName("query").setDescription("Ta recherche").setRequired(true),
        ),
    )
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  try {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    switch (sub) {
      case "list":
        await handleMemoryList(interaction, userId);
        break;
      case "forget":
        await handleMemoryForget(interaction, userId);
        break;
      case "search":
        await handleMemorySearch(interaction, userId);
        break;
    }
  } catch (err) {
    logger.error("[MemoryCmd] Erreur:", err);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ content: "Une erreur est survenue." });
      } else {
        await interaction.reply({
          content: "Une erreur est survenue.",
          flags: [MessageFlags.Ephemeral],
        });
      }
    } catch { logger.error("[Silent catch]"); }
  }
}

// ─── /memory list ────────────────────────────────────────────────────────────

async function handleMemoryList(interaction: ChatInputCommandInteraction, userId: string) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const facts = await prisma.memoryFact.findMany({
    where: { userId },
    orderBy: { weight: "desc" },
    take: 25,
  });

  const embeddingCount = await prisma.memoryEmbedding.count({ where: { userId } });

  if (facts.length === 0 && embeddingCount === 0) {
    await interaction.editReply({
      content:
        "🧠 Aucune mémoire enregistrée pour le moment. Je mémorise automatiquement des faits lors de nos conversations.",
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🧠 Ta mémoire IA")
    .setDescription(
      `${facts.length} fait(s) mémorisé(s) • ${embeddingCount} souvenir(s) vectoriel(s)`,
    )
    .setTimestamp();

  for (const fact of facts.slice(0, 15)) {
    embed.addFields({
      name: `📌 ${fact.key} (${fact.category || "auto"})`,
      value: fact.value.slice(0, 200),
      inline: false,
    });
  }

  if (facts.length > 15) {
    embed.setFooter({ text: `+ ${facts.length - 15} autres faits non affichés` });
  }

  await interaction.editReply({ embeds: [embed] });
}

// ─── /memory forget ──────────────────────────────────────────────────────────

async function handleMemoryForget(interaction: ChatInputCommandInteraction, userId: string) {
  const key = interaction.options.getString("key", true);

  if (key.toLowerCase() === "all") {
    // Delete all facts and embeddings
    const factsDeleted = await prisma.memoryFact.deleteMany({ where: { userId } });
    const embeddingsDeleted = await prisma.memoryEmbedding.deleteMany({ where: { userId } });

    await interaction.reply({
      content: `🧹 Mémoire effacée: ${factsDeleted.count} fait(s) + ${embeddingsDeleted.count} souvenir(s) vectoriel(s) supprimés.`,
      flags: [MessageFlags.Ephemeral],
    });
    logger.info(`[MemoryCmd] ${interaction.user.tag} a effacé toute sa mémoire`);
    return;
  }

  // Delete specific fact
  const deleted = await prisma.memoryFact.deleteMany({
    where: { userId, key },
  });

  if (deleted.count > 0) {
    await interaction.reply({
      content: `✅ Fait "${key}" supprimé de ta mémoire.`,
      flags: [MessageFlags.Ephemeral],
    });
  } else {
    await interaction.reply({
      content: `❌ Aucun fait trouvé avec la clé "${key}". Utilise \`/memory list\` pour voir les clés disponibles.`,
      flags: [MessageFlags.Ephemeral],
    });
  }
}

// ─── /memory search ──────────────────────────────────────────────────────────

async function handleMemorySearch(interaction: ChatInputCommandInteraction, userId: string) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const query = interaction.options.getString("query", true);

  const results = await searchVectorMemories(userId, query, 5, 0.2);

  if (results.length === 0) {
    await interaction.editReply({
      content: "🔍 Aucun souvenir trouvé pour cette recherche.",
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🔍 Recherche dans ta mémoire")
    .setDescription(`Requête: "${query}"`)
    .setTimestamp();

  for (const result of results) {
    const scorePercent = Math.round(result.score * 100);
    embed.addFields({
      name: `📊 ${scorePercent}% de correspondance`,
      value: result.content.slice(0, 200),
      inline: false,
    });
  }

  await interaction.editReply({ embeds: [embed] });
}
