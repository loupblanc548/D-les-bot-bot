import { MessageFlags } from "discord.js";
import type { SubcommandDef } from "../router/types.js";

export default {
  name: "agentstop",
  build: (sc) => sc.setDescription("⏹️ Arrête l'agent LLM Mineflayer"),
  execute: async (interaction) => {
    const { stopAgent, isAgentAvailable } = await import("../../services/mineflayerAgent.js");
    if (!isAgentAvailable()) {
      await interaction.reply({
        content: "❌ Agent non disponible",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }
    await interaction.deferReply();
    const result = await stopAgent();
    await interaction.editReply({ content: result.message });
  },
} as SubcommandDef;
