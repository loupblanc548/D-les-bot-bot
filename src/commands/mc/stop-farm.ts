import { MessageFlags } from "discord.js";
import { defineSub } from "../router/helpers.js";

export default defineSub({
  name: "stop-farm",
  build: (sc) => sc.setDescription("Arrête l'agriculture"),
  execute: async (interaction) => {
    const { stopFarming } = await import("../../services/minecraftBot.js");
    const result = stopFarming();
    await interaction.reply({ content: result.message, flags: [MessageFlags.Ephemeral] });
  },
});
