import { MessageFlags } from "discord.js";
import { defineSub } from "../router/helpers.js";

export default defineSub({
  name: "seed",
  build: (sc) =>
    sc
      .setDescription("Démarre un serveur Bedrock avec une graine")
      .addStringOption((o) =>
        o.setName("graine").setDescription("Graine du monde").setRequired(true),
      )
      .addIntegerOption((o) =>
        o
          .setName("port")
          .setDescription("Port (défaut: 19132)")
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(65535),
      ),
  execute: async (interaction) => {
    const { startServerWithSeed } = await import("../../services/minecraftBot.js");
    const seed = interaction.options.getString("graine", true);
    const port = interaction.options.getInteger("port") ?? 19132;
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const result = await startServerWithSeed(seed, port);
    await interaction.editReply({ content: result.message });
  },
});
