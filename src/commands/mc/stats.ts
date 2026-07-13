import { MessageFlags, EmbedBuilder } from "discord.js";
import { defineSub } from "../router/helpers.js";

export default defineSub({
  name: "stats",
  build: (sc) =>
    sc
      .setDescription("Affiche les stats d'un joueur Minecraft")
      .addStringOption((o) =>
        o
          .setName("pseudo")
          .setDescription("Pseudo Minecraft (ou ton compte lié si vide)")
          .setRequired(false),
      ),
  execute: async (interaction) => {
    const { fetchPlayerStats, getLinkedProfile } = await import("../../services/minecraftLink.js");
    const pseudo = interaction.options.getString("pseudo");

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    let username = pseudo;
    if (!username) {
      const profile = await getLinkedProfile(interaction.user.id);
      if (!profile?.verified) {
        await interaction.editReply({
          content:
            "❌ Tu n'as pas de compte Minecraft lié. Utilise `/mc link` ou précise un pseudo.",
        });
        return;
      }
      username = profile.gamertag;
    }

    const stats = await fetchPlayerStats(username);
    if (!stats) {
      await interaction.editReply({
        content: `❌ Joueur **${username}** introuvable. Vérifie le pseudo (préfixe avec \`.\` pour Bedrock).`,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`📊 Stats Minecraft — ${stats.username}`)
      .setColor(stats.platform === "java" ? 0x4a9b4a : 0xb86b34)
      .setThumbnail(stats.avatarUrl)
      .addFields(
        { name: "Pseudo", value: stats.username, inline: true },
        { name: "UUID", value: `\`${stats.uuid}\``, inline: true },
        {
          name: "Plateforme",
          value: stats.platform === "java" ? "☕ Java Edition" : "🟫 Bedrock",
          inline: true,
        },
      )
      .setTimestamp();

    if (stats.nameHistory && stats.nameHistory.length > 1) {
      const history = stats.nameHistory
        .slice(-10)
        .map(
          (n) =>
            `${n.name}${n.changedToAt ? ` (<t:${Math.floor(n.changedToAt / 1000)}:R>)` : " (original)"}`,
        )
        .join("\n");
      embed.addFields({ name: "Historique des pseudos", value: history, inline: false });
    }

    embed.setImage(stats.skinUrl);
    await interaction.editReply({ embeds: [embed] });
  },
});
