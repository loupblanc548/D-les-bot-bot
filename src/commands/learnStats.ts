/**
 * learnStats.ts — Commande /learn-stats (statistiques d'auto-apprentissage)
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { collectLearnStats, formatBytes } from "../services/learnStatsCollector.js";

export const data = new SlashCommandBuilder()
  .setName("learn-stats")
  .setDescription("Affiche les statistiques d'auto-apprentissage du bot");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const data = collectLearnStats();

    if (!data.totalQA && !data.status.active) {
      await interaction.editReply("❌ Vault Obsidian non configuré ou vide.");
      return;
    }

    const categoryList =
      data.categories.map(([cat, count]) => `**${cat}**: ${count}`).join("\n") ||
      "Aucune catégorie";

    const recentList =
      data.recentSubjects.length > 0
        ? data.recentSubjects.map((s, i) => `${i + 1}. ${s.name}`).join("\n")
        : data.totalQA >= 2000
          ? "Trop de fichiers (>2000) — récents masqués pour performance"
          : "Aucun sujet récent";

    const hitPct = (data.metrics.hitRate * 100).toFixed(1);
    const costSaved = data.metrics.estimatedCostSavedUsd.toFixed(4);

    const embed = new EmbedBuilder()
      .setTitle("🧠 Statistiques d'auto-apprentissage")
      .setColor(0x00d4aa)
      .addFields(
        { name: "📚 Total Q&A", value: `${data.totalQA}`, inline: true },
        { name: "💾 Taille vault", value: formatBytes(data.vaultSizeBytes), inline: true },
        { name: "🔒 Sujets dédupliqués", value: `${data.dedupCount}`, inline: true },
        {
          name: "⚡ Cadence",
          value: `${data.cadence.batchSize} Q&A / ${data.cadence.intervalSeconds}s (~${data.cadence.estimatedPerDay}/jour)`,
          inline: true,
        },
        {
          name: "🎯 Hit rate vault",
          value: `${hitPct}% (${data.metrics.vaultHits} hits / ${data.metrics.vaultMisses} miss)`,
          inline: true,
        },
        {
          name: "💰 Coût API évité (estim.)",
          value: `$${costSaved} (~${data.metrics.estimatedTokensSaved.toLocaleString()} tokens)`,
          inline: true,
        },
        { name: "📂 Répartition par catégorie", value: categoryList, inline: false },
        { name: "🕐 Derniers sujets appris", value: recentList, inline: false },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await interaction.editReply(`❌ Erreur: ${err instanceof Error ? err.message : String(err)}`);
  }
}
