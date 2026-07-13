import { MessageFlags } from "discord.js";
import { defineSub } from "../router/helpers.js";

export default defineSub({
  name: "connect",
  build: (sc) =>
    sc
      .setDescription("Connecte le bot à un serveur Minecraft Bedrock")
      .addStringOption((o) => o.setName("ip").setDescription("IP du serveur").setRequired(true))
      .addIntegerOption((o) =>
        o
          .setName("port")
          .setDescription("Port (défaut: 19132)")
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(65535),
      )
      .addStringOption((o) =>
        o.setName("pseudo").setDescription("Pseudo du bot").setRequired(false),
      ),
  execute: async (interaction) => {
    const { connectBot } = await import("../../services/minecraftBot.js");
    const { buildMinecraftConnectEmbed } = await import("../../utils/gameSetupEmbeds.js");
    const ip = interaction.options.getString("ip", true);
    const port = interaction.options.getInteger("port") ?? 19132;
    const pseudo =
      interaction.options.getString("pseudo") ?? `Bot_${Math.floor(Math.random() * 9999)}`;

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const result = await connectBot({ host: ip, port, username: pseudo, offline: true });
    if (result.success) {
      const embed = buildMinecraftConnectEmbed(ip, port, pseudo);
      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.editReply({ content: result.message });
    }
  },
});
