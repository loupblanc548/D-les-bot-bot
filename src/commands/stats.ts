/**
 * stats.ts — Commande /stats (statistiques du bot)
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("stats")
  .setDescription("Affiche les statistiques du bot");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const uptime = process.uptime();
  const uptimeStr = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`;
  const memUsage = process.memoryUsage();
  const memMB = (memUsage.rss / 1024 / 1024).toFixed(1);
  const guildCount = interaction.client.guilds.cache.size;
  const ping = interaction.client.ws.ping;

  const embed = new EmbedBuilder()
    .setTitle("📊 Statistiques du bot")
    .setColor(0x5865f2)
    .addFields(
      { name: "⏱️ Uptime", value: uptimeStr, inline: true },
      { name: "📡 Latence", value: `${ping}ms`, inline: true },
      { name: "💾 Mémoire", value: `${memMB} MB`, inline: true },
      { name: "🏠 Serveurs", value: `${guildCount}`, inline: true },
      { name: "👥 Utilisateurs", value: `${interaction.client.users.cache.size}`, inline: true },
      { name: "🔧 Node.js", value: process.version, inline: true },
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
