/**
 * trackRetailer.ts — Commandes slash pour tracker des produits revendeurs
 *
 * Commandes :
 *  /track-retailer add <produit> <revendeur> [pays] [prix-cible]
 *  /track-retailer remove <id>
 *  /track-retailer list [utilisateur]
 *  /track-retailer search <produit> [revendeur] [pays]
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  AutocompleteInteraction,
} from "discord.js";
import logger from "../utils/logger.js";
import {
  searchAllRetailers,
  searchRetailer,
  trackProduct,
  untrackProduct,
  getTrackedProducts,
  getAvailableRetailers,
  getRetailerModule,
} from "../services/retailerAlerts.js";
import {
  RETAILER_NAMES,
  RETAILER_EMOJIS,
} from "../services/retailers/types.js";
import type { RetailerId, CountryCode } from "../services/retailers/types.js";

const FOOTER = { text: "Retailer Alerts • Suivi de produits" };

const VALID_RETAILERS = Object.keys(RETAILER_NAMES) as RetailerId[];
const VALID_COUNTRIES: CountryCode[] = ["FR", "DE", "BE", "NL", "ES", "IT", "CH", "UK", "US"];

// ─── Définition des commandes Slash ──────────────────────────────────────────

export const commands = [
  new SlashCommandBuilder()
    .setName("track-retailer")
    .setDescription("Suivre des produits sur les boutiques revendeurs")
    .addSubcommand((sc) =>
      sc
        .setName("add")
        .setDescription("Suivre un produit sur une boutique")
        .addStringOption((o) =>
          o
            .setName("produit")
            .setDescription("Nom du produit à suivre")
            .setRequired(true)
            .setMinLength(2)
            .setMaxLength(300),
        )
        .addStringOption((o) =>
          o
            .setName("revendeur")
            .setDescription("Boutique où suivre le produit")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((o) =>
          o
            .setName("pays")
            .setDescription("Code pays (FR, DE, BE, NL, ES, IT, CH, UK, US)")
            .setRequired(false)
            .addChoices(
              { name: "🇫🇷 France", value: "FR" },
              { name: "🇩🇪 Allemagne", value: "DE" },
              { name: "🇧🇪 Belgique", value: "BE" },
              { name: "🇳🇱 Pays-Bas", value: "NL" },
              { name: "🇪🇸 Espagne", value: "ES" },
              { name: "🇮🇹 Italie", value: "IT" },
              { name: "🇨🇭 Suisse", value: "CH" },
              { name: "🇬🇧 UK", value: "UK" },
              { name: "🇺🇸 USA", value: "US" },
            ),
        )
        .addNumberOption((o) =>
          o
            .setName("prix-cible")
            .setDescription("Prix cible pour déclencher une alerte (optionnel)")
            .setRequired(false)
            .setMinValue(0),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("remove")
        .setDescription("Arrêter le suivi d'un produit")
        .addStringOption((o) =>
          o
            .setName("id")
            .setDescription("ID du tracking à supprimer")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("list")
        .setDescription("Lister les produits suivis")
        .addUserOption((o) =>
          o
            .setName("utilisateur")
            .setDescription("Filtrer par utilisateur (optionnel)")
            .setRequired(false),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("search")
        .setDescription("Rechercher un produit sur les boutiques")
        .addStringOption((o) =>
          o
            .setName("produit")
            .setDescription("Nom du produit à rechercher")
            .setRequired(true)
            .setMinLength(2)
            .setMaxLength(300),
        )
        .addStringOption((o) =>
          o
            .setName("revendeur")
            .setDescription("Boutique spécifique (optionnel — sinon toutes)")
            .setRequired(false)
            .setAutocomplete(true),
        )
        .addStringOption((o) =>
          o
            .setName("pays")
            .setDescription("Code pays")
            .setRequired(false)
            .addChoices(
              { name: "🇫🇷 France", value: "FR" },
              { name: "🇩🇪 Allemagne", value: "DE" },
              { name: "🇧🇪 Belgique", value: "BE" },
              { name: "🇳🇱 Pays-Bas", value: "NL" },
              { name: "🇪🇸 Espagne", value: "ES" },
              { name: "🇮🇹 Italie", value: "IT" },
              { name: "🇨🇭 Suisse", value: "CH" },
              { name: "🇬🇧 UK", value: "UK" },
              { name: "🇺🇸 USA", value: "US" },
            ),
        ),
    )
    .toJSON(),
];

// ─── Autocomplete ────────────────────────────────────────────────────────────

export async function handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused(true);
  const focusedValue = focused.value.toLowerCase();

  if (focused.name === "revendeur") {
    const filtered = VALID_RETAILERS
      .filter((r) => RETAILER_NAMES[r].toLowerCase().includes(focusedValue))
      .slice(0, 25)
      .map((r) => ({ name: `${RETAILER_EMOJIS[r]} ${RETAILER_NAMES[r]}`, value: r }));
    await interaction.respond(filtered);
    return;
  }

  if (focused.name === "id") {
    const userFilter = interaction.user.id;
    const tracked = getTrackedProducts(userFilter);
    const filtered = focusedValue
      ? tracked.filter((t) => t.id.includes(focusedValue) || t.title.toLowerCase().includes(focusedValue))
      : tracked;
    await interaction.respond(
      filtered.slice(0, 25).map((t) => ({
        name: `${RETAILER_EMOJIS[t.retailer]} ${t.title.slice(0, 80)}`,
        value: t.id,
      })),
    );
    return;
  }
}

// ─── Handler principal ───────────────────────────────────────────────────────

export async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const action = interaction.options.getSubcommand();

  switch (action) {
    case "add":
      await handleTrackAdd(interaction);
      break;
    case "remove":
      await handleTrackRemove(interaction);
      break;
    case "list":
      await handleTrackList(interaction);
      break;
    case "search":
      await handleTrackSearch(interaction);
      break;
  }
}

// ─── /track-retailer add ─────────────────────────────────────────────────────

async function handleTrackAdd(interaction: ChatInputCommandInteraction): Promise<void> {
  const productName = interaction.options.getString("produit", true).trim();
  const retailerId = interaction.options.getString("revendeur", true) as RetailerId;
  const country = (interaction.options.getString("pays") as CountryCode) || "FR";
  const targetPrice = interaction.options.getNumber("prix-cible") || undefined;

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  // Vérifier que le revendeur existe
  if (!VALID_RETAILERS.includes(retailerId)) {
    await interaction.editReply({
      content: `❌ Revendeur inconnu: **${retailerId}**.\nRevendeurs disponibles: ${VALID_RETAILERS.map((r) => `\`${r}\``).join(", ")}`,
    });
    return;
  }

  const mod = getRetailerModule(retailerId);
  if (!mod) {
    await interaction.editReply({ content: `❌ Module revendeur **${retailerId}** non chargé.` });
    return;
  }

  if (!mod.countries.includes(country)) {
    await interaction.editReply({
      content: `❌ ${RETAILER_NAMES[retailerId]} ne supporte pas le pays **${country}**.\nPays supportés: ${mod.countries.join(", ")}`,
    });
    return;
  }

  // Rechercher le produit sur la boutique
  const products = await searchRetailer(retailerId, productName, country, 5);

  if (products.length === 0) {
    await interaction.editReply({
      content: `❌ Aucun produit trouvé pour **"${productName}"** sur ${RETAILER_NAMES[retailerId]} (${country}).\nEssaie avec un autre nom ou une autre boutique.`,
    });
    return;
  }

  // Prendre le meilleur résultat (premier)
  const best = products[0];
  const trackId = trackProduct(retailerId, country, best.productId, best.title, interaction.user.id, interaction.guildId || "", {
    targetPrice,
    alertOnRestock: true,
    alertOnPriceDrop: true,
    alertOnPromotion: true,
  });

  const emoji = RETAILER_EMOJIS[retailerId] || "🔔";
  const embed = new EmbedBuilder()
    .setTitle(`${emoji} Produit suivi sur ${RETAILER_NAMES[retailerId]}`)
    .setColor(0x2ecc71)
    .setDescription(`**${best.title}**`)
    .addFields(
      { name: "Boutique", value: `${emoji} ${RETAILER_NAMES[retailerId]}`, inline: true },
      { name: "Pays", value: `🇫🇷 ${country}`, inline: true },
      { name: "Prix actuel", value: `${best.price} ${best.currency}`, inline: true },
      { name: "ID de tracking", value: `\`${trackId}\``, inline: false },
      { name: "Stock", value: best.inStock ? "✅ En stock" : "❌ Rupture", inline: true },
      { name: "Prix cible", value: targetPrice ? `${targetPrice}€` : "Non défini", inline: true },
      { name: "Alertes", value: "📉 Prix ↓ • ✅ Restock • 🔥 Promo", inline: false },
    )
    .setURL(best.url)
    .setFooter(FOOTER)
    .setTimestamp();

  if (best.image) {
    try { embed.setThumbnail(best.image); } catch { /* */ }
  }

  await interaction.editReply({
    content: `✅ Produit trouvé et suivi ! Tu recevras des alertes dans <#1532189747500421152>.`,
    embeds: [embed],
  });

  // Réponse intelligente : si d'autres résultats existent, les proposer
  if (products.length > 1) {
    const others = products.slice(1, 4).map((p, i) =>
      `**${i + 2}.** ${p.title} — ${p.price} ${p.currency} ${p.inStock ? "✅" : "❌"}`,
    ).join("\n");

    await interaction.followUp({
      content: `📋 **Autres résultats sur ${RETAILER_NAMES[retailerId]}:**\n${others}\n\n*Utilise \`/track-retailer search\` pour voir tous les détails.*`,
      flags: [MessageFlags.Ephemeral],
    });
  }

  logger.info(`[TrackRetailer] ${interaction.user.tag} track ${best.title} sur ${retailerId} (${country})`);
}

