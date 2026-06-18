import logger from "../../utils/logger.js";
import {
  MessageFlags,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
  } from "discord.js";
import { fetchShop, ShopEntry } from "../../services/fortnite-api.js";

const ITEMS_PER_PAGE = 8;
const SECTION_LABELS: Record<string, string> = {
  all: "📦 Toute la boutique",
  featured: "⭐ Featured",
  daily: "📅 Daily",
  specialFeatured: "✨ Special Featured",
  specialDaily: "🔄 Special Daily",
};

export const commands = [
  new SlashCommandBuilder()
    .setName("shop")
    .setDescription("Affiche la boutique Fortnite du jour")
    .addStringOption((opt) =>
      opt
        .setName("section")
        .setDescription("Section de la boutique à afficher")
        .addChoices(
          { name: "Toute la boutique", value: "all" },
          { name: "Featured", value: "featured" },
          { name: "Daily", value: "daily" },
          { name: "Special Featured", value: "specialFeatured" },
          { name: "Special Daily", value: "specialDaily" },
        )
    )
    .toJSON(),
];

function buildPage(
  allItems: ShopEntry[],
  page: number,
  totalPages: number,
  date: string,
  sectionLabel: string,
): EmbedBuilder {
  const start = page * ITEMS_PER_PAGE;
  const slice = allItems.slice(start, start + ITEMS_PER_PAGE);

  const embed = new EmbedBuilder()
    .setTitle(`🛒 Boutique Fortnite — ${date}`)
    .setColor(0x9b59b6)
    .setTimestamp();

  if (slice.length === 0) {
    embed.setDescription("Aucun objet dans cette section.");
    return embed;
  }

  const lines: string[] = [];
  for (let i = 0; i < slice.length; i++) {
    const item = slice[i];
    const idx = start + i + 1;
    const rarity = item.rarity ? ` • ${item.rarity}` : "";
    const price = item.price ? ` • ${item.price} V-Bucks` : "";
    const packBadge = item.allNames.length > 1 ? " 📦" : "";
    lines.push(`**${idx}.** ${item.displayName}${rarity}${price}${packBadge}`);
  }
  embed.setDescription(lines.join("\n"));

  // Image du premier objet de la page
  const first = slice[0];
  if (first.featuredImage || first.icon) {
    embed.setThumbnail(first.featuredImage || first.icon);
  }

  embed.setFooter({
    text: `Page ${page + 1}/${totalPages} • ${allItems.length} objets • ${sectionLabel} • fortnite-api.com`,
  });
  return embed;
}

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  try {
    const shop = await fetchShop();
    if (!shop) {
      await interaction.editReply({
        content: "❌ Impossible de récupérer la boutique Fortnite (API indisponible).",
      });
      return;
    }

    const sectionFilter = interaction.options.getString("section") || "all";

    const sectionMap: Record<string, ShopEntry[]> = {
      all: [...shop.featured, ...shop.daily, ...shop.specialFeatured, ...shop.specialDaily],
      featured: shop.featured,
      daily: shop.daily,
      specialFeatured: shop.specialFeatured,
      specialDaily: shop.specialDaily,
    };

    const allItems = sectionMap[sectionFilter] || sectionMap.all;

    if (allItems.length === 0) {
      await interaction.editReply({ content: "📄 La boutique est vide aujourd'hui." });
      return;
    }

    const totalPages = Math.ceil(allItems.length / ITEMS_PER_PAGE);
    let currentPage = 0;
    const sectionLabel = SECTION_LABELS[sectionFilter] || SECTION_LABELS.all;

    const embed = buildPage(allItems, currentPage, totalPages, shop.date, sectionLabel);

    // Si une seule page → pas de pagination
    if (totalPages <= 1) {
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Pagination avec boutons Prev/Next
    const prevBtn = new ButtonBuilder()
      .setCustomId("shop_prev")
      .setLabel("◀")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true);

    const nextBtn = new ButtonBuilder()
      .setCustomId("shop_next")
      .setLabel("▶")
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(prevBtn, nextBtn);

    const reply = await interaction.editReply({
      embeds: [embed],
      components: [row],
    });

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120_000,
    });

    collector.on("collect", async (btn) => {
      if (btn.user.id !== interaction.user.id) {
        await btn.reply({
          content: "❌ Seul l'auteur de la commande peut naviguer.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      if (btn.customId === "shop_prev") currentPage--;
      if (btn.customId === "shop_next") currentPage++;

      const newEmbed = buildPage(allItems, currentPage, totalPages, shop.date, sectionLabel);

      // Réutilise les boutons, change juste le disabled
      prevBtn.setDisabled(currentPage === 0);
      nextBtn.setDisabled(currentPage >= totalPages - 1);

      const updatedRow = new ActionRowBuilder<ButtonBuilder>().addComponents(prevBtn, nextBtn);

      await btn.update({ embeds: [newEmbed], components: [updatedRow] });
    });

    collector.on("end", async () => {
      prevBtn.setDisabled(true).setStyle(ButtonStyle.Secondary);
      nextBtn.setDisabled(true).setStyle(ButtonStyle.Secondary);

      const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(prevBtn, nextBtn);
      await reply.edit({ components: [disabledRow] }).catch((err) => { logger.error("[Shop] Erreur edit reply:", String(err)) });
    });
  } catch (err) {
    logger.error("[Shop] Erreur:", String(err));
    await interaction.editReply({ content: "❌ Une erreur est survenue." }).catch((err) => { logger.error("[Shop] Erreur edit reply:", String(err)) });
  }
}
