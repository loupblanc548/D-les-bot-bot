import { MessageFlags } from "discord.js";
import { defineSub } from "../router/helpers.js";

export default defineSub({
  name: "stop-server",
  build: (sc) => sc.setDescription("Arrête le serveur Bedrock dédié"),
  execute: async (interaction) => {
    const { stopServer } = await import("../../services/minecraftBot.js");
    const result = stopServer();
    await interaction.reply({ content: result.message, flags: [MessageFlags.Ephemeral] });
  },
});
