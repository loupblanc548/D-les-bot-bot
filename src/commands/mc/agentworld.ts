import { MessageFlags, EmbedBuilder } from "discord.js";
import type { SubcommandDef } from "../router/types.js";

export default {
  name: "agentworld",
  build: (sc) => sc.setDescription("🌍 État du monde Minecraft vu par l'agent"),
  execute: async (interaction) => {
    const { getWorldState, formatWorldState, isAgentAvailable } =
      await import("../../services/mineflayerAgent.js");
    if (!isAgentAvailable()) {
      await interaction.reply({
        content: "❌ Agent non disponible",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const world = await getWorldState();
    if (!world) {
      await interaction.editReply({ content: "❌ Impossible de récupérer l'état du monde." });
      return;
    }
    const embed = new EmbedBuilder()
      .setTitle("🌍 Monde Minecraft — Vue de l'agent")
      .setColor(0x4caf50)
      .setDescription(formatWorldState(world))
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
} as SubcommandDef;
