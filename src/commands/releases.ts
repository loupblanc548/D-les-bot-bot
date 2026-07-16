/**
 * releases.ts — Commande slash /releases
 * Affiche les sorties de jeux à venir, permet de filtrer par plateforme
 * et donne le lien vers la page web de partage d'écran.
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { getTrackedReleases } from "../services/gameReleaseCountdown.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("releases")
    .setDescription("Affiche les sorties de jeux à venir")
    .addStringOption((o) =>
      o
        .setName("plateforme")
        .setDescription("Filtrer par plateforme")
        .setRequired(false)
        .addChoices(
          { name: "Toutes", value: "all" },
          { name: "PC", value: "pc" },
          { name: "PlayStation", value: "playstation" },
          { name: "Xbox", value: "xbox" },
          { name: "Switch", value: "switch" },
        ),
    )
    .toJSON(),
];

export async function handleReleasesCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const platformFilter = (interaction.options.getString("plateforme") || "all").toLowerCase();
  const releases = getTrackedReleases();

  if (releases.length === 0) {
    await interaction.reply({
      content:
        "📭 Aucune sortie à venir pour le moment. Le service récupère les données depuis IGDB toutes les 6 heures.",
      ephemeral: true,
    });
    return;
  }

  const filtered =
    platformFilter === "all"
      ? releases
      : releases.filter((r) => r.platforms.some((p) => p.toLowerCase().includes(platformFilter)));

  if (filtered.length === 0) {
    await interaction.reply({
      content: `📭 Aucune sortie trouvée pour la plateforme **${platformFilter}**.`,
      ephemeral: true,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("🎮 Sorties de jeux à venir")
    .setColor(0x5865f2)
    .setDescription(
      filtered
        .map((r) => {
          const daysLeft = Math.ceil(
            (r.releaseDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
          );
          const countdown = daysLeft > 0 ? `⏰ ${daysLeft}j` : "🎉 Sorti !";
          const platforms = r.platforms.slice(0, 3).join(", ") || "N/A";
          return `**${r.gameName}**\n📅 ${r.releaseDate.toLocaleDateString("fr-FR")} • ${countdown} • ${platforms}`;
        })
        .join("\n\n"),
    )
    .addFields({
      name: "🖥️ Partage d'écran",
      value: `Ouvre [http://${process.env.VPS_IP || "VPS_IP"}:3000/releases](http://${process.env.VPS_IP || "VPS_IP"}:3000/releases) dans ton navigateur, puis partage l'écran dans le salon vocal.`,
      inline: false,
    })
    .setFooter({ text: "Game Release Countdown • IGDB" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
