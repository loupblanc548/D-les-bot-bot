import { MessageFlags } from "discord.js";
import type { SubcommandDef } from "../router/types.js";

export default {
  name: "agentlog",
  build: (sc) =>
    sc
      .setDescription("📋 Historique des actions de l'agent LLM")
      .addIntegerOption((o) =>
        o
          .setName("lignes")
          .setDescription("Nombre de lignes (défaut: 20)")
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(100),
      ),
  execute: async (interaction) => {
    const { getAgentLog, isAgentAvailable } = await import("../../services/mineflayerAgent.js");
    if (!isAgentAvailable()) {
      await interaction.reply({
        content: "❌ Agent non disponible",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const lines = interaction.options.getInteger("lignes") ?? 20;
    const log = await getAgentLog(lines);
    if (!log) {
      await interaction.editReply({ content: "❌ Aucun log disponible." });
      return;
    }
    const truncated = log.slice(-1900);
    await interaction.editReply({ content: `\`\`\`\n${truncated}\n\`\`\`` });
  },
} as SubcommandDef;
