import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  Client,
  TextChannel,
  ChannelType,
} from "discord.js";
import logger from "../../utils/logger.js";
import { config } from "../../config.js";

// ─── Types pour parser l'API Fortnite v2 ─────────────────────────────

interface FortniteApiItem {
  id?: string;
  name?: string;
  displayName?: string;
  description?: string;
  type?: { value?: string; displayValue?: string };
  rarity?: { value?: string; displayValue?: string };
  images?: {
    icon?: string;
    featured?: string;
    smallIcon?: string;
    other?: { url?: string }[];
  };
}

interface FortniteShopEntry {
  offerId: string;
  devName?: string;
  new?: boolean;
  expiry?: string;
  section?: { id: string; name: string };
  bundle?: { name?: string; description?: string; images?: { icon?: string } };
  items?: FortniteApiItem[];
  brItems?: FortniteApiItem[];
  price?: { regularPrice?: number; finalPrice?: number };
  images?: { icon?: string; featured?: string };
}

interface FortniteShopApiResponse {
  status: number;
  data: {
    hash?: string;
    date?: string;
    vacantSlots?: number;
    entries?: FortniteShopEntry[];
  };
}

// ─── Types internes normalisés ───────────────────────────────────────

interface BoutiqueItem {
  name: string;
  description: string;
  type: string;
  rarity: string;
  price: number;
  icon: string;
  featuredImage: string | null;
  sectionId: string;
  sectionName: string;
  isNew: boolean;
  expiry: Date | null;
  isBundle: boolean;
  bundleNames: string[];
}

interface BoutiqueData {
  date: string;
  items: BoutiqueItem[];
  shopImage: string | null;
  nextReset: Date | null;
}

// ─── Fetch : récupération et parsing ─────────────────────────────────

const SHOP_API_URL = "https://fortnite-api.com/v2/shop/br?language=fr";

// Cache 15 minutes
let cachedData: BoutiqueData | null = null;
let cachedAt = 0;
const CACHE_TTL = 15 * 60 * 1000;

// RARITY_COLORS et getRarityColor réservés pour usage futur dans les embeds
const RARITY_COLORS: Record<string, number> = {
  common: 0xb0b0b0,
  uncommon: 0x00cc00,
  rare: 0x0099ff,
  epic: 0x9933ff,
  legendary: 0xff6600,
  mythic: 0xffcc00,
  icon: 0x00ffff,
  marvel: 0xff0000,
  dc: 0x3366ff,
  "star wars": 0xffff00,
  frozen: 0x66ccff,
  lava: 0xff4400,
  shadow: 0x333333,
  slurp: 0x00ffcc,
};

function getRarityColor(rarity: string): number {
  return RARITY_COLORS[rarity.toLowerCase()] || 0x9b59b6;
}

function extractItemNames(entry: FortniteShopEntry): string[] {
  const names: string[] = [];
  if (entry.bundle?.name) names.push(entry.bundle.name);
  const items = entry.items || entry.brItems || [];
  for (const item of items) {
    const n = item.displayName || item.name;
    if (n) names.push(n);
  }
  return names;
}

