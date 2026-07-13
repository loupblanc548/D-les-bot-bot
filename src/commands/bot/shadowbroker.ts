import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import { defineSub } from "../router/helpers.js";

export default defineSub({
  name: "shadowbroker",
  build: (sc) => sc.setDescription("Ouvre le dashboard Shadow Broker"),
  execute: async (interaction) => {
    const dashboardUrl =
      process.env.DASHBOARD_URL || "https://dashboard-bot-helldivers-production.up.railway.app";
    const embed = new EmbedBuilder()
      .setColor(0x2f3136)
      .setTitle("🕵️ Shadow Broker")
      .setDescription("Clique sur un des boutons ci-dessous pour ouvrir le dashboard ou l'outil.")
      .addFields(
        { name: "📊 Dashboard Bot", value: "Gestion du bot, stats, config serveurs", inline: true },
        {
          name: "🔍 EQGRP Lost in Translation",
          value: "Equation Group — outils déchiffrés",
          inline: true,
        },
      )
      .setTimestamp();
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setLabel("Dashboard Bot").setStyle(ButtonStyle.Link).setURL(dashboardUrl),
      new ButtonBuilder()
        .setLabel("EQGRP Lost in Translation")
        .setStyle(ButtonStyle.Link)
        .setURL("https://github.com/x0rz/EQGRP_Lost_in_Translation"),
    );
    await interaction.reply({ embeds: [embed], components: [row] });
  },
});
