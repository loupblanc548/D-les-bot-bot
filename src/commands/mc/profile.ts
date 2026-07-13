import { MessageFlags, EmbedBuilder } from "discord.js";
import { defineSub } from "../router/helpers.js";

export default defineSub({
  name: "profile",
  build: (sc) => sc.setDescription("Affiche ton profil Minecraft lié"),
  execute: async (interaction) => {
    const { getLinkedProfile } = await import("../../services/minecraftLink.js");
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const profile = await getLinkedProfile(interaction.user.id);
    if (!profile) {
      await interaction.editReply({
        content: "❌ Tu n'as pas de compte Minecraft lié. Utilise `/mc link` d'abord.",
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("🎮 Profil Minecraft")
      .setColor(profile.verified ? 0x4a9b4a : 0xffaa00)
      .setDescription(
        profile.verified
          ? "✅ Compte **vérifié**"
          : `⏳ Vérification en attente. Tape \`/verify ${profile.verifyCode}\` dans le chat Minecraft.`,
      )
      .addFields(
        { name: "Gamertag", value: profile.gamertag, inline: true },
        { name: "UUID", value: profile.uuid ? `\`${profile.uuid}\`` : "N/A", inline: true },
        { name: "Statut", value: profile.verified ? "✅ Vérifié" : "⏳ En attente", inline: true },
        {
          name: "Lié le",
          value: `<t:${Math.floor(profile.linkedAt.getTime() / 1000)}:R>`,
          inline: true,
        },
      )
      .setTimestamp();

    if (profile.verified && profile.uuid) {
      embed.setThumbnail(`https://crafatar.com/avatars/${profile.uuid}?size=128&overlay`);
    }

    await interaction.editReply({ embeds: [embed] });
  },
});
