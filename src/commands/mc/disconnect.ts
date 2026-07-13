import { MessageFlags } from "discord.js";
import { defineSub } from "../router/helpers.js";

export default defineSub({
  name: "disconnect",
  build: (sc) => sc.setDescription("Déconnecte le bot du serveur"),
  execute: async (interaction) => {
    const { disconnectBot } = await import("../../services/minecraftBot.js");
    const result = disconnectBot();
    await interaction.reply({ content: result.message, flags: [MessageFlags.Ephemeral] });
  },
});
