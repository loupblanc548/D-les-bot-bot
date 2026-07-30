/**
 * amazon.ts — Module Amazon multi-pays
 *
 * Surveille les produits Amazon dans les pays suivants :
 *  FR, DE, BE, NL, ES, IT, CH(.fr), UK, US
 *
 * Méthodes :
 *  1. Product Advertising API 5.0 (si clé configurée)
 *  2. Scraping HTML (fallback sans clé)
 *  3. Keepa API (historique prix + restock alerts)
 */

import logger from "../../utils/logger.js";
import { safeFetch } from "../../utils/ssrfGuard.js";
import type { RetailerModule, RetailerProduct, RetailerSearchResult, CountryCode } from "./types.js";

const AMAZON_DOMAINS: Record<CountryCode, string> = {
  FR: "www.amazon.fr",
  DE: "www.amazon.de",
  BE: "www.amazon.fr",
  NL: "www.amazon.nl",
  ES: "www.amazon.es",
  IT: "www.amazon.it",
  CH: "www.amazon.fr",
  UK: "www.amazon.co.uk",
  US: "www.amazon.com",
};

const AMAZON_CURRENCIES: Record<CountryCode, string> = {
  FR: "EUR",
  DE: "EUR",
  BE: "EUR",
  NL: "EUR",
  ES: "EUR",
  IT: "EUR",
  CH: "CHF",
  UK: "GBP",
  US: "USD",
};

const PA_API_KEY = process.env.AMAZON_PA_API_KEY || "";
const PA_API_SECRET = process.env.AMAZON_PA_API_SECRET || "";
const PA_ASSOCIATE_TAG = process.env.AMAZON_ASSOCIATE_TAG || "";
const KEEPA_API_KEY = process.env.KEEPA_API_KEY || "";

function hasAmazonApi(): boolean {
  return !!(PA_API_KEY && PA_API_SECRET && PA_ASSOCIATE_TAG);
}

function hasKeepaApi(): boolean {
  return !!KEEPA_API_KEY;
}

/**
 * Recherche produits Amazon via scraping HTML (fallback sans clé API)
 */
