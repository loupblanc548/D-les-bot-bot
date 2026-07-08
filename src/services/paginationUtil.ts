/**
 * paginationUtil.ts — Embed pagination for Discord
 *
 * Auto-paginate long content into multiple embed pages with navigation buttons.
 */

import {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType,
  ChatInputCommandInteraction,
  Message,
  User,
} from "discord.js";
import logger from "../utils/logger.js";

const ITEMS_PER_PAGE = 10;
const BUTTON_TIMEOUT = 60_000;

export interface PaginationOptions {
  title: string;
  color?: number;
  items: string[];
  itemsPerPage?: number;
  footer?: string;
  ephemeral?: boolean;
}

export async function sendPaginatedEmbed(
  interaction: ChatInputCommandInteraction,
  options: PaginationOptions,
): Promise<void> {
  const { title, color = 0x5865f2, items, itemsPerPage = ITEMS_PER_PAGE, footer, ephemeral = false } = options;

  if (items.length === 0) {
    await interaction.reply({
      embeds: [new EmbedBuilder().setTitle(title).setColor(color).setDescription("Aucun résultat.")],
      ephemeral,
    });
    return;
  }

  const totalPages = Math.ceil(items.length / itemsPerPage);
  let currentPage = 0;

  const buildEmbed = (page: number): EmbedBuilder => {
    const start = page * itemsPerPage;
    const end = Math.min(start + itemsPerPage, items.length);
    const pageItems = items.slice(start, end);

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(color)
      .setDescription(pageItems.map((item, i) => `${start + i + 1}. ${item}`).join("\n"))
      .setFooter({ text: `${footer ? footer + " | " : ""}Page ${page + 1}/${totalPages}` })
      .setTimestamp();

    return embed;
  };

  const buildButtons = (page: number): ActionRowBuilder<ButtonBuilder> => {
    const row = new ActionRowBuilder<ButtonBuilder>();

    row.addComponents(
      new ButtonBuilder()
        .setCustomId("page_first")
        .setLabel("⏮️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId("page_prev")
        .setLabel("◀️")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId("page_next")
        .setLabel("▶️")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === totalPages - 1),
      new ButtonBuilder()
        .setCustomId("page_last")
        .setLabel("⏭️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === totalPages - 1),
    );

    return row;
  };

  // Single page — no buttons needed
  if (totalPages === 1) {
    await interaction.reply({ embeds: [buildEmbed(0)], ephemeral });
    return;
  }

  const message = await interaction.reply({
    embeds: [buildEmbed(0)],
    components: [buildButtons(0)],
    ephemeral,
    fetchReply: true,
  }) as Message;

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: BUTTON_TIMEOUT,
  });

  collector.on("collect", async (btnInteraction) => {
    if (btnInteraction.user.id !== interaction.user.id) {
      await btnInteraction.reply({ content: "❌ Ces boutons ne sont pas pour toi.", ephemeral: true });
      return;
    }

    switch (btnInteraction.customId) {
      case "page_first": currentPage = 0; break;
      case "page_prev": currentPage = Math.max(0, currentPage - 1); break;
      case "page_next": currentPage = Math.min(totalPages - 1, currentPage + 1); break;
      case "page_last": currentPage = totalPages - 1; break;
    }

    await btnInteraction.update({
      embeds: [buildEmbed(currentPage)],
      components: [buildButtons(currentPage)],
    });
  });

  collector.on("end", async () => {
    try {
      await message.edit({ components: [] });
    } catch {
      // Message might be deleted
    }
  });
}

/**
 * Paginate a long text into chunks.
 */
export function paginateText(text: string, chunkSize = 1024): string[] {
  if (text.length <= chunkSize) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= chunkSize) {
      chunks.push(remaining);
      break;
    }

    // Try to break at a newline
    let breakPoint = remaining.lastIndexOf("\n", chunkSize);
    if (breakPoint < chunkSize * 0.5) breakPoint = chunkSize;

    chunks.push(remaining.slice(0, breakPoint));
    remaining = remaining.slice(breakPoint).trimStart();
  }

  return chunks;
}

/**
 * Create a paginated leaderboard from user data.
 */
export async function sendLeaderboard(
  interaction: ChatInputCommandInteraction,
  title: string,
  entries: { userId: string; value: number; label: string }[],
  color = 0xf1c40f,
): Promise<void> {
  const items = entries
    .sort((a, b) => b.value - a.value)
    .map((e, i) => {
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `**${i + 1}.**`;
      return `${medal} <@${e.userId}> — ${e.label}: **${e.value}**`;
    });

  await sendPaginatedEmbed(interaction, {
    title,
    color,
    items,
    itemsPerPage: 10,
    footer: "Classement",
  });
}
