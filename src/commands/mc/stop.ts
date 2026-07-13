import { MessageFlags } from "discord.js";
import { defineSub } from "../router/helpers.js";

export default defineSub({
  name: "stop",
  build: (sc) => sc.setDescription("Arrête le mining"),
  execute: async (interaction) => {
    const { stopMining } = await import("../../services/minecraftBot.js");
    const result = stopMining();
    await interaction.reply({ content: result.message, flags: [MessageFlags.Ephemeral] });
  },
});
