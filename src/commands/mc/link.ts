import { MessageFlags } from "discord.js";
import { defineSub } from "../router/helpers.js";

export default defineSub({
  name: "link",
  build: (sc) =>
    sc
      .setDescription("Lier ton compte Minecraft à ton Discord")
      .addStringOption((o) =>
        o
          .setName("gamertag")
          .setDescription("Ton gamertag Minecraft (Java ou Bedrock)")
          .setRequired(true)
          .setMinLength(3)
          .setMaxLength(16),
      ),
  execute: async (interaction) => {
    const { startLink } = await import("../../services/minecraftLink.js");
    const { buildMinecraftLinkEmbed } = await import("../../utils/gameSetupEmbeds.js");
    const gamertag = interaction.options.getString("gamertag", true);

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const result = await startLink(interaction.user.id, gamertag);
    if (result.success && result.code) {
      const embed = buildMinecraftLinkEmbed(gamertag, result.code);
      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.editReply({ content: result.message });
    }
  },
});
