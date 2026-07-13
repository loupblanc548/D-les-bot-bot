import { MessageFlags } from "discord.js";
import { defineSub } from "../router/helpers.js";

export default defineSub({
  name: "solo",
  build: (sc) =>
    sc
      .setDescription("Démarre un serveur + connecte le bot + mine (tout-en-un)")
      .addStringOption((o) =>
        o
          .setName("graine")
          .setDescription("Graine du monde (aléatoire si vide)")
          .setRequired(false),
      )
      .addBooleanOption((o) =>
        o
          .setName("miner")
          .setDescription("Démarrer le mining auto (défaut: oui)")
          .setRequired(false),
      )
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
    const { soloMode } = await import("../../services/minecraftBot.js");
    const seed = interaction.options.getString("graine") ?? undefined;
    const autoMine = interaction.options.getBoolean("miner") ?? true;
    const mineMode = (interaction.options.getString("mode") ?? "strip") as
      "strip" | "branch" | "tunnel";
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const result = await soloMode(seed, 19132, autoMine, mineMode);
    await interaction.editReply({ content: result.message });
  },
});
