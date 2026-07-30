/**
 * retailerAlerts.ts — Orchestrateur central du système de surveillance revendeurs
 *
 * Fonctions :
 *  1. Registry — enregistre tous les modules revendeurs
 *  2. Search multi-revendeurs — recherche parallèle sur plusieurs boutiques
 *  3. Price tracking — surveille les prix et envoie des alertes Discord
 *  4. Restock alerts — détecte les remises en stock
 *  5. Deal alerts — récupère les promotions
 *  6. New product alerts — détecte les nouveautés
 *
 * Quent (agentBrain) utilise ces fonctions via les tools agentTools.
 */

import { Client, TextChannel, EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";
import { config } from "../config.js";
import { dedupCache } from "../utils/deduplicationCache.js";
import { safeInterval } from "../utils/safe-interval.js";

import type { RetailerModule, RetailerProduct, RetailerSearchResult, RetailerId, CountryCode, AlertType } from "./retailers/types.js";
import { RETAILER_NAMES, RETAILER_EMOJIS } from "./retailers/types.js";

// Modules revendeurs
import { amazonModule, getKeepaPriceHistory } from "./retailers/amazon.js";
import { ebayModule } from "./retailers/ebay.js";
import {
  cdiscountModule, fnacModule, dartyModule, boulangerModule,
  ldlcModule, decathlonModule, backmarketModule, vintedModule,
  leboncoinModule, rakutenModule, ikeaModule, zalandoModule,
} from "./retailers/frenchRetailers.js";
import {
  alternateModule, mindfactoryModule, casekingModule,
} from "./retailers/euRetailers.js";
import {
  dealabsModule, mydealzModule, hotukdealsModule,
  idealoModule, pricespyModule,
} from "./retailers/dealAggregators.js";
import {
  cdkeysModule, fanaticalModule, enebaModule, kinguinModule,
  g2aModule, shoptoModule, games365Module, basecomModule, gamesplanetModule,
} from "./retailers/gamingRetailers.js";

// ─── Registry ───────────────────────────────────────────────────────────────

const RETAILER_REGISTRY: Map<RetailerId, RetailerModule> = new Map();

function registerRetailers(): void {
  const modules: RetailerModule[] = [
    amazonModule,
    ebayModule,
    cdiscountModule,
    fnacModule,
    dartyModule,
    boulangerModule,
    ldlcModule,
    decathlonModule,
    backmarketModule,
    vintedModule,
    leboncoinModule,
    rakutenModule,
    ikeaModule,
    zalandoModule,
    alternateModule,
    mindfactoryModule,
    casekingModule,
    dealabsModule,
    mydealzModule,
    hotukdealsModule,
    idealoModule,
    pricespyModule,
    cdkeysModule,
    fanaticalModule,
    enebaModule,
    kinguinModule,
    g2aModule,
    shoptoModule,
    games365Module,
    basecomModule,
    gamesplanetModule,
  ];

  for (const mod of modules) {
    RETAILER_REGISTRY.set(mod.id, mod);
  }
  logger.info(`[RetailerAlerts] ${RETAILER_REGISTRY.size} revendeurs enregistrés`);
}

registerRetailers();

// ─── Search multi-revendeurs ─────────────────────────────────────────────────

export interface MultiSearchOptions {
  retailers?: RetailerId[];
  countries?: CountryCode[];
  limit?: number;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  sortBy?: "price" | "discount" | "rating";
}

export async function searchAllRetailers(
  query: string,
  options: MultiSearchOptions = {},
): Promise<RetailerProduct[]> {
  const {
    retailers = Array.from(RETAILER_REGISTRY.keys()),
    countries = ["FR"],
    limit = 5,
    minPrice = 0,
    maxPrice = Infinity,
    inStockOnly = true,
    sortBy = "price",
  } = options;

  const tasks: Promise<RetailerSearchResult>[] = [];

  for (const retailerId of retailers) {
    const mod = RETAILER_REGISTRY.get(retailerId);
    if (!mod) continue;

    for (const country of countries) {
      if (!mod.countries.includes(country)) continue;
      tasks.push(
        mod.search(query, country, limit).catch(() => ({
          products: [], retailer: retailerId, totalFound: 0, searchQuery: query,
        })),
      );
    }
  }

  const results = await Promise.allSettled(tasks);
  let allProducts: RetailerProduct[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      allProducts.push(...result.value.products);
    }
  }

  // Filtrer
  allProducts = allProducts.filter((p) => {
    if (p.price < minPrice) return false;
    if (p.price > maxPrice) return false;
    if (inStockOnly && !p.inStock) return false;
    return true;
  });

  // Trier
  if (sortBy === "price") {
    allProducts.sort((a, b) => a.price - b.price);
  } else if (sortBy === "discount") {
    allProducts.sort((a, b) => (b.discountPercent || 0) - (a.discountPercent || 0));
  } else if (sortBy === "rating") {
    allProducts.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  }

  return allProducts;
}

