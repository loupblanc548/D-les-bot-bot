import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  Client,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import logger from "../../utils/logger.js";
import { oneLineEmbedTitle } from "../../utils/embedLayout.js";

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

export interface BoutiqueItem {
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

export interface BoutiqueData {
  date: string;
  items: BoutiqueItem[];
  shopImage: string | null;
  nextReset: Date | null;
}

// ─── Fetch : récupération et parsing ─────────────────────────────────

const SHOP_API_URLS = [
  "https://fortnite-api.com/v2/shop?language=fr",
  "https://fortnite-api.com/v2/shop/br?language=fr",
];

// Cache 15 minutes
let cachedData: BoutiqueData | null = null;
let cachedAt = 0;
const CACHE_TTL = 15 * 60 * 1000;

export function invalidateBoutiqueCache(): void {
  cachedData = null;
  cachedAt = 0;
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
    let json: FortniteShopApiResponse | null = null;
    for (const url of SHOP_API_URLS) {
      const res = await fetch(url, {
        headers: { "User-Agent": "JohnBot/1.0 (fortnite-shop)" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        logger.warn(`[Boutique] HTTP ${res.status} sur ${url}`);
        continue;
      }
      json = (await res.json()) as FortniteShopApiResponse;
      break;
    }
    if (!json) {
      logger.warn("[Boutique] API indisponible");
      return null;
    }
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

const FORTNITE_PURPLE = 0x9d4edd;
const NEW_GREEN = 0x2ecc71;
const LEAVING_ORANGE = 0xe67e22;
const SHOP_URL = "https://www.fortnite.com/item-shop";
const SHOP_GALLERY_URL = "https://fortnite.gg/shop";
const GRID_CAP = 9;

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

export function formatShopDate(iso: string): string {
  const raw = String(iso || "").slice(0, 10);
  const d = new Date(`${raw}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return iso || "Boutique";
  const formatted = d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function formatVbucks(price: number): string {
  if (!price || price <= 0) return "Gratuit";
  return `${String(price).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} VB`;
}

export function uniqueBoutiqueItems(items: BoutiqueItem[]): BoutiqueItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.name.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function unixTs(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function itemFieldName(item: BoutiqueItem): string {
  const prefix = item.isBundle ? "📦 " : "";
  return oneLineEmbedTitle(`${prefix}${item.name}`, 40);
}

function itemFieldValue(item: BoutiqueItem, extra = ""): string {
  const bits = [item.type, item.rarity, `**${formatVbucks(item.price)}**`].filter(
    (bit) => bit && bit !== "** **",
  );
  if (extra) bits.push(extra);
  return bits.join(" · ") || "—";
}

function setCatalogThumbnail(embed: EmbedBuilder, items: BoutiqueItem[]): void {
  const withIcon = items.find((i) => i.icon);
  if (withIcon?.icon) embed.setThumbnail(withIcon.icon);
}

function addItemGrid(
  embed: EmbedBuilder,
  items: BoutiqueItem[],
  extra?: (item: BoutiqueItem) => string,
): number {
  const unique = uniqueBoutiqueItems(items);
  const shown = unique.slice(0, GRID_CAP);
  for (const item of shown) {
    embed.addFields({
      name: itemFieldName(item),
      value: itemFieldValue(item, extra?.(item) ?? ""),
      inline: true,
    });
  }
  if (unique.length > shown.length) {
    embed.addFields({
      name: "\u200b",
      value: `*+ ${unique.length - shown.length} autres*`,
      inline: false,
    });
  }
  return unique.length;
}

function buildOverviewEmbed(data: BoutiqueData): EmbedBuilder {
  const unique = uniqueBoutiqueItems(data.items);
  const newCount = unique.filter((i) => i.isNew).length;
  const dateLabel = formatShopDate(data.date);

  const embed = new EmbedBuilder()
    .setAuthor({ name: "Boutique Fortnite" })
    .setTitle(oneLineEmbedTitle(dateLabel, 90))
    .setURL(SHOP_GALLERY_URL)
    .setColor(FORTNITE_PURPLE)
    .setDescription("Nouvelle rotation du jour.")
    .setTimestamp();

  embed.addFields(
    { name: "Articles", value: `**${unique.length}**`, inline: true },
    { name: "Nouveautés", value: `**${newCount}**`, inline: true },
    {
      name: "Reset",
      value: data.nextReset ? `<t:${unixTs(data.nextReset)}:R>` : "02:00 Paris",
      inline: true,
    },
  );

  const sectionSeen = new Map<string, { name: string; emoji: string }>();
  for (const item of unique) {
    if (!sectionSeen.has(item.sectionId)) {
      sectionSeen.set(item.sectionId, {
        name: item.sectionName,
        emoji: getSectionEmoji(item.sectionId),
      });
    }
  }
  const chips = [...sectionSeen.values()]
    .slice(0, 8)
    .map((s) => `${s.emoji} ${s.name}`)
    .join("  ·  ");
  if (chips) {
    embed.addFields({ name: "Rayons", value: chips, inline: false });
  }

  setCatalogThumbnail(embed, unique.filter((i) => i.isNew).concat(unique));
  embed.setFooter({ text: "Reset tous les jours à 02:00 (Paris)" });
  return embed;
}

function buildSectionEmbed(
  sectionName: string,
  sectionId: string,
  items: BoutiqueItem[],
  _date: string,
  nextReset: Date | null,
): EmbedBuilder {
  const emoji = getSectionEmoji(sectionId);
  const unique = uniqueBoutiqueItems(items);
  const embed = new EmbedBuilder()
    .setTitle(oneLineEmbedTitle(`${emoji} ${sectionName}`, 90))
    .setURL(SHOP_GALLERY_URL)
    .setColor(FORTNITE_PURPLE)
    .setTimestamp();

  if (unique.length === 0) {
    embed.setDescription("Aucun article dans cette section.");
    return embed;
  }

  embed.setDescription(`${unique.length} article${unique.length > 1 ? "s" : ""}`);
  addItemGrid(embed, unique);
  setCatalogThumbnail(embed, unique);

  if (nextReset) {
    embed.addFields({
      name: "Reset",
      value: `<t:${unixTs(nextReset)}:R>`,
      inline: true,
    });
  }

  embed.setFooter({ text: `${unique.length} articles · ${sectionName}` });
  return embed;
}

function buildNewItemsEmbed(items: BoutiqueItem[]): EmbedBuilder {
  const unique = uniqueBoutiqueItems(items);
  const embed = new EmbedBuilder()
    .setTitle("🆕 Nouveautés")
    .setURL(SHOP_GALLERY_URL)
    .setColor(NEW_GREEN)
    .setTimestamp();

  if (unique.length === 0) {
    embed.setDescription("Aucune nouveauté dans la boutique d'aujourd'hui.");
    return embed;
  }

  embed.setDescription(
    unique.length > GRID_CAP
      ? `${GRID_CAP} affichées · ${unique.length} au total`
      : `${unique.length} arrivée${unique.length > 1 ? "s" : ""} aujourd'hui`,
  );
  addItemGrid(embed, unique);
  setCatalogThumbnail(embed, unique);
  embed.setFooter({ text: `${unique.length} nouveautés` });
  return embed;
}

function buildExpiringEmbed(items: BoutiqueItem[]): EmbedBuilder {
  const unique = uniqueBoutiqueItems(items);
  const embed = new EmbedBuilder()
    .setTitle("⏰ Bientôt retirés")
    .setURL(SHOP_GALLERY_URL)
    .setColor(LEAVING_ORANGE)
    .setTimestamp();

  if (unique.length === 0) {
    embed.setDescription("Aucun article ne part au prochain reset.");
    return embed;
  }

  const sorted = [...unique].sort((a, b) => {
    if (!a.expiry) return 1;
    if (!b.expiry) return -1;
    return a.expiry.getTime() - b.expiry.getTime();
  });

  embed.setDescription(
    sorted.length > GRID_CAP
      ? `${GRID_CAP} affichés · ${sorted.length} au total`
      : "Ils quittent la boutique au prochain reset.",
  );
  addItemGrid(embed, sorted, (item) => (item.expiry ? `<t:${unixTs(item.expiry)}:R>` : ""));
  setCatalogThumbnail(embed, sorted);
  embed.setFooter({ text: `${sorted.length} articles bientôt retirés` });
  return embed;
}

export function buildBoutiqueComponents(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setLabel("Boutique officielle").setStyle(ButtonStyle.Link).setURL(SHOP_URL),
    new ButtonBuilder()
      .setLabel("Voir en images")
      .setStyle(ButtonStyle.Link)
      .setURL(SHOP_GALLERY_URL),
  );
}

export function buildBoutiqueEmbeds(data: BoutiqueData): EmbedBuilder[] {
  const embeds: EmbedBuilder[] = [buildOverviewEmbed(data)];

  const newItems = uniqueBoutiqueItems(data.items).filter((i) => i.isNew);
  if (newItems.length > 0) {
    embeds.push(buildNewItemsEmbed(newItems));
  }

  const now = Date.now();
  const expiringItems = uniqueBoutiqueItems(data.items).filter(
    (i) => i.expiry && i.expiry.getTime() - now < 24 * 60 * 60 * 1000,
  );
  if (expiringItems.length > 0) {
    embeds.push(buildExpiringEmbed(expiringItems));
  }

  return embeds.slice(0, 10);
}

export async function buildBoutiquePayload(data: BoutiqueData): Promise<{
  embeds: EmbedBuilder[];
  files?: { attachment: Buffer; name: string }[];
  components: ActionRowBuilder<ButtonBuilder>[];
}> {
  return {
    embeds: buildBoutiqueEmbeds(data),
    components: [buildBoutiqueComponents()],
  };
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

export async function handleCommand(interaction: ChatInputCommandInteraction, _client?: Client) {
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
    const components = [buildBoutiqueComponents()];
    let payload: {
      embeds: EmbedBuilder[];
      files?: { attachment: Buffer; name: string }[];
      components: ActionRowBuilder<ButtonBuilder>[];
    };

    if (section === "overview") {
      payload = await buildBoutiquePayload(data);
    } else if (section === "new") {
      payload = {
        embeds: [buildNewItemsEmbed(uniqueBoutiqueItems(data.items).filter((i) => i.isNew))],
        components,
      };
    } else if (section === "expiring") {
      const now = Date.now();
      payload = {
        embeds: [
          buildExpiringEmbed(
            uniqueBoutiqueItems(data.items).filter(
              (i) => i.expiry && i.expiry.getTime() - now < 24 * 60 * 60 * 1000,
            ),
          ),
        ],
        components,
      };
    } else {
      const sectionItems = data.items.filter((i) => i.sectionId === section);
      const sectionName = sectionItems[0]?.sectionName || section;
      payload = {
        embeds: [buildSectionEmbed(sectionName, section, sectionItems, data.date, data.nextReset)],
        components,
      };
    }

    const finalEmbeds = payload.embeds.slice(0, 10);
    const reply: {
      embeds: EmbedBuilder[];
      components: ActionRowBuilder<ButtonBuilder>[];
      files?: { attachment: Buffer; name: string }[];
    } = {
      embeds: finalEmbeds,
      components: payload.components,
    };
    if (payload.files) reply.files = payload.files;

    await interaction.editReply(reply);
  } catch (err) {
    logger.error("[Boutique] Erreur:", String(err));
    await interaction.editReply({
      content: "❌ Une erreur est survenue lors de la récupération de la boutique.",
    });
    void err;
  }
}
