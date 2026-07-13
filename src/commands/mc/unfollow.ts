import { MessageFlags } from "discord.js";
import { defineSub } from "../router/helpers.js";

export default defineSub({
  name: "unfollow",
  build: (sc) => sc.setDescription("Arrête de suivre"),
  execute: async (interaction) => {
    const { stopFollowing } = await import("../../services/minecraftBot.js");
    const result = stopFollowing();
    await interaction.reply({ content: result.message, flags: [MessageFlags.Ephemeral] });
  },
});
