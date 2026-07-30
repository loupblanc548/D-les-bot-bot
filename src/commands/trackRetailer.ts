/**
 * trackRetailer.ts — Commandes slash pour tracker des produits revendeurs
 *
 * Toutes les réponses et alertes vont dans le salon 1532189747500421152.
 * La commande add délègue à Quent (agent IA) via une auto-mention dans le salon.
 * Quent utilise les tools retailer pour rechercher, tracker et répondre intelligemment.
 *
 * Commandes :
 *  /track-retailer add <produit> <revendeur> [pays] [prix-cible] → délègue à Quent
 *  /track-retailer remove <id> → arrête le suivi
 *  /track-retailer list [utilisateur] → liste les produits suivis
 *  /track-retailer search <produit> [revendeur] [pays] → recherche (délègue à Quent)
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  AutocompleteInteraction,
  TextChannel,
} from "discord.js";
import logger from "../utils/logger.js";
import {
  untrackProduct,
  getTrackedProducts,
  getRetailerModule,
} from "../services/retailerAlerts.js";
import {
  RETAILER_NAMES,
  RETAILER_EMOJIS,
} from "../services/retailers/types.js";
import type { RetailerId, CountryCode } from "../services/retailers/types.js";

const RETAILER_ALERT_CHANNEL = "1532189747500421152";

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

  // ── Déléguer à Quent : envoyer un message dans le salon d'alertes
  //    qui mentionne le bot. Le bot traitera sa propre mention (exception
  //    dans messages.ts) et Quent utilisera les tools retailer. ──
  const channel = interaction.client.channels.cache.get(RETAILER_ALERT_CHANNEL) as TextChannel;
  if (!channel?.isTextBased()) {
    await interaction.editReply({
      content: `❌ Salon d'alertes <#${RETAILER_ALERT_CHANNEL}> introuvable. Le bot ne peut pas déléguer à Quent.`,
    });
    return;
  }

  const botId = interaction.client.user!.id;
  const targetInfo = targetPrice ? ` avec un prix cible de ${targetPrice}€` : "";
  const promptForQuent = `<@${botId}> L'utilisateur <@${interaction.user.id}> demande de suivre le produit "${productName}" sur la boutique ${RETAILER_NAMES[retailerId]} (${retailerId}) en ${country}${targetInfo}. ` +
    `Utilise les tools retailer disponibles (searchSingleRetailer puis trackRetailerProduct) pour: ` +
    `1) Rechercher ce produit sur ${retailerId} en ${country} ` +
    `2) Ajouter le meilleur résultat au tracking avec alertes prix/restock/promo ` +
    `3) Répondre avec un résumé clair du produit trouvé et suivi. ` +
    `Réponds en français avec un formatage Discord riche (embed si possible).`;

  try {
    await channel.send(promptForQuent);
    await interaction.editReply({
      content: `✅ Demande envoyée à Quent dans <#${RETAILER_ALERT_CHANNEL}> !\nQuent va rechercher "${productName}" sur ${RETAILER_NAMES[retailerId]} (${country}) et configurer le suivi.\nLes alertes arriveront dans ce salon.`,
    });
    logger.info(`[TrackRetailer] ${interaction.user.tag} a délégué à Quent: track ${productName} sur ${retailerId} (${country})`);
  } catch (err) {
    logger.error(`[TrackRetailer] Erreur envoi prompt à Quent: ${err}`);
    await interaction.editReply({
      content: `❌ Erreur lors de l'envoi de la demande à Quent dans <#${RETAILER_ALERT_CHANNEL}>.`,
    });
  }
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
      { name: "Demandé par", value: `<@${interaction.user.id}>`, inline: true },
    )
    .setFooter(FOOTER)
    .setTimestamp();

  // Envoyer dans le salon d'alertes
  const channel = interaction.client.channels.cache.get(RETAILER_ALERT_CHANNEL) as TextChannel;
  if (channel?.isTextBased()) {
    try {
      await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed] });
    } catch { /* */ }
  }

  await interaction.editReply({
    content: `✅ Suivi arrêté. Confirmation envoyée dans <#${RETAILER_ALERT_CHANNEL}>.`,
    embeds: [embed],
  });
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
      value: `<#${RETAILER_ALERT_CHANNEL}>`,
      inline: false,
    })
    .setFooter(FOOTER)
    .setTimestamp();

  // Envoyer dans le salon d'alertes
  const channel = interaction.client.channels.cache.get(RETAILER_ALERT_CHANNEL) as TextChannel;
  if (channel?.isTextBased()) {
    try {
      await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed] });
    } catch { /* */ }
  }

  await interaction.editReply({
    content: `📋 Liste envoyée dans <#${RETAILER_ALERT_CHANNEL}>.`,
    embeds: [embed],
  });
}

// ─── /track-retailer search ──────────────────────────────────────────────────

async function handleTrackSearch(interaction: ChatInputCommandInteraction): Promise<void> {
  const productName = interaction.options.getString("produit", true).trim();
  const retailerId = interaction.options.getString("revendeur") as RetailerId | null;
  const country = (interaction.options.getString("pays") as CountryCode) || "FR";

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  // ── Déléguer à Quent : envoyer un message dans le salon d'alertes ──
  const channel = interaction.client.channels.cache.get(RETAILER_ALERT_CHANNEL) as TextChannel;
  if (!channel?.isTextBased()) {
    await interaction.editReply({
      content: `❌ Salon d'alertes <#${RETAILER_ALERT_CHANNEL}> introuvable.`,
    });
    return;
  }

  const botId = interaction.client.user!.id;
  const retailerInfo = retailerId
    ? `sur la boutique ${RETAILER_NAMES[retailerId]} (${retailerId})`
    : `sur toutes les boutiques disponibles`;
  const promptForQuent = `<@${botId}> L'utilisateur <@${interaction.user.id}> demande de rechercher le produit "${productName}" ${retailerInfo} en ${country}. ` +
    `Utilise les tools retailer disponibles (searchRetailers ou searchSingleRetailer) pour faire cette recherche. ` +
    `Réponds avec un résumé clair des produits trouvés, triés par prix, avec le meilleur prix mis en avant. ` +
    `Réponds en français avec un formatage Discord riche.`;

  try {
    await channel.send(promptForQuent);
    await interaction.editReply({
      content: `✅ Recherche envoyée à Quent dans <#${RETAILER_ALERT_CHANNEL}> !\nQuent va rechercher "${productName}" ${retailerInfo} en ${country} et répondre dans le salon.`,
    });
    logger.info(`[TrackRetailer] ${interaction.user.tag} a délégué à Quent: search ${productName} ${retailerInfo} (${country})`);
  } catch (err) {
    logger.error(`[TrackRetailer] Erreur envoi prompt à Quent: ${err}`);
    await interaction.editReply({
      content: `❌ Erreur lors de l'envoi de la demande à Quent.`,
    });
  }
}