export async function fetchBoutique(): Promise<BoutiqueData | null> {
  if (cachedData && Date.now() - cachedAt < CACHE_TTL) {
    return cachedData;
  }

  try {
    logger.info("[Boutique] Récupération de la boutique FR...");
    const res = await fetch(SHOP_API_URL, {
      headers: { "User-Agent": "DiscordBot/1.0" },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      logger.warn(`[Boutique] HTTP ${res.status} — API indisponible`);
      return null;
    }

    const json = (await res.json()) as FortniteShopApiResponse;
    if (json.status !== 200 || !json.data?.entries) {
      logger.warn("[Boutique] Réponse API invalide");
      return null;
    }

    const entries = json.data.entries;
    const items: BoutiqueItem[] = [];
    let shopImage: string | null = null;

    // Détecter la date du prochain reset (premier expiry trouvé)
    let nextReset: Date | null = null;

    for (const entry of entries) {
      const sectionId = (entry.section?.id || "").toLowerCase();
      const sectionName = entry.section?.name || "Autre";
      const isBundle = !!entry.bundle;
      const bundleNames = extractItemNames(entry);
      const isNew = entry.new === true;
      const expiry = entry.expiry ? new Date(entry.expiry) : null;

      if (expiry && (!nextReset || expiry < nextReset)) {
        nextReset = expiry;
      }

      // Image principale du bundle ou de l'entrée
      const entryFeaturedImage = entry.images?.featured || entry.bundle?.images?.icon || null;
      const entryIcon = entry.images?.icon || entry.bundle?.images?.icon || "";

      // Garder la première image featured pour l'embed global
      if (!shopImage && entryFeaturedImage) {
        shopImage = entryFeaturedImage;
      }

      const itemList = entry.items || entry.brItems || [];

      if (itemList.length === 0 && bundleNames.length > 0) {
        // Entrée sans sous-items mais avec un nom
        items.push({
          name: bundleNames[0],
          description: entry.bundle?.description || "",
          type: "",
          rarity: "",
          price: entry.price?.finalPrice || entry.price?.regularPrice || 0,
          icon: entryIcon,
          featuredImage: entryFeaturedImage,
          sectionId,
          sectionName,
          isNew,
          expiry,
          isBundle,
          bundleNames,
        });
        continue;
      }

      for (const item of itemList) {
        const itemName = item.displayName || item.name || "";
        if (!itemName) continue;

        items.push({
          name: itemName,
          description: item.description || "",
          type: item.type?.displayValue || "",
          rarity: item.rarity?.displayValue || "",
          price: entry.price?.finalPrice || entry.price?.regularPrice || 0,
          icon: item.images?.icon || entryIcon,
          featuredImage: item.images?.featured || entryFeaturedImage,
          sectionId,
          sectionName,
          isNew,
          expiry,
          isBundle,
          bundleNames,
        });
      }
    }

    const result: BoutiqueData = {
      date: json.data.date || new Date().toISOString().split("T")[0],
      items,
      shopImage,
      nextReset,
    };

    cachedData = result;
    cachedAt = Date.now();

    logger.info(
      `[Boutique] ${items.length} items récupérés — ${items.filter((i) => i.isNew).length} nouveautés, reset: ${nextReset?.toISOString() || "?"}`,
    );

    return result;
  } catch (err) {
    logger.error("[Boutique] Erreur fetch:", String(err));
    return null;
  }
}

// ─── Construction des Embeds ─────────────────────────────────────────

const SECTION_EMOJIS: Record<string, string> = {
  featured: "⭐",
  daily: "📅",
  specialfeatured: "✨",
  specialdaily: "🔄",
  news: "🆕",
  bestsellers: "🔥",
  specialoffers: "🎁",
  battlepass: "🎯",
  icons: "👤",
  gaminglegends: "🎮",
  lego: "🧱",
  anima: "🌸",
};

function getSectionEmoji(sectionId: string): string {
  return SECTION_EMOJIS[sectionId] || "📦";
}

function formatPrice(price: number): string {
  if (price === 0) return "Gratuit";
  return `${price} V-Bucks`;
}

function formatExpiry(expiry: Date | null): string {
  if (!expiry) return "";
  const ts = Math.floor(expiry.getTime() / 1000);
  return ` <t:${ts}:R>`;
}

function buildOverviewEmbed(data: BoutiqueData): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`🛒 Boutique Fortnite — ${data.date}`)
    .setColor(0x9b59b6)
    .setTimestamp();

  // Description avec compte à rebours du reset
  let desc = `**${data.items.length} articles** disponibles.\n`;
  if (data.nextReset) {
    const ts = Math.floor(data.nextReset.getTime() / 1000);
    desc += `⏰ **Reset de la boutique** : <t:${ts}:R> (<t:${ts}:f>)\n`;
  }

  const newCount = data.items.filter((i) => i.isNew).length;
  if (newCount > 0) {
    desc += `🆕 **${newCount} nouveauté(s)** dans la boutique !\n`;
  }

  embed.setDescription(desc);

  // Image principale de la boutique
  if (data.shopImage) {
    embed.setImage(data.shopImage);
  }

  // Grouper par section pour un résumé
  const sectionCounts = new Map<string, { name: string; count: number; emoji: string }>();
  for (const item of data.items) {
    const existing = sectionCounts.get(item.sectionId);
    if (existing) {
      existing.count++;
    } else {
      sectionCounts.set(item.sectionId, {
        name: item.sectionName,
        count: 1,
        emoji: getSectionEmoji(item.sectionId),
      });
    }
  }

  const sectionLines: string[] = [];
  for (const [, info] of sectionCounts) {
    sectionLines.push(`${info.emoji} **${info.name}** — ${info.count} article(s)`);
  }
  if (sectionLines.length > 0) {
    embed.addFields({
      name: "📋 Sections",
      value: sectionLines.join("\n"),
      inline: false,
    });
  }

  embed.setFooter({ text: "Boutique Fortnite FR • fortnite-api.com" });
  return embed;
}

