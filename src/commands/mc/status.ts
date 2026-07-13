import { MessageFlags, EmbedBuilder } from "discord.js";
import { defineSub } from "../router/helpers.js";

export default defineSub({
  name: "status",
  build: (sc) => sc.setDescription("Statut du bot Minecraft"),
  execute: async (interaction) => {
    const { getBotStatus, getMiningStats } = await import("../../services/minecraftBot.js");
    const status = getBotStatus();

    if (!status.connected) {
      await interaction.reply({
        content: "❌ Le bot Minecraft n'est pas connecté. Utilise `/mc connect` d'abord.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const stats = getMiningStats();
    const embed = new EmbedBuilder()
      .setTitle("⛏️ Bot Minecraft — Statut")
      .setColor(status.mining ? 0x00ff00 : 0x808080)
      .addFields(
        {
          name: "🔗 Connexion",
          value: `**Serveur:** \`${status.host}\`\n**Pseudo:** \`${status.username}\`\n**Uptime:** ${formatUptime(status.uptime)}`,
        },
        {
          name: "📍 Position",
          value: status.position
            ? `X: ${status.position.x} | Y: ${status.position.y} | Z: ${status.position.z}`
            : "Inconnue",
        },
        {
          name: "❤️ Santé",
          value: `**Vie:** ${"❤".repeat(Math.ceil(status.health / 2))} (${status.health}/20)\n**Faim:** ${"🍗".repeat(Math.ceil(status.hunger / 2))} (${status.hunger}/20)`,
        },
        {
          name: "⛏️ Mining",
          value: status.mining
            ? `**Mode:** ${stats.mode}\n**Blocs minés:** ${stats.blocksMined}\n**Durée:** ${stats.duration}`
            : "Inactif",
        },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
  },
});

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h${Math.floor((seconds % 3600) / 60)}m`;
}
