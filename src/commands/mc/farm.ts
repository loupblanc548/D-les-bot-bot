import { MessageFlags } from "discord.js";
import { defineSub } from "../router/helpers.js";

export default defineSub({
  name: "farm",
  build: (sc) =>
    sc
      .setDescription("Démarre l'agriculture automatique")
      .addStringOption((o) =>
        o
          .setName("mode")
          .setDescription("Mode d'agriculture")
          .setRequired(true)
          .addChoices(
            { name: "🌱 Planter", value: "plant" },
            { name: "🌾 Récolter", value: "harvest" },
            { name: "🪏 Labourer", value: "till" },
          ),
      )
      .addStringOption((o) =>
        o
          .setName("culture")
          .setDescription("Type de culture")
          .setRequired(false)
          .addChoices(
            { name: "🌾 Blé", value: "wheat" },
            { name: "🥕 Carotte", value: "carrot" },
            { name: "🥔 Pomme de terre", value: "potato" },
            { name: "🫐 Betterave", value: "beetroot" },
            { name: "🎃 Citrouille", value: "pumpkin" },
            { name: "🍉 Pastèque", value: "melon" },
          ),
      ),
  execute: async (interaction) => {
    const { startFarming } = await import("../../services/minecraftBot.js");
    const mode = interaction.options.getString("mode", true) as "plant" | "harvest" | "till";
    const crop = interaction.options.getString("culture") ?? "wheat";
    const result = startFarming(mode, crop);
    await interaction.reply({ content: result.message, flags: [MessageFlags.Ephemeral] });
  },
});