function buildSectionEmbed(
  sectionName: string,
  sectionId: string,
  items: BoutiqueItem[],
  date: string,
  nextReset: Date | null,
): EmbedBuilder {
  const emoji = getSectionEmoji(sectionId);
  const embed = new EmbedBuilder()
    .setTitle(`${emoji} ${sectionName} — ${date}`)
    .setColor(0x9b59b6)
    .setTimestamp();

  if (items.length === 0) {
    embed.setDescription("Aucun article dans cette section.");
    return embed;
  }

  // Limiter à 25 fields (limite Discord)
  const maxItems = Math.min(items.length, 24);
  const lines: string[] = [];

  for (let i = 0; i < maxItems; i++) {
    const item = items[i];
    const newBadge = item.isNew ? "🆕 " : "";
    const packBadge = item.isBundle ? "📦 " : "";
    const rarity = item.rarity ? ` • ${item.rarity}` : "";
    const price = ` • ${formatPrice(item.price)}`;
    const expiryStr = formatExpiry(item.expiry);

    lines.push(`**${i + 1}.** ${newBadge}${packBadge}${item.name}${rarity}${price}${expiryStr}`);
  }

  if (items.length > maxItems) {
    lines.push(`\n*...et ${items.length - maxItems} autres articles*`);
  }

  embed.setDescription(lines.join("\n"));

  // Image du premier article avec featured image
  const firstWithImage = items.find((i) => i.featuredImage);
  if (firstWithImage?.featuredImage) {
    embed.setImage(firstWithImage.featuredImage);
  } else if (items[0]?.icon) {
    embed.setThumbnail(items[0].icon);
  }

  // Reset info
  if (nextReset) {
    const ts = Math.floor(nextReset.getTime() / 1000);
    embed.addFields({
      name: "⏰ Prochain reset",
      value: `<t:${ts}:R>`,
      inline: false,
    });
  }

  embed.setFooter({ text: `${items.length} articles • ${sectionName} • fortnite-api.com` });
  return embed;
}

function buildNewItemsEmbed(items: BoutiqueItem[], date: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`🆕 Nouveautés — ${date}`)
    .setColor(0x00ff00)
    .setTimestamp();

  if (items.length === 0) {
    embed.setDescription("Aucune nouveauté dans la boutique d'aujourd'hui.");
    return embed;
  }

  const maxItems = Math.min(items.length, 24);
  const lines: string[] = [];

  for (let i = 0; i < maxItems; i++) {
    const item = items[i];
    const packBadge = item.isBundle ? "📦 " : "";
    const rarity = item.rarity ? ` • ${item.rarity}` : "";
    const price = ` • ${formatPrice(item.price)}`;
    const expiryStr = formatExpiry(item.expiry);

    lines.push(`**${i + 1}.** ${packBadge}${item.name}${rarity}${price}${expiryStr}`);
  }

  if (items.length > maxItems) {
    lines.push(`\n*...et ${items.length - maxItems} autres nouveautés*`);
  }

  embed.setDescription(lines.join("\n"));

  const firstWithImage = items.find((i) => i.featuredImage);
  if (firstWithImage?.featuredImage) {
    embed.setImage(firstWithImage.featuredImage);
  } else if (items[0]?.icon) {
    embed.setThumbnail(items[0].icon);
  }

  embed.setFooter({ text: `${items.length} nouveautés • fortnite-api.com` });
  return embed;
}

function buildExpiringEmbed(items: BoutiqueItem[], date: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`⏰ Bientôt retirés — ${date}`)
    .setColor(0xff6600)
    .setTimestamp();

  if (items.length === 0) {
    embed.setDescription("Aucun article ne part au prochain reset.");
    return embed;
  }

  // Trier par expiry croissant (les plus proches du départ en premier)
  const sorted = [...items].sort((a, b) => {
    if (!a.expiry) return 1;
    if (!b.expiry) return -1;
    return a.expiry.getTime() - b.expiry.getTime();
  });

  const maxItems = Math.min(sorted.length, 24);
  const lines: string[] = [];

  for (let i = 0; i < maxItems; i++) {
    const item = sorted[i];
    const packBadge = item.isBundle ? "📦 " : "";
    const rarity = item.rarity ? ` • ${item.rarity}` : "";
    const price = ` • ${formatPrice(item.price)}`;
    const expiryStr = formatExpiry(item.expiry);

    lines.push(`**${i + 1}.** ${packBadge}${item.name}${rarity}${price}${expiryStr}`);
  }

  if (sorted.length > maxItems) {
    lines.push(`\n*...et ${sorted.length - maxItems} autres articles*`);
  }

  embed.setDescription(lines.join("\n"));

  const firstWithImage = sorted.find((i) => i.featuredImage);
  if (firstWithImage?.featuredImage) {
    embed.setImage(firstWithImage.featuredImage);
  } else if (sorted[0]?.icon) {
    embed.setThumbnail(sorted[0].icon);
  }

  embed.setFooter({ text: `${sorted.length} articles bientôt retirés • fortnite-api.com` });
  return embed;
}

