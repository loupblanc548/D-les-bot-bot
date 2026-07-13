import { MessageFlags } from "discord.js";
import { defineSub } from "../router/helpers.js";

export default defineSub({
  name: "mine",
  build: (sc) =>
    sc
      .setDescription("Démarre le mining automatique")
      .addStringOption((o) =>
        o
          .setName("mode")
          .setDescription("Mode de mining")
          .setRequired(false)
          .addChoices(
            { name: "Strip mining (tunnel droit)", value: "strip" },
            { name: "Branch mining (branches)", value: "branch" },
            { name: "Tunnel (1x2)", value: "tunnel" },
          ),
      ),
  execute: async (interaction) => {
    const { startMining } = await import("../../services/minecraftBot.js");
    const mode = (interaction.options.getString("mode") ?? "strip") as
      "strip" | "branch" | "tunnel";
    const result = startMining(mode);
    await interaction.reply({ content: result.message, flags: [MessageFlags.Ephemeral] });
  },
});