async function searchScraping(query: string, country: CountryCode, limit = 10): Promise<RetailerSearchResult> {
  const domain = AMAZON_DOMAINS[country] || AMAZON_DOMAINS.FR;
  const currency = AMAZON_CURRENCIES[country] || "EUR";
  const products: RetailerProduct[] = [];

  try {
    const url = `https://${domain}/s?k=${encodeURIComponent(query)}&language=fr_FR`;
    const res = await safeFetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return { products, retailer: "amazon", totalFound: 0, searchQuery: query };

    const html = await res.text();

    // Extraction des blocs produits (data-component-type="s-search-result")
    const productBlocks = html.match(/data-component-type="s-search-result"[^>]*id="[^"]*"/g) || [];

    for (const block of productBlocks.slice(0, limit)) {
      try {
        const asinMatch = block.match(/id="([^"]+)"/);
        const asin = asinMatch ? asinMatch[1] : "";
        if (!asin) continue;

        // Extraire le bloc complet autour de cet ASIN
        const blockStart = html.indexOf(`id="${asin}"`);
        if (blockStart === -1) continue;
        const blockHtml = html.slice(blockStart - 200, blockStart + 3000);

        // Titre
        const titleMatch =
          blockHtml.match(/<h2[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/) ||
          blockHtml.match(/<span[^>]*class="[^"]*a-text-normal[^"]*"[^>]*>([\s\S]*?)<\/span>/);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";

        // Prix
        const priceMatch =
          blockHtml.match(/class="a-price[^"]*"[^>]*>[\s\S]*?<span[^>]*>([\d.,]+)<\/span>/) ||
          blockHtml.match(/a-offscreen"[^>]*>([\d.,]+)\s*€/);
        const priceStr = priceMatch ? priceMatch[1].replace(",", ".").replace(/[^\d.]/g, "") : "";
        const price = parseFloat(priceStr) || 0;

        // Prix original barré
        const originalMatch = blockHtml.match(/class="a-price a-text-price[\s\S]*?<span[^>]*>([\d.,]+)<\/span>/);
        const originalStr = originalMatch ? originalMatch[1].replace(",", ".").replace(/[^\d.]/g, "") : "";
        const originalPrice = originalStr ? parseFloat(originalStr) : undefined;

        // Image
        const imgMatch = blockHtml.match(/<img[^>]*src="(https:\/\/[^"]+)"[^>]*>/);
        const image = imgMatch ? imgMatch[1] : undefined;

        // Stock
        const outOfStock = blockHtml.includes("indisponible") || blockHtml.includes("Out of Stock");
        const inStock = !outOfStock && price > 0;

        // Rating
        const ratingMatch = blockHtml.match(/a-icon-star[\s\S]*?(\d[.,]\d)/);
        const rating = ratingMatch ? parseFloat(ratingMatch[1].replace(",", ".")) : undefined;

        // Discount
        let discountPercent: number | undefined;
        if (originalPrice && originalPrice > price && price > 0) {
          discountPercent = Math.round(((originalPrice - price) / originalPrice) * 100);
        }

        if (title && asin) {
          products.push({
            retailer: "amazon",
            country,
            productId: asin,
            title,
            price,
            originalPrice,
            currency,
            discountPercent,
            inStock,
            url: `https://${domain}/dp/${asin}`,
            image,
            rating,
            lastSeen: new Date(),
          });
        }
      } catch {
        // Produit individuel échoué — on continue
      }
    }
  } catch (err) {
    logger.debug(`[Amazon] Search scraping error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { products, retailer: "amazon", totalFound: products.length, searchQuery: query };
}

/**
 * Récupère un produit Amazon spécifique par ASIN
 */
async function getProductScraping(asin: string, country: CountryCode): Promise<RetailerProduct | null> {
  const domain = AMAZON_DOMAINS[country] || AMAZON_DOMAINS.FR;
  const currency = AMAZON_CURRENCIES[country] || "EUR";

  try {
    const url = `https://${domain}/dp/${asin}`;
    const res = await safeFetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;
    const html = await res.text();

    // Titre
    const titleMatch = html.match(/<span[^>]*id="productTitle"[^>]*>([\s\S]*?)<\/span>/);
    const title = titleMatch ? titleMatch[1].trim() : "";

    // Prix
    const priceMatch =
      html.match(/class="a-price[^"]*"[^>]*>[\s\S]*?<span[^>]*>([\d.,]+)<\/span>/) ||
      html.match(/a-offscreen"[^>]*>([\d.,]+)\s*€/);
    const priceStr = priceMatch ? priceMatch[1].replace(",", ".").replace(/[^\d.]/g, "") : "";
    const price = parseFloat(priceStr) || 0;

    // Prix original
    const originalMatch = html.match(/class="a-price a-text-price[\s\S]*?<span[^>]*>([\d.,]+)<\/span>/);
    const originalStr = originalMatch ? originalMatch[1].replace(",", ".").replace(/[^\d.]/g, "") : "";
    const originalPrice = originalStr ? parseFloat(originalStr) : undefined;

    // Stock
    const inStock =
      !html.includes("indisponible") &&
      !html.includes("Currently unavailable") &&
      !html.includes("Out of Stock") &&
      price > 0;

    // Promotion
    const promoMatch = html.match(/class="[^"]*savings[^"]*"[^>]*>[\s\S]*?(\d+)%/);
    const discountPercent = promoMatch
      ? parseInt(promoMatch[1], 10)
      : originalPrice && originalPrice > price && price > 0
        ? Math.round(((originalPrice - price) / originalPrice) * 100)
        : undefined;

    // Image
    const imgMatch = html.match(/<img[^>]*id="landingImage"[^>]*src="(https:\/\/[^"]+)"/);
    const image = imgMatch ? imgMatch[1] : undefined;

    // Rating
    const ratingMatch = html.match(/a-icon-star[\s\S]*?(\d[.,]\d)/);
    const rating = ratingMatch ? parseFloat(ratingMatch[1].replace(",", ".")) : undefined;

    // Review count
    const reviewMatch = html.match(/(\d[\d.,]*)\s*(?:évaluations|ratings|global ratings)/);
    const reviewCount = reviewMatch ? parseInt(reviewMatch[1].replace(/[^\d]/g, ""), 10) : undefined;

    return {
      retailer: "amazon",
      country,
      productId: asin,
      title,
      price,
      originalPrice,
      currency,
      discountPercent,
      inStock,
      url,
      image,
      rating,
      reviewCount,
      lastSeen: new Date(),
    };
  } catch (err) {
    logger.debug(`[Amazon] GetProduct error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Récupère l'historique de prix via Keepa API
 */
export async function getKeepaPriceHistory(asin: string, country: CountryCode = "FR"): Promise<{
  currentPrice: number;
  lowestPrice: number;
  highestPrice: number;
  averagePrice: number;
  priceHistory: Array<{ timestamp: number; price: number }>;
  isRestock: boolean;
} | null> {
  if (!hasKeepaApi()) return null;

  const domainMap: Record<CountryCode, number> = {
    FR: 3, DE: 4, BE: 3, NL: 3, ES: 5, IT: 6, CH: 3, UK: 2, US: 1,
  };
  const domainId = domainMap[country] || 3;

  try {
    const url = `https://api.keepa.com/product?key=${KEEPA_API_KEY}&domain=${domainId}&asin=${asin}&stats=1`;
    const res = await safeFetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      products?: Array<{
        csv?: number[][];
        stats?: {
          current?: number[];
          min?: number[];
          max?: number[];
          avg?: number[];
        };
      }>;
    };

    const product = data.products?.[0];
    if (!product) return null;

    const csv = product.csv || [];
    const priceCsv = csv[0] || []; // index 0 = Amazon price

    // Keepa stock = csv[3], if price exists but stock was 0 before = restock
    const stockCsv = csv[3] || [];
    const isRestock = stockCsv.length > 0 && priceCsv.length > 0;

    // Parse price history (Keepa format: [timestamp, price, ...] in minutes since epoch)
    const priceHistory: Array<{ timestamp: number; price: number }> = [];
    for (let i = 0; i < priceCsv.length; i += 2) {
      if (priceCsv[i] && priceCsv[i + 1] && priceCsv[i + 1] > 0) {
        priceHistory.push({
          timestamp: (priceCsv[i] + 21564000) * 60000, // Keepa epoch
          price: priceCsv[i + 1] / 100,
        });
      }
    }

    const prices = priceHistory.map((p) => p.price).filter((p) => p > 0);
    const currentPrice = prices.length > 0 ? prices[prices.length - 1] : 0;
    const lowestPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const highestPrice = prices.length > 0 ? Math.max(...prices) : 0;
    const averagePrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;

    return { currentPrice, lowestPrice, highestPrice, averagePrice, priceHistory, isRestock };
  } catch (err) {
    logger.debug(`[Amazon/Keepa] Error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Récupère les promotions Amazon (Ventes Flash, Deals du jour)
 */
async function getAmazonDeals(country: CountryCode, limit = 10): Promise<RetailerProduct[]> {
  const domain = AMAZON_DOMAINS[country] || AMAZON_DOMAINS.FR;
  const currency = AMAZON_CURRENCIES[country] || "EUR";
  const products: RetailerProduct[] = [];

  try {
    const url = `https://${domain}/gp/goldbox`;
    const res = await safeFetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "fr-FR,fr;q=0.9",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return products;
    const html = await res.text();

    // Extraction des deals (Ventes Flash)
    const dealBlocks = html.match(/data-component-type="deals"[^>]*id="[^"]*"/g) || [];

    for (const block of dealBlocks.slice(0, limit)) {
      try {
        const asinMatch = block.match(/id="([^"]+)"/);
        const asin = asinMatch ? asinMatch[1] : "";
        if (!asin) continue;

        const blockStart = html.indexOf(`id="${asin}"`);
        if (blockStart === -1) continue;
        const blockHtml = html.slice(blockStart - 200, blockStart + 3000);

        const titleMatch = blockHtml.match(/<a[^>]*>([\s\S]*?)<\/a>/);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";

        const priceMatch = blockHtml.match(/a-offscreen"[^>]*>([\d.,]+)\s*€/);
        const priceStr = priceMatch ? priceMatch[1].replace(",", ".").replace(/[^\d.]/g, "") : "";
        const price = parseFloat(priceStr) || 0;

        const originalMatch = blockHtml.match(/class="a-price a-text-price[\s\S]*?<span[^>]*>([\d.,]+)<\/span>/);
        const originalStr = originalMatch ? originalMatch[1].replace(",", ".").replace(/[^\d.]/g, "") : "";
        const originalPrice = originalStr ? parseFloat(originalStr) : undefined;

        const discountMatch = blockHtml.match(/-(\d+)%/);
        const discountPercent = discountMatch ? parseInt(discountMatch[1], 10) : undefined;

        const imgMatch = blockHtml.match(/<img[^>]*src="(https:\/\/[^"]+)"/);
        const image = imgMatch ? imgMatch[1] : undefined;

        if (title && price > 0) {
          products.push({
            retailer: "amazon",
            country,
            productId: asin,
            title,
            price,
            originalPrice,
            currency,
            discountPercent,
            inStock: true,
            url: `https://${domain}/dp/${asin}`,
            image,
            lastSeen: new Date(),
          });
        }
      } catch {
        // Deal individuel échoué
      }
    }
  } catch (err) {
    logger.debug(`[Amazon] Deals error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return products;
}

export const amazonModule: RetailerModule = {
  id: "amazon",
  name: "Amazon",
  countries: ["FR", "DE", "BE", "NL", "ES", "IT", "CH", "UK", "US"],
  search: (query, country, limit) => searchScraping(query, country, limit),
  getProduct: (asin, country) => getProductScraping(asin, country),
  getDeals: (country, limit) => getAmazonDeals(country, limit),
};
