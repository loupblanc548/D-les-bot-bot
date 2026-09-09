/**
 * types.ts — Types partagés pour le système de surveillance revendeurs
 *
 * Couvre les produits disponibles/livrés en :
 *  France, Allemagne, Belgique, Pays-Bas, Espagne, Suisse
 */

export type RetailerId =
  | "amazon"
  | "ebay"
  | "aliexpress"
  | "cdiscount"
  | "fnac"
  | "darty"
  | "boulanger"
  | "ldlc"
  | "topachat"
  | "materielnet"
  | "rakuten"
  | "laredoute"
  | "decathlon"
  | "ikea"
  | "zalando"
  | "backmarket"
  | "vinted"
  | "leboncoin"
  | "alternate"
  | "mindfactory"
  | "caseking"
  | "bhphoto"
  | "microcenter"
  | "newegg"
  | "bestbuy"
  | "target"
  | "walmart"
  | "etsy"
  | "dealabs"
  | "slickdeals"
  | "hotukdeals"
  | "mydealz"
  | "keepa"
  | "camelcamelcamel"
  | "idealo"
  | "googleShopping"
  | "pricespy"
  | "twenga"
  | "cdkeys"
  | "fanatical"
  | "eneba"
  | "kinguin"
  | "g2a"
  | "gamesplanet"
  | "shopto"
  | "basecom"
  | "365games"
  | "greenmangaming"
  | "humblebundle"
  | "instantgaming"
  | "gog";

export type CountryCode = "FR" | "DE" | "BE" | "NL" | "ES" | "IT" | "CH" | "UK" | "US" | "AT";

export type AlertType = "price_drop" | "promotion" | "restock" | "new_product" | "deal";

export interface RetailerProduct {
  retailer: RetailerId;
  country: CountryCode;
  productId: string;
  title: string;
  price: number;
  originalPrice?: number;
  currency: string;
  discountPercent?: number;
  inStock: boolean;
  url: string;
  image?: string;
  category?: string;
  brand?: string;
  rating?: number;
  reviewCount?: number;
  shippingCost?: number;
  shippingDays?: number;
  lastSeen: Date;
}

export interface RetailerSearchResult {
  products: RetailerProduct[];
  retailer: RetailerId;
  totalFound: number;
  searchQuery: string;
}

export interface PriceAlertConfig {
  productId: string;
  retailer: RetailerId;
  country: CountryCode;
  targetPrice?: number;
  discountThreshold?: number;
  alertOnRestock: boolean;
  alertOnPriceDrop: boolean;
  alertOnPromotion: boolean;
  channelId?: string;
  userId: string;
  guildId: string;
}

export interface RetailerModule {
  id: RetailerId;
  name: string;
  countries: CountryCode[];
  search: (query: string, country: CountryCode, limit?: number) => Promise<RetailerSearchResult>;
  getProduct: (productId: string, country: CountryCode) => Promise<RetailerProduct | null>;
  getDeals?: (country: CountryCode, limit?: number) => Promise<RetailerProduct[]>;
  getNewProducts?: (
    country: CountryCode,
    category?: string,
    limit?: number,
  ) => Promise<RetailerProduct[]>;
}

export const RETAILER_COUNTRIES: CountryCode[] = ["FR", "DE", "BE", "NL", "ES", "IT", "CH"];

export const RETAILER_NAMES: Record<RetailerId, string> = {
  amazon: "Amazon",
  ebay: "eBay",
  aliexpress: "AliExpress",
  cdiscount: "Cdiscount",
  fnac: "Fnac",
  darty: "Darty",
  boulanger: "Boulanger",
  ldlc: "LDLC",
  topachat: "Top Achat",
  materielnet: "Materiel.net",
  rakuten: "Rakuten",
  laredoute: "La Redoute",
  decathlon: "Decathlon",
  ikea: "IKEA",
  zalando: "Zalando",
  backmarket: "Back Market",
  vinted: "Vinted",
  leboncoin: "Leboncoin",
  alternate: "Alternate",
  mindfactory: "Mindfactory",
  caseking: "Caseking",
  bhphoto: "B&H Photo",
  microcenter: "Micro Center",
  newegg: "Newegg",
  bestbuy: "Best Buy",
  target: "Target",
  walmart: "Walmart",
  etsy: "Etsy",
  dealabs: "Dealabs",
  slickdeals: "Slickdeals",
  hotukdeals: "HotUKDeals",
  mydealz: "MyDealz",
  keepa: "Keepa",
  camelcamelcamel: "CamelCamelCamel",
  idealo: "Idealo",
  googleShopping: "Google Shopping",
  pricespy: "PriceSpy",
  twenga: "Twenga",
  cdkeys: "CDKeys",
  fanatical: "Fanatical",
  eneba: "Eneba",
  kinguin: "Kinguin",
  g2a: "G2A",
  gamesplanet: "Gamesplanet",
  shopto: "Shopto",
  basecom: "Base.com",
  "365games": "365games",
  greenmangaming: "Green Man Gaming",
  humblebundle: "Humble Bundle",
  instantgaming: "Instant Gaming",
  gog: "GOG",
};

export const RETAILER_EMOJIS: Record<RetailerId, string> = {
  amazon: "📦",
  ebay: "🏷️",
  aliexpress: "🛒",
  cdiscount: "🔴",
  fnac: "📚",
  darty: "🔌",
  boulanger: "🏪",
  ldlc: "💻",
  topachat: "⚡",
  materielnet: "🖥️",
  rakuten: "🛍️",
  laredoute: "📖",
  decathlon: "⚽",
  ikea: "🪑",
  zalando: "👟",
  backmarket: "♻️",
  vinted: "👕",
  leboncoin: "📰",
  alternate: "🔧",
  mindfactory: "🏭",
  caseking: "🎮",
  bhphoto: "📷",
  microcenter: "🏬",
  newegg: "🥚",
  bestbuy: "🔵",
  target: "🎯",
  walmart: "🛙",
  etsy: "🎨",
  dealabs: "🔥",
  slickdeals: "💥",
  hotukdeals: "🇬🇧",
  mydealz: "🇩🇪",
  keepa: "📈",
  camelcamelcamel: "🐪",
  idealo: "🔍",
  googleShopping: "🟢",
  pricespy: "🕵️",
  twenga: "🎯",
  cdkeys: "🗝️",
  fanatical: " fanatic",
  eneba: "🎮",
  kinguin: "👑",
  g2a: "2️⃣",
  gamesplanet: "🌍",
  shopto: "🛒",
  basecom: "📦",
  "365games": "🎲",
  greenmangaming: "🟢",
  humblebundle: "🤝",
  instantgaming: "⚡",
  gog: "💿",
};
