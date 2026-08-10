import { MessageFlags } from "discord.js";
import type { SubcommandDef } from "../router/types.js";

export default {
  name: "agent",
  build: (sc) =>
    sc
      .setDescription("🎯 Envoie un objectif au LLM agent Mineflayer (Colab)")
      .addStringOption((o) =>
        o.setName("objectif").setDescription("Objectif en langage naturel").setRequired(true),
      )
      .addIntegerOption((o) =>
        o
          .setName("max_actions")
          .setDescription("Nombre max d'actions (défaut: 50)")
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(200),
      ),
  execute: async (interaction) => {
    const { isAgentAvailable, setAgentGoalLive } = await import(
      "../../services/mineflayerAgent.js"
    );
    if (!isAgentAvailable()) {
      await interaction.reply({
        content:
          "❌ Agent Mineflayer non disponible. Démarre le notebook Colab `mineflayer_agent.ipynb` d'abord.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }
    const goal = interaction.options.getString("objectif", true);
    const maxActions = interaction.options.getInteger("max_actions") ?? 50;

    await interaction.deferReply();
    const channel = interaction.channel;
    if (!channel || !channel.isTextBased()) {
      // No channel — fallback to non-live
      const { setAgentGoal } = await import("../../services/mineflayerAgent.js");
      const result = await setAgentGoal(goal, maxActions);
      await interaction.editReply({ content: result.message });
      return;
    }

    const result = await setAgentGoalLive(goal, maxActions, channel as import("discord.js").TextChannel);
    await interaction.editReply({
      content: result.message + (result.statusMsg ? `\n📡 Suivi en temps réel → ${result.statusMsg.url}` : ""),
    });
  },
} as SubcommandDef;
