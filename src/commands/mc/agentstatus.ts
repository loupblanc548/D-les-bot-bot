import { MessageFlags, EmbedBuilder } from "discord.js";
import type { SubcommandDef } from "../router/types.js";

export default {
  name: "agentstatus",
  build: (sc) => sc.setDescription("📊 Statut de l'agent LLM + bot Minecraft"),
  execute: async (interaction) => {
    const { getAgentStatus, formatAgentStatus, isAgentAvailable } =
      await import("../../services/mineflayerAgent.js");
    if (!isAgentAvailable()) {
      await interaction.reply({
        content: "❌ Agent non disponible. Démarre le notebook Colab d'abord.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const status = await getAgentStatus();
    if (!status) {
      await interaction.editReply({ content: "❌ Impossible de contacter l'agent." });
      return;
    }
    const embed = new EmbedBuilder()
      .setTitle("🤖 Agent Mineflayer — Statut")
      .setColor(status.connected ? 0x00ff00 : 0xff0000)
      .setDescription(formatAgentStatus(status))
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
} as SubcommandDef;
