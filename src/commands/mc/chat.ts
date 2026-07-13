import { MessageFlags } from "discord.js";
import { defineSub } from "../router/helpers.js";

export default defineSub({
  name: "chat",
  build: (sc) =>
    sc
      .setDescription("Envoie un message dans le chat Minecraft")
      .addStringOption((o) =>
        o.setName("message").setDescription("Message à envoyer").setRequired(true),
      ),
  execute: async (interaction) => {
    const { sendChat } = await import("../../services/minecraftBot.js");
    const message = interaction.options.getString("message", true);
    const result = sendChat(message);
    await interaction.reply({ content: result.message, flags: [MessageFlags.Ephemeral] });
  },
});