// ─── Commande Slash ──────────────────────────────────────────────────

export const commands = [
  new SlashCommandBuilder()
    .setName("boutique")
    .setDescription("Affiche la boutique Fortnite du jour en français")
    .addStringOption((opt) =>
      opt
        .setName("section")
        .setDescription("Section à afficher (tout par défaut)")
        .setRequired(false)
        .addChoices(
          { name: "📦 Vue d'ensemble", value: "overview" },
          { name: "🆕 Nouveautés", value: "new" },
          { name: "⏰ Bientôt retirés", value: "expiring" },
          { name: "⭐ En vedette", value: "featured" },
          { name: "📅 Quotidien", value: "daily" },
          { name: "✨ Special Featured", value: "specialfeatured" },
          { name: "🔄 Special Daily", value: "specialdaily" },
        ),
    )
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction, client?: Client) {
  await interaction.deferReply();

  try {
    const data = await fetchBoutique();
    if (!data) {
      await interaction.editReply({
        content: "❌ Impossible de récupérer la boutique Fortnite (API indisponible).",
      });
      return;
    }

    if (data.items.length === 0) {
      await interaction.editReply({ content: "📄 La boutique est vide aujourd'hui." });
      return;
    }

    const section = interaction.options.getString("section") || "overview";

    // Construire les embeds selon la section
    let embeds: EmbedBuilder[] = [];

    // ─── Vue d'ensemble : overview + nouveautés + bientôt retirés ───
    if (section === "overview") {
      embeds = [buildOverviewEmbed(data)];

      const newItems = data.items.filter((i) => i.isNew);
      if (newItems.length > 0) {
        embeds.push(buildNewItemsEmbed(newItems, data.date));
      }

      const now = Date.now();
      const expiringItems = data.items.filter(
        (i) => i.expiry && i.expiry.getTime() - now < 24 * 60 * 60 * 1000,
      );
      if (expiringItems.length > 0) {
        embeds.push(buildExpiringEmbed(expiringItems, data.date));
      }
    } else if (section === "new") {
      const newItems = data.items.filter((i) => i.isNew);
      embeds = [buildNewItemsEmbed(newItems, data.date)];
    } else if (section === "expiring") {
      const now = Date.now();
      const expiringItems = data.items.filter(
        (i) => i.expiry && i.expiry.getTime() - now < 24 * 60 * 60 * 1000,
      );
      embeds = [buildExpiringEmbed(expiringItems, data.date)];
    } else {
      const sectionItems = data.items.filter((i) => i.sectionId === section);
      const sectionName = sectionItems[0]?.sectionName || section;
      embeds = [buildSectionEmbed(sectionName, section, sectionItems, data.date, data.nextReset)];
    }

    // Discord limite à 10 embeds par message
    const finalEmbeds = embeds.slice(0, 10);

    // 1. Répondre à l'interaction
    await interaction.editReply({ embeds: finalEmbeds });

    // 2. Envoyer aussi dans le salon boutique configuré
    if (client && config.boutiqueChannel) {
      try {
        const channel = await client.channels.fetch(config.boutiqueChannel).catch(() => null);
        if (channel && channel.type === ChannelType.GuildText) {
          await (channel as TextChannel).send({ embeds: finalEmbeds });
          logger.info(`[Boutique] Embeds envoyés dans le salon ${config.boutiqueChannel}`);
        } else {
          logger.warn(`[Boutique] Salon ${config.boutiqueChannel} inaccessible ou non textuel`);
        }
      } catch (err) {
        logger.error(`[Boutique] Erreur envoi salon:`, String(err));
      }
    }
  } catch (err) {
    logger.error("[Boutique] Erreur:", String(err));
    await interaction.editReply({
      content: "❌ Une erreur est survenue lors de la récupération de la boutique.",
    });
    void err;
  }
}