// ─── /track-retailer remove ──────────────────────────────────────────────────

async function handleTrackRemove(interaction: ChatInputCommandInteraction): Promise<void> {
  const trackId = interaction.options.getString("id", true).trim();
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const tracked = getTrackedProducts(interaction.user.id);
  const found = tracked.find((t) => t.id === trackId);

  if (!found) {
    await interaction.editReply({
      content: `❌ Tracking introuvable ou tu n'es pas le propriétaire.\nUtilise \`/track-retailer list\` pour voir tes produits suivis.`,
    });
    return;
  }

  const removed = untrackProduct(trackId);
  if (!removed) {
    await interaction.editReply({ content: "❌ Erreur lors de la suppression du tracking." });
    return;
  }

  const emoji = RETAILER_EMOJIS[found.retailer] || "🔔";
  const embed = new EmbedBuilder()
    .setTitle(`${emoji} Suivi arrêté`)
    .setColor(0xff4444)
    .setDescription(`**${found.title}** ne sera plus suivi sur ${RETAILER_NAMES[found.retailer]} (${found.country}).`)
    .addFields(
      { name: "Boutique", value: RETAILER_NAMES[found.retailer], inline: true },
      { name: "Dernier prix", value: `${found.lastPrice}€`, inline: true },
    )
    .setFooter(FOOTER)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
  logger.info(`[TrackRetailer] ${interaction.user.tag} a retiré le tracking ${trackId}`);
}

