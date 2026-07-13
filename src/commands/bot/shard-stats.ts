import { EmbedBuilder } from "discord.js";
import { defineSub } from "../router/helpers.js";

export default defineSub({
  name: "shard-stats",
  build: (sc) => sc.setDescription("Statut des shards (admin)"),
  execute: async (interaction) => {
    const { requireAdmin } = await import("../../services/permissions.js");
    const { getShardStats, isSharded, getShardCount } = await import("../../shardManager.js");

    if (!(await requireAdmin(interaction))) return;

    const sharded = isSharded();
    const count = getShardCount();

    if (!sharded) {
      await interaction.reply({
        content: `ℹ️ Le bot tourne en mode **single** (pas de sharding).\nPour activer le sharding : \`FORCE_SHARDING=true\` dans le .env`,
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const stats = await getShardStats();
      if (stats.length === 0) {
        await interaction.editReply("❌ Aucune donnée de shard disponible.");
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle("📊 Statut des Shards")
        .setColor(0x5865f2)
        .setDescription(`${stats.length} shard(s) — Total: ${count}`);

      let totalGuilds = 0;
      let totalPing = 0;
      let connectedCount = 0;

      for (const stat of stats) {
        const statusEmoji =
          stat.status === "connected" ? "🟢" : stat.status === "disconnected" ? "🔴" : "❌";
        embed.addFields({
          name: `${statusEmoji} Shard ${stat.id}`,
          value: `**Ping:** ${stat.ping}ms\n**Guildes:** ${stat.guilds}\n**Statut:** ${stat.status}`,
          inline: true,
        });
        totalGuilds += stat.guilds;
        if (stat.ping > 0) totalPing += stat.ping;
        if (stat.status === "connected") connectedCount++;
      }

      embed.setFooter({
        text: `${connectedCount}/${stats.length} connectés • ${totalGuilds} guildes • ${Math.round(totalPing / stats.length)}ms avg`,
      });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await interaction.editReply(
        `❌ Erreur: ${error instanceof Error ? error.message : "erreur inconnue"}`,
      );
    }
  },
});
