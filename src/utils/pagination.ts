/**
 * pagination.ts — Utilitaire de pagination d'embeds
 *
 * Ajoute des boutons Précédent/Suivant pour naviguer
 * dans une liste d'embeds. Auto-désactivation après 120s.
 */

import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from "discord.js";
import logger from "../utils/logger.js";

const TIMEOUT = 120_000;

export async function paginate(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  pages: EmbedBuilder[],
  ephemeral = false,
): Promise<void> {
  if (pages.length === 0) return;
  if (pages.length === 1) {
    if (interaction.isChatInputCommand()) {
      await interaction.reply({ embeds: [pages[0]], ephemeral });
    } else {
      await interaction.update({ embeds: [pages[0]] });
    }
    return;
  }

  let page = 0;

  const getButtons = () =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("page_first")
        .setLabel("⏮")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId("page_prev")
        .setLabel("◀")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId("page_next")
        .setLabel("▶")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === pages.length - 1),
      new ButtonBuilder()
        .setCustomId("page_last")
        .setLabel("⏭")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === pages.length - 1),
    );

  const msg = interaction.isChatInputCommand()
    ? await interaction.reply({
        embeds: [pages[0].setFooter({ text: `Page 1/${pages.length}` })],
        components: [getButtons()],
        ephemeral,
        fetchReply: true,
      })
    : await interaction.editReply({
        embeds: [pages[0].setFooter({ text: `Page 1/${pages.length}` })],
        components: [getButtons()],
      });

  const collector = msg.createMessageComponentCollector({
    filter: (i) => i.user.id === interaction.user.id,
    time: TIMEOUT,
  });

  collector.on("collect", async (btn: ButtonInteraction) => {
    try {
      switch (btn.customId) {
        case "page_first":
          page = 0;
          break;
        case "page_prev":
          page = Math.max(0, page - 1);
          break;
        case "page_next":
          page = Math.min(pages.length - 1, page + 1);
          break;
        case "page_last":
          page = pages.length - 1;
          break;
      }

      await btn.update({
        embeds: [pages[page].setFooter({ text: `Page ${page + 1}/${pages.length}` })],
        components: [getButtons()],
      });
    } catch (error) {
      logger.error("[Pagination] Error:", error);
    }
  });

  collector.on("end", async () => {
    try {
      await msg.edit({ components: [] });
    } catch {
      // message deleted
    }
  });
}