// ─── Recherche sur un seul revendeur ─────────────────────────────────────────

export async function searchRetailer(
  retailerId: RetailerId,
  query: string,
  country: CountryCode = "FR",
  limit = 10,
): Promise<RetailerProduct[]> {
  const mod = RETAILER_REGISTRY.get(retailerId);
  if (!mod) return [];
  if (!mod.countries.includes(country)) return [];
  const result = await mod.search(query, country, limit).catch(() => null);
  return result?.products || [];
}

// ─── Récupère les deals d'un revendeur ───────────────────────────────────────

export async function getRetailerDeals(
  retailerId: RetailerId,
  country: CountryCode = "FR",
  limit = 10,
): Promise<RetailerProduct[]> {
  const mod = RETAILER_REGISTRY.get(retailerId);
  if (!mod?.getDeals) return [];
  if (!mod.countries.includes(country)) return [];
  return mod.getDeals(country, limit).catch(() => []);
}

// ─── Récupère les nouveautés ─────────────────────────────────────────────────

export async function getRetailerNewProducts(
  retailerId: RetailerId,
  country: CountryCode = "FR",
  category?: string,
  limit = 10,
): Promise<RetailerProduct[]> {
  const mod = RETAILER_REGISTRY.get(retailerId);
  if (!mod?.getNewProducts) return [];
  if (!mod.countries.includes(country)) return [];
  return mod.getNewProducts(country, category, limit).catch(() => []);
}

// ─── Tracking de prix ────────────────────────────────────────────────────────

interface TrackedProduct {
  id: string;
  retailer: RetailerId;
  country: CountryCode;
  productId: string;
  title: string;
  lastPrice: number;
  targetPrice?: number;
  channelId?: string;
  userId: string;
  guildId: string;
  alertOnRestock: boolean;
  alertOnPriceDrop: boolean;
  alertOnPromotion: boolean;
  wasInStock: boolean;
}

const trackedProducts = new Map<string, TrackedProduct>();

export function trackProduct(
  retailer: RetailerId,
  country: CountryCode,
  productId: string,
  title: string,
  userId: string,
  guildId: string,
  options: {
    targetPrice?: number;
    channelId?: string;
    alertOnRestock?: boolean;
    alertOnPriceDrop?: boolean;
    alertOnPromotion?: boolean;
  } = {},
): string {
  const id = `track_${retailer}_${country}_${productId}_${Date.now()}`;
  const tracked: TrackedProduct = {
    id,
    retailer,
    country,
    productId,
    title,
    lastPrice: 0,
    targetPrice: options.targetPrice,
    channelId: options.channelId,
    userId,
    guildId,
    alertOnRestock: options.alertOnRestock ?? true,
    alertOnPriceDrop: options.alertOnPriceDrop ?? true,
    alertOnPromotion: options.alertOnPromotion ?? true,
    wasInStock: false,
  };
  trackedProducts.set(id, tracked);
  logger.info(`[RetailerAlerts] Tracking ${retailer}:${productId} pour ${userId}`);
  return id;
}

export function untrackProduct(id: string): boolean {
  return trackedProducts.delete(id);
}

export function getTrackedProducts(userId?: string): TrackedProduct[] {
  const all = Array.from(trackedProducts.values());
  return userId ? all.filter((t) => t.userId === userId) : all;
}

// ─── Vérification des produits trackés ──────────────────────────────────────

