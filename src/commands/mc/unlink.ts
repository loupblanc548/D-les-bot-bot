import { MessageFlags } from "discord.js";
import { defineSub } from "../router/helpers.js";

export default defineSub({
  name: "unlink",
  build: (sc) => sc.setDescription("Détacher ton compte Minecraft"),
  execute: async (interaction) => {
    const { unlink } = await import("../../services/minecraftLink.js");
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const result = await unlink(interaction.user.id);
    await interaction.editReply({ content: result.message });
  },
});