// ─── /track-retailer list ────────────────────────────────────────────────────

async function handleTrackList(interaction: ChatInputCommandInteraction): Promise<void> {
  const userFilter = interaction.options.getUser("utilisateur");
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const tracked = getTrackedProducts(userFilter?.id);

  if (tracked.length === 0) {
    await interaction.editReply({
      content: `📭 Aucun produit suivi${userFilter ? ` pour <@${userFilter.id}>` : ""}.\nUtilise \`/track-retailer add\` pour commencer !`,
    });
    return;
  }

  const lines = tracked.map((t) => {
    const emoji = RETAILER_EMOJIS[t.retailer] || "🔔";
    const status = t.lastPrice > 0 ? `${t.lastPrice}€` : "En attente";
    const target = t.targetPrice ? ` → cible: ${t.targetPrice}€` : "";
    return `${emoji} **${t.title}** — ${RETAILER_NAMES[t.retailer]} (${t.country}) | ${status}${target}\n   ID: \`${t.id}\``;
  });

  const description = lines.join("\n\n");
  const embed = new EmbedBuilder()
    .setTitle(`📋 Produits suivis (${tracked.length})`)
    .setColor(0x3498db)
    .setDescription(description.length > 4096 ? description.slice(0, 4093) + "..." : description)
    .addFields({
      name: "Salon d'alertes",
      value: `<#1532189747500421152>`,
      inline: false,
    })
    .setFooter(FOOTER)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ─── /track-retailer search ──────────────────────────────────────────────────

async function handleTrackSearch(interaction: ChatInputCommandInteraction): Promise<void> {
  const productName = interaction.options.getString("produit", true).trim();
  const retailerId = interaction.options.getString("revendeur") as RetailerId | null;
  const country = (interaction.options.getString("pays") as CountryCode) || "FR";

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  let products;
  let searchScope: string;

  if (retailerId) {
    products = await searchRetailer(retailerId, productName, country, 10);
    searchScope = `${RETAILER_NAMES[retailerId]} (${country})`;
  } else {
    products = await searchAllRetailers(productName, { countries: [country], limit: 3, inStockOnly: false });
    searchScope = `toutes les boutiques (${country})`;
  }

  if (products.length === 0) {
    await interaction.editReply({
      content: `❌ Aucun produit trouvé pour **"${productName}"** sur ${searchScope}.\nEssaie un autre nom ou une autre boutique.`,
    });
    return;
  }

  // Trier par prix
  products.sort((a, b) => a.price - b.price);

  const lines = products.slice(0, 10).map((p, i) => {
    const emoji = RETAILER_EMOJIS[p.retailer] || "🏷️";
    const stock = p.inStock ? "✅" : "❌";
    const discount = p.discountPercent ? ` (-${p.discountPercent}%)` : "";
    const original = p.originalPrice ? ` ~~${p.originalPrice}€~~` : "";
    return `${i + 1}. ${emoji} **${p.title}**\n   ${RETAILER_NAMES[p.retailer]} (${p.country}) — ${p.price} ${p.currency}${original}${discount} ${stock}`;
  }).join("\n\n");

  const cheapest = products[0];
  const cheapestEmoji = RETAILER_EMOJIS[cheapest.retailer] || "🏷️";

  const embed = new EmbedBuilder()
    .setTitle(`🔍 Résultats pour "${productName}"`)
    .setColor(0xf39c12)
    .setDescription(lines)
    .addFields(
      { name: "Recherche", value: searchScope, inline: true },
      { name: "Résultats", value: `${products.length} produit(s)`, inline: true },
      { name: "Meilleur prix", value: `${cheapestEmoji} ${RETAILER_NAMES[cheapest.retailer]} — ${cheapest.price} ${cheapest.currency}`, inline: true },
    )
    .setFooter({ text: `Retailer Alerts • Utilise /track-retailer add pour suivre un produit` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
  logger.info(`[TrackRetailer] ${interaction.user.tag} a recherché "${productName}" sur ${searchScope}`);
}
