import { MessageFlags } from "discord.js";
import type { SubcommandDef } from "../router/types.js";

export default {
  name: "agentchat",
  build: (sc) =>
    sc
      .setDescription("💬 Envoie un message chat via le bot Minecraft (LLM agent)")
      .addStringOption((o) =>
        o.setName("message").setDescription("Message à envoyer").setRequired(true),
      ),
  execute: async (interaction) => {
    const { sendAgentChat, isAgentAvailable } = await import("../../services/mineflayerAgent.js");
    if (!isAgentAvailable()) {
      await interaction.reply({
        content: "❌ Agent non disponible",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }
    const message = interaction.options.getString("message", true);
    const result = await sendAgentChat(message);
    await interaction.reply({ content: result.message, flags: [MessageFlags.Ephemeral] });
  },
} as SubcommandDef;
