import { MessageFlags } from "discord.js";
import { defineSub } from "../router/helpers.js";

export default defineSub({
  name: "equip",
  build: (sc) =>
    sc
      .setDescription("Équipe un outil dans la main du bot")
      .addStringOption((o) =>
        o
          .setName("outil")
          .setDescription("Type d'outil")
          .setRequired(true)
          .addChoices(
            { name: "⚔️ Épée", value: "sword" },
            { name: "⛏️ Pioche", value: "pickaxe" },
            { name: "🪓 Hache", value: "axe" },
            { name: "🪏 Pelle", value: "shovel" },
            { name: "🌾 Houe", value: "hoe" },
            { name: "🏹 Arc", value: "bow" },
            { name: "🏹 Arbalète", value: "crossbow" },
            { name: "🛡️ Bouclier", value: "shield" },
            { name: "🔥 Briquet", value: "flint_and_steel" },
            { name: "🎣 Canne à pêche", value: "fishing_rod" },
            { name: "✂️ Cisailles", value: "shears" },
          ),
      ),
  execute: async (interaction) => {
    const { equipTool } = await import("../../services/minecraftBot.js");
    const tool = interaction.options.getString("outil", true);
    const result = equipTool(tool);
    await interaction.reply({ content: result.message, flags: [MessageFlags.Ephemeral] });
  },
});
