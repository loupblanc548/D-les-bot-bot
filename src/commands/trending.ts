/**
 * trending.ts — Commande slash /trending
 * Affiche les jeux les plus attendus via IGDB (tri par hypes)
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { getTrackedReleases } from "../services/gameReleaseCountdown.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("trending")
    .setDescription("Affiche les jeux les plus attendus (tri par popularité IGDB)")
    .addIntegerOption((o) =>
      o
        .setName("top")
        .setDescription("Nombre de jeux à afficher (5-20)")
        .setRequired(false)
        .setMinValue(5)
        .setMaxValue(20),
    )
    .toJSON(),
];

export async function handleTrendingCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const topN = interaction.options.getInteger("top") || 10;
  const releases = getTrackedReleases();

  if (releases.length === 0) {
    await interaction.reply({
      content:
        "📭 Aucune donnée IGDB disponible pour le moment. Réessaie dans quelques minutes.",
      ephemeral: true,
    });
    return;
  }

  const sorted = [...releases]
    .sort((a, b) => {
      const aDays = Math.ceil((a.releaseDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      const bDays = Math.ceil((b.releaseDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (aDays <= 0 && bDays <= 0) return 0;
      if (aDays <= 0) return 1;
      if (bDays <= 0) return -1;
      return aDays - bDays;
    })
    .slice(0, topN);

  const medals = ["🥇", "🥈", "🥉"];
  const lines = sorted.map((r, i) => {
    const daysLeft = Math.ceil(
      (r.releaseDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    const countdown = daysLeft > 0 ? `⏰ **${daysLeft}j**` : "🎉 **Sorti !**";
    const medal = medals[i] || `**${i + 1}.**`;
    const platforms = r.platforms.slice(0, 3).join(", ") || "N/A";
    const genres = r.genres.slice(0, 2).join(", ");
    const genreStr = genres ? ` • 🏷️ ${genres}` : "";
    return `${medal} **${r.gameName}**\n📅 ${r.releaseDate.toLocaleDateString("fr-FR")} • ${countdown} • 🎮 ${platforms}${genreStr}`;
  });

  const embed = new EmbedBuilder()
    .setTitle("🔥 Jeux les plus attendus")
    .setColor(0xff6b35)
    .setDescription(lines.join("\n\n"))
    .setFooter({ text: `Top ${sorted.length} • IGDB • Hypes & proximité de sortie` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