async function checkTrackedProducts(client: Client): Promise<void> {
  if (trackedProducts.size === 0) return;

  logger.info(`[RetailerAlerts] Vérification de ${trackedProducts.size} produit(s) tracké(s)`);

  for (const [id, tracked] of trackedProducts) {
    const mod = RETAILER_REGISTRY.get(tracked.retailer);
    if (!mod) continue;

    try {
      const product = await mod.getProduct(tracked.productId, tracked.country);
      if (!product) continue;

      let alertType: AlertType | null = null;
      let alertMsg = "";

      // Price drop
      if (tracked.alertOnPriceDrop && tracked.lastPrice > 0 && product.price < tracked.lastPrice) {
        const drop = tracked.lastPrice - product.price;
        const dropPercent = Math.round((drop / tracked.lastPrice) * 100);
        alertType = "price_drop";
        alertMsg = `📉 **Baisse de prix** — ${product.title}\n` +
          `Ancien: ${tracked.lastPrice}€ → Nouveau: ${product.price}€ (-${dropPercent}%)`;
      }

      // Target price reached
      if (tracked.targetPrice && product.price <= tracked.targetPrice) {
        alertType = "price_drop";
        alertMsg = `🎯 **Prix cible atteint** — ${product.title}\n` +
          `Prix cible: ${tracked.targetPrice}€ → Prix actuel: ${product.price}€`;
      }

      // Restock
      if (tracked.alertOnRestock && !tracked.wasInStock && product.inStock) {
        alertType = "restock";
        alertMsg = `✅ **Remise en stock** — ${product.title}\n` +
          `Prix: ${product.price}€ sur ${RETAILER_NAMES[tracked.retailer]}`;
      }

      // Promotion
      if (tracked.alertOnPromotion && product.discountPercent && product.discountPercent >= 20) {
        alertType = "promotion";
        alertMsg = `🔥 **Promotion détectée** — ${product.title}\n` +
          `-${product.discountPercent}% (${product.originalPrice}€ → ${product.price}€)`;
      }

      // Envoyer l'alerte
      if (alertType) {
        const dedupKey = `retailer_alert:${id}:${alertType}:${product.price}`;
        if (!dedupCache.isAlreadyProcessed("retailer_alerts", dedupKey)) {
          await sendRetailerAlert(client, tracked, product, alertType, alertMsg);
          await dedupCache.markAsProcessed("retailer_alerts", dedupKey);
        }
      }

      // Mettre à jour le tracking
      tracked.lastPrice = product.price;
      tracked.wasInStock = product.inStock;
    } catch (err) {
      logger.debug(`[RetailerAlerts] Erreur tracking ${id}: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Rate limit entre les checks
    await new Promise((r) => setTimeout(r, 500));
  }
}

// ─── Channel dédié aux alertes revendeurs ───────────────────────────────────

const RETAILER_ALERT_CHANNEL = "1532189747500421152";

// ─── Pays : drapeaux et noms multilingues ───────────────────────────────────

const COUNTRY_FLAGS: Record<string, string> = {
  FR: "🇫🇷", DE: "🇩🇪", BE: "🇧🇪", NL: "🇳🇱", ES: "🇪🇸",
  IT: "🇮🇹", CH: "🇨🇭", UK: "🇬🇧", US: "🇺🇸",
};

const COUNTRY_NAMES: Record<string, Record<string, string>> = {
  FR: { fr: "France", en: "France", de: "Frankreich", es: "Francia", it: "Francia" },
  DE: { fr: "Allemagne", en: "Germany", de: "Deutschland", es: "Alemania", it: "Germania" },
  BE: { fr: "Belgique", en: "Belgium", de: "Belgien", es: "Bélgica", it: "Belgio" },
  NL: { fr: "Pays-Bas", en: "Netherlands", de: "Niederlande", es: "Países Bajos", it: "Paesi Bassi" },
  ES: { fr: "Espagne", en: "Spain", de: "Spanien", es: "España", it: "Spagna" },
  IT: { fr: "Italie", en: "Italy", de: "Italien", es: "Italia", it: "Italia" },
  CH: { fr: "Suisse", en: "Switzerland", de: "Schweiz", es: "Suiza", it: "Svizzera" },
  UK: { fr: "Royaume-Uni", en: "United Kingdom", de: "Vereinigtes Königreich", es: "Reino Unido", it: "Regno Unito" },
  US: { fr: "États-Unis", en: "United States", de: "USA", es: "Estados Unidos", it: "Stati Uniti" },
};

function getCountryDisplay(country: string): string {
  const flag = COUNTRY_FLAGS[country] || "🌍";
  const name = COUNTRY_NAMES[country]?.fr || country;
  return `${flag} ${name}`;
}

// ─── Couleurs par catégorie de produit ──────────────────────────────────────

const CATEGORY_COLORS: Record<string, number> = {
  gaming: 0x9b59b6,       // Violet — jeux vidéo, consoles
  tech: 0x0099ff,          // Bleu — high-tech, électronique
  phone: 0x3498db,         // Bleu clair — smartphones, tablettes
  computer: 0x1abc9c,      // Turquoise — PC, composants
  tv: 0x2ecc71,            // Vert — TV, home cinéma
  audio: 0xe67e22,         // Orange — casque, enceintes
  photo: 0xf1c40f,         // Jaune — photo, caméras
  sport: 0xe74c3c,         // Rouge — sport, fitness
  fashion: 0xff69b4,       // Rose — mode, vêtements
  home: 0x95a5a6,          // Gris — maison, déco
  kitchen: 0xd35400,       // Orange foncé — cuisine
  toy: 0xffd700,           // Or — jouets
  book: 0x8e44ad,          // Violet foncé — livres
  beauty: 0xff79c6,        // Rose clair — beauté
  auto: 0x2c3e50,          // Gris foncé — auto/moto
  garden: 0x27ae60,        // Vert foncé — jardin
  pet: 0xf39c12,           // Orange clair — animaux
  food: 0x16a085,          // Vert turquoise — alimentation
  music: 0xc0392b,         // Rouge foncé — instruments
  office: 0x7f8c8d,        // Gris clair — bureau
  other: 0x607d8b,         // Bleu-gris — autre
};

function detectCategory(title: string, retailer: RetailerId): string {
  const t = title.toLowerCase();

  if (/ps5|ps4|playstation|xbox|nintendo|switch|jeu |game|gaming|console|steam|epic|cdkey|fanatical|eneba|kinguin|g2a|gamesplanet|shopto|base\.com|365games/.test(t) ||
      ["cdkeys", "fanatical", "eneba", "kinguin", "g2a", "gamesplanet", "shopto", "basecom", "365games"].includes(retailer))
    return "gaming";
  if (/iphone|samsung|galaxy|phone|smartphone|tablet|ipad|mobile|xiaomi|oppo|oneplus|pixel/.test(t))
    return "phone";
  if (/rtx|rx |gpu|carte graphique|processor|cpu|ram|ssd|disque dur|motherboard|carte mère|pc gamer|tour pc|boîtier|alimentation|refroidissement|watercooling/.test(t))
    return "computer";
  if (/tv|télé|oled|qled|4k|8k|projecteur|home cinema|sony bravia|samsung tv|lg tv/.test(t))
    return "tv";
  if (/casque|headphone|earbud|airpods|galaxy buds|enceinte|speaker|jbl|bose|sonos|soundbar|barre de son/.test(t))
    return "audio";
  if (/appareil photo|camera|canon|nikon|sony alpha|objectif|lens|gopro|drone/.test(t))
    return "photo";
  if (/vélo|bike|tapis|fitness|running|yoga|dumbbell|haltère|sport|gym|decathlon/.test(t) || retailer === "decathlon")
    return "sport";
  if (/t-shirt|chemise|robe|jean|veste|manteau|chaussure|sneaker|nike|adidas|zalando|vêtement|mode|fashion/.test(t) || retailer === "zalando" || retailer === "vinted")
    return "fashion";
  if (/canapé|table|chaise|lampe|déco|meuble|matelas|rideau|tapis|ikea/.test(t) || retailer === "ikea")
    return "home";
  if (/poêle|casserole|friteuse|robot|mixeur|cafetière| Nespresso|thermomix|kitchen|cuisine/.test(t))
    return "kitchen";
  if (/jouet|lego|playmobil|figurine|peluche|toy/.test(t))
    return "toy";
  if (/livre|book|roman|bd|manga|kindle|comic/.test(t) || retailer === "fnac")
    return "book";
  if (/parfum|maquillage|crème|shampooing|beauté|cosmétique|soin/.test(t))
    return "beauty";
  if (/voiture|moto|auto|pneu|huile|carrosserie|dashcam|gps auto/.test(t))
    return "auto";
  if (/jardin|tondeuse|brouette|plant|graine|potager|outdoor/.test(t))
    return "garden";
  if (/croquette|chien|chat|oiseau|aquarium|animal|pet/.test(t))
    return "pet";
  if (/épicerie|alimentaire|chocolat|café|thé|food|boisson/.test(t))
    return "food";
  if (/guitare|piano|batterie|synthé|micro|instrument|music/.test(t))
    return "music";
  if (/bureau|chaise de bureau|clavier|souris|imprimante|scanner|office|papeterie/.test(t))
    return "office";
  if (/lave|frigo|réfrigérateur|aspirateur|lave-linge|sèche|électroménager|darty|boulanger/.test(t))
    return "tech";
  return "other";
}

function getCategoryColor(category: string): number {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS.other;
}

function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    gaming: "🎮 Gaming",
    tech: "🔧 High-Tech",
    phone: "📱 Smartphone",
    computer: "💻 PC/Composants",
    tv: "📺 TV/Cinéma",
    audio: "🎧 Audio",
    photo: "📷 Photo/Vidéo",
    sport: "⚽ Sport",
    fashion: "👕 Mode",
    home: "🏠 Maison",
    kitchen: "🍳 Cuisine",
    toy: "🧸 Jouets",
    book: "📚 Livres",
    beauty: "💄 Beauté",
    auto: "🚗 Auto/Moto",
    garden: "🌿 Jardin",
    pet: "🐾 Animaux",
    food: "🍽️ Alimentation",
    music: "🎸 Musique",
    office: "📎 Bureau",
    other: "📦 Autre",
  };
  return labels[category] ?? labels.other;
}

// ─── Envoi d'alerte Discord ─────────────────────────────────────────────────

async function sendRetailerAlert(
  client: Client,
  tracked: TrackedProduct,
  product: RetailerProduct,
  alertType: AlertType,
  message: string,
): Promise<void> {
  const channelId = RETAILER_ALERT_CHANNEL;
  const channel = client.channels.cache.get(channelId) as TextChannel;
  if (!channel?.isTextBased()) return;

  const emoji = RETAILER_EMOJIS[tracked.retailer] || "🔔";
  const category = detectCategory(product.title, tracked.retailer);
  const categoryColor = getCategoryColor(category);
  const categoryLabel = getCategoryLabel(category);
  const countryDisplay = getCountryDisplay(tracked.country);

  const alertTypeLabels: Record<AlertType, string> = {
    price_drop: "📉 Baisse de prix",
    promotion: "🔥 Promotion",
    restock: "✅ Remise en stock",
    new_product: "🆕 Nouveauté",
    deal: "🏷️ Deal",
  };

  const embed = new EmbedBuilder()
    .setTitle(`${emoji} ${alertTypeLabels[alertType]} — ${product.title}`)
    .setDescription(message)
    .setColor(categoryColor)
    .addFields(
      { name: "Produit", value: product.title, inline: false },
      { name: "Marketplace", value: `${emoji} ${RETAILER_NAMES[tracked.retailer]}`, inline: true },
      { name: "Pays", value: countryDisplay, inline: true },
      { name: "Prix", value: `${product.price} ${product.currency}`, inline: true },
      { name: "Catégorie", value: categoryLabel, inline: true },
      { name: "Stock", value: product.inStock ? "✅ En stock" : "❌ Rupture", inline: true },
      { name: "Lien", value: `[Voir le produit](${product.url})`, inline: true },
    )
    .setURL(product.url)
    .setFooter({ text: `Retailer Alerts • ${categoryLabel} • ${countryDisplay} • ${RETAILER_NAMES[tracked.retailer]} • <@${tracked.userId}>` })
    .setTimestamp();

  if (product.image) {
    try { embed.setThumbnail(product.image); } catch { /* URL invalide */ }
  }

  // ── 1. Envoyer dans le salon dédié ──
  try {
    await channel.send({ content: `<@${tracked.userId}>`, embeds: [embed] });
    logger.info(`[RetailerAlerts] Alerte ${alertType} envoyée pour ${product.title} (${tracked.retailer})`);
  } catch (err) {
    logger.error(`[RetailerAlerts] Erreur envoi alerte salon: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── 2. Envoyer en DM à l'utilisateur ──
  try {
    const user = await client.users.fetch(tracked.userId);
    if (user) {
      await user.send({ content: `${alertTypeLabels[alertType]} sur ${RETAILER_NAMES[tracked.retailer]} (${countryDisplay})`, embeds: [embed] });
      logger.info(`[RetailerAlerts] DM envoyé à ${user.tag} pour ${product.title}`);
    }
  } catch (dmErr) {
    logger.warn(`[RetailerAlerts] DM impossible pour ${tracked.userId}: ${dmErr instanceof Error ? dmErr.message : String(dmErr)}`);
  }
}

// ─── Surveillance des deals (cron) ──────────────────────────────────────────

async function checkRetailerDeals(client: Client): Promise<void> {
  const dealRetailers: RetailerId[] = ["amazon", "dealabs", "mydealz", "hotukdeals"];
  const countries: CountryCode[] = ["FR", "DE", "UK"];

  for (const retailerId of dealRetailers) {
    for (const country of countries) {
      try {
        const deals = await getRetailerDeals(retailerId, country, 5);
        for (const deal of deals) {
          const dedupKey = `retailer_deal:${retailerId}:${country}:${deal.productId}:${deal.price}`;
          if (dedupCache.isAlreadyProcessed("retailer_deals", dedupKey)) continue;

          await sendDealNotification(client, deal);
          await dedupCache.markAsProcessed("retailer_deals", dedupKey);
        }
      } catch {
        // Revendeur individuel échoué
      }
    }
  }
}

async function sendDealNotification(client: Client, product: RetailerProduct): Promise<void> {
  const channelId = RETAILER_ALERT_CHANNEL;
  const channel = client.channels.cache.get(channelId) as TextChannel;
  if (!channel?.isTextBased()) return;

  const emoji = RETAILER_EMOJIS[product.retailer] || "🏷️";
  const category = detectCategory(product.title, product.retailer);
  const categoryColor = getCategoryColor(category);
  const categoryLabel = getCategoryLabel(category);
  const countryDisplay = getCountryDisplay(product.country);

  const embed = new EmbedBuilder()
    .setTitle(`${emoji} Deal — ${product.title}`)
    .setDescription(`**${product.title}**`)
    .setColor(categoryColor)
    .addFields(
      { name: "Produit", value: product.title, inline: false },
      { name: "Marketplace", value: `${emoji} ${RETAILER_NAMES[product.retailer]}`, inline: true },
      { name: "Pays", value: countryDisplay, inline: true },
      { name: "Prix", value: `${product.price} ${product.currency}`, inline: true },
      { name: "Réduction", value: product.discountPercent ? `-${product.discountPercent}%` : "N/A", inline: true },
      { name: "Catégorie", value: categoryLabel, inline: true },
      { name: "Stock", value: product.inStock ? "✅ En stock" : "❌ Rupture", inline: true },
      { name: "Lien", value: `[Voir le deal](${product.url})`, inline: true },
    )
    .setURL(product.url)
    .setFooter({ text: `Retailer Alerts • ${categoryLabel} • ${countryDisplay} • ${RETAILER_NAMES[product.retailer]} • Deals Monitor` })
    .setTimestamp();

  if (product.image) {
    try { embed.setThumbnail(product.image); } catch { /* */ }
  }

  try {
    await channel.send({ embeds: [embed] });
  } catch {
    // Erreur envoi
  }
}

// ─── Démarrage / arrêt ──────────────────────────────────────────────────────

let trackingInterval: NodeJS.Timeout | null = null;
let dealsInterval: NodeJS.Timeout | null = null;

const TRACKING_INTERVAL_MS = parseInt(process.env.RETAILER_TRACKING_INTERVAL_MS || "600000", 10); // 10 min
const DEALS_INTERVAL_MS = parseInt(process.env.RETAILER_DEALS_INTERVAL_MS || "900000", 10); // 15 min

export function startRetailerMonitoring(client: Client): void {
  if (trackingInterval) {
    logger.warn("[RetailerAlerts] Monitoring déjà actif");
    return;
  }

  logger.info(`[RetailerAlerts] Démarrage monitoring (tracking: ${TRACKING_INTERVAL_MS / 60000}min, deals: ${DEALS_INTERVAL_MS / 60000}min)`);

  // Premier check après 2 min
  setTimeout(() => {
    void checkTrackedProducts(client);
    void checkRetailerDeals(client);
  }, 120000);

  trackingInterval = safeInterval("RetailerTracking", () => checkTrackedProducts(client), TRACKING_INTERVAL_MS);
  dealsInterval = safeInterval("RetailerDeals", () => checkRetailerDeals(client), DEALS_INTERVAL_MS);
}

export function stopRetailerMonitoring(): void {
  if (trackingInterval) {
    clearInterval(trackingInterval);
    trackingInterval = null;
  }
  if (dealsInterval) {
    clearInterval(dealsInterval);
    dealsInterval = null;
  }
  logger.info("[RetailerAlerts] Monitoring arrêté");
}

// ─── Export pour Quent (agent tools) ─────────────────────────────────────────

export function getAvailableRetailers(): Array<{ id: RetailerId; name: string; countries: CountryCode[] }> {
  return Array.from(RETAILER_REGISTRY.values()).map((mod) => ({
    id: mod.id,
    name: mod.name,
    countries: mod.countries,
  }));
}

export function getRetailerModule(id: RetailerId): RetailerModule | undefined {
  return RETAILER_REGISTRY.get(id);
}

export { getKeepaPriceHistory } from "./retailers/amazon.js";
