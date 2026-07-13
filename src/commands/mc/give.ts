import { MessageFlags } from "discord.js";
import { defineSub } from "../router/helpers.js";

export default defineSub({
  name: "give",
  build: (sc) =>
    sc
      .setDescription("Donne un item à un joueur")
      .addStringOption((o) => o.setName("item").setDescription("Nom de l'item").setRequired(true))
      .addIntegerOption((o) =>
        o
          .setName("quantite")
          .setDescription("Quantité (défaut: 1)")
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(2304),
      )
      .addStringOption((o) =>
        o.setName("joueur").setDescription("Joueur cible (défaut: toi)").setRequired(false),
      ),
  execute: async (interaction) => {
    const { giveItem } = await import("../../services/minecraftBot.js");
    const item = interaction.options.getString("item", true);
    const qty = interaction.options.getInteger("quantite") ?? 1;
    const target = interaction.options.getString("joueur") ?? undefined;
    const result = giveItem(item, qty, target);
    await interaction.reply({ content: result.message, flags: [MessageFlags.Ephemeral] });
  },
});
