import { MessageFlags } from "discord.js";
import { defineSub } from "../router/helpers.js";

export default defineSub({
  name: "follow",
  build: (sc) =>
    sc
      .setDescription("Le bot suit un joueur")
      .addStringOption((o) =>
        o.setName("joueur").setDescription("Nom du joueur à suivre").setRequired(true),
      ),
  execute: async (interaction) => {
    const { followPlayer } = await import("../../services/minecraftBot.js");
    const username = interaction.options.getString("joueur", true);
    const result = followPlayer(username);
    await interaction.reply({ content: result.message, flags: [MessageFlags.Ephemeral] });
  },
});
