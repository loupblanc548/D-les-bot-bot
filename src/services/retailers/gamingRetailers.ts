/**
 * gamingRetailers.ts — Revendeurs gaming clés/CD
 *
 * CDKeys, Fanatical, Eneba, Kinguin, G2A, Gamesplanet, Shopto, Base.com, 365games
 */

import logger from "../../utils/logger.js";
import { safeFetch } from "../../utils/ssrfGuard.js";
import type { RetailerModule, RetailerProduct, RetailerSearchResult, CountryCode } from "./types.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function parsePrice(str: string): number {
  return parseFloat(str.replace(/[^\d,.]/g, "").replace(",", ".")) || 0;
}

// ─── CDKeys ─────────────────────────────────────────────────────────────────

async function searchCDKeys(query: string, _country: CountryCode, limit = 10): Promise<RetailerSearchResult> {
  const products: RetailerProduct[] = [];
  try {
    const url = `https://www.cdkeys.com/?q=${encodeURIComponent(query)}`;
    const res = await safeFetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { products, retailer: "cdkeys", totalFound: 0, searchQuery: query };
    const html = await res.text();

    const blocks = html.match(/class="product[\s\S]*?(?=class="product|<div class="pagination)/g) || [];
    for (const block of blocks.slice(0, limit)) {
      const titleMatch = block.match(/<a[^>]*>([\s\S]*?)<\/a>/);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
      const priceMatch = block.match(/class="price[^"]*"[^>]*>[\s\S]*?([\d.,]+)/) || block.match(/(\d+[.,]\d{2})\s*[€£]/);
      const price = priceMatch ? parsePrice(priceMatch[1]) : 0;
      const urlMatch = block.match(/href="([^"]+)"/);
      const imgMatch = block.match(/<img[^>]*src="([^"]+)"/);

      if (title && price > 0) {
        products.push({
          retailer: "cdkeys", country: "FR",
          productId: "", title, price, currency: "EUR", inStock: true,
          url: urlMatch ? `https://www.cdkeys.com${urlMatch[1]}` : "",
          image: imgMatch?.[1], lastSeen: new Date(),
        });
      }
    }
  } catch (err) {
    logger.debug(`[CDKeys] Error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { products, retailer: "cdkeys", totalFound: products.length, searchQuery: query };
}

export const cdkeysModule: RetailerModule = {
  id: "cdkeys", name: "CDKeys", countries: ["FR", "DE", "BE", "NL", "ES", "IT", "CH", "UK", "US"],
  search: searchCDKeys,
  getProduct: async (id) => (await searchCDKeys(id, "FR", 1)).products[0] || null,
};

// ─── Fanatical ──────────────────────────────────────────────────────────────

async function searchFanatical(query: string, _country: CountryCode, limit = 10): Promise<RetailerSearchResult> {
  const products: RetailerProduct[] = [];
  try {
    const url = `https://www.fanatical.com/api/products?search=${encodeURIComponent(query)}&limit=${limit}`;
    const res = await safeFetch(url, {
      headers: { "User-Agent": UA, "Accept": "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { products, retailer: "fanatical", totalFound: 0, searchQuery: query };
    const data = (await res.json()) as {
      products?: Array<{
        id?: string;
        name?: string;
        currentPrice?: number;
        originalPrice?: number;
        image?: string;
        url?: string;
      }>;
    };

    for (const item of (data.products || []).slice(0, limit)) {
      products.push({
        retailer: "fanatical", country: "FR",
        productId: item.id || "",
        title: item.name || "",
        price: item.currentPrice || 0,
        originalPrice: item.originalPrice,
        currency: "EUR",
        discountPercent: item.originalPrice && item.currentPrice
          ? Math.round(((item.originalPrice - item.currentPrice) / item.originalPrice) * 100)
          : undefined,
        inStock: true,
        url: item.url || `https://www.fanatical.com/${item.url || ""}`,
        image: item.image,
        lastSeen: new Date(),
      });
    }
  } catch (err) {
    logger.debug(`[Fanatical] Error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { products, retailer: "fanatical", totalFound: products.length, searchQuery: query };
}

export const fanaticalModule: RetailerModule = {
  id: "fanatical", name: "Fanatical", countries: ["FR", "DE", "BE", "NL", "ES", "IT", "CH", "UK", "US"],
  search: searchFanatical,
  getProduct: async (id) => (await searchFanatical(id, "FR", 1)).products[0] || null,
};

// ─── Eneba ──────────────────────────────────────────────────────────────────

async function searchEneba(query: string, _country: CountryCode, limit = 10): Promise<RetailerSearchResult> {
  const products: RetailerProduct[] = [];
  try {
    const url = `https://www.eneba.com/fr/store/search?text=${encodeURIComponent(query)}`;
    const res = await safeFetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { products, retailer: "eneba", totalFound: 0, searchQuery: query };
    const html = await res.text();

    const blocks = html.match(/data-product="[^"]*"[\s\S]*?(?=<\/article>|<\/div>)/g) || [];
    for (const block of blocks.slice(0, limit)) {
      const titleMatch = block.match(/<a[^>]*>([\s\S]*?)<\/a>/);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
      const priceMatch = block.match(/(\d+[.,]\d{2})\s*€/);
      const price = priceMatch ? parsePrice(priceMatch[1]) : 0;
      const urlMatch = block.match(/href="([^"]+)"/);
      const imgMatch = block.match(/<img[^>]*src="([^"]+)"/);

      if (title && price > 0) {
        products.push({
          retailer: "eneba", country: "FR",
          productId: "", title, price, currency: "EUR", inStock: true,
          url: urlMatch ? `https://www.eneba.com${urlMatch[1]}` : "",
          image: imgMatch?.[1], lastSeen: new Date(),
        });
      }
    }
  } catch (err) {
    logger.debug(`[Eneba] Error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { products, retailer: "eneba", totalFound: products.length, searchQuery: query };
}

export const enebaModule: RetailerModule = {
  id: "eneba", name: "Eneba", countries: ["FR", "DE", "BE", "NL", "ES", "IT", "CH", "UK", "US"],
  search: searchEneba,
  getProduct: async (id) => (await searchEneba(id, "FR", 1)).products[0] || null,
};

// ─── Kinguin ────────────────────────────────────────────────────────────────

async function searchKinguin(query: string, _country: CountryCode, limit = 10): Promise<RetailerSearchResult> {
  const products: RetailerProduct[] = [];
  try {
    const url = `https://www.kinguin.net/fr/catalog?search=${encodeURIComponent(query)}`;
    const res = await safeFetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { products, retailer: "kinguin", totalFound: 0, searchQuery: query };
    const html = await res.text();

    const blocks = html.match(/class="product[\s\S]*?(?=class="product|<div class="pagination)/g) || [];
    for (const block of blocks.slice(0, limit)) {
      const titleMatch = block.match(/<a[^>]*>([\s\S]*?)<\/a>/);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
      const priceMatch = block.match(/(\d+[.,]\d{2})\s*€/);
      const price = priceMatch ? parsePrice(priceMatch[1]) : 0;
      const urlMatch = block.match(/href="([^"]+)"/);
      const imgMatch = block.match(/<img[^>]*src="([^"]+)"/);

      if (title && price > 0) {
        products.push({
          retailer: "kinguin", country: "FR",
          productId: "", title, price, currency: "EUR", inStock: true,
          url: urlMatch ? `https://www.kinguin.net${urlMatch[1]}` : "",
          image: imgMatch?.[1], lastSeen: new Date(),
        });
      }
    }
  } catch (err) {
    logger.debug(`[Kinguin] Error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { products, retailer: "kinguin", totalFound: products.length, searchQuery: query };
}

export const kinguinModule: RetailerModule = {
  id: "kinguin", name: "Kinguin", countries: ["FR", "DE", "BE", "NL", "ES", "IT", "CH", "UK", "US"],
  search: searchKinguin,
  getProduct: async (id) => (await searchKinguin(id, "FR", 1)).products[0] || null,
};

// ─── G2A ────────────────────────────────────────────────────────────────────

async function searchG2A(query: string, _country: CountryCode, limit = 10): Promise<RetailerSearchResult> {
  const products: RetailerProduct[] = [];
  try {
    const url = `https://www.g2a.com/search?query=${encodeURIComponent(query)}`;
    const res = await safeFetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { products, retailer: "g2a", totalFound: 0, searchQuery: query };
    const html = await res.text();

    const blocks = html.match(/class="product[\s\S]*?(?=class="product|<div class="pagination)/g) || [];
    for (const block of blocks.slice(0, limit)) {
      const titleMatch = block.match(/<a[^>]*>([\s\S]*?)<\/a>/);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
      const priceMatch = block.match(/(\d+[.,]\d{2})\s*€/);
      const price = priceMatch ? parsePrice(priceMatch[1]) : 0;
      const urlMatch = block.match(/href="([^"]+)"/);
      const imgMatch = block.match(/<img[^>]*src="([^"]+)"/);

      if (title && price > 0) {
        products.push({
          retailer: "g2a", country: "FR",
          productId: "", title, price, currency: "EUR", inStock: true,
          url: urlMatch ? `https://www.g2a.com${urlMatch[1]}` : "",
          image: imgMatch?.[1], lastSeen: new Date(),
        });
      }
    }
  } catch (err) {
    logger.debug(`[G2A] Error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { products, retailer: "g2a", totalFound: products.length, searchQuery: query };
}

export const g2aModule: RetailerModule = {
  id: "g2a", name: "G2A", countries: ["FR", "DE", "BE", "NL", "ES", "IT", "CH", "UK", "US"],
  search: searchG2A,
  getProduct: async (id) => (await searchG2A(id, "FR", 1)).products[0] || null,
};

// ─── Shopto ─────────────────────────────────────────────────────────────────

async function searchShopto(query: string, _country: CountryCode, limit = 10): Promise<RetailerSearchResult> {
  const products: RetailerProduct[] = [];
  try {
    const url = `https://www.shopto.net/search?search_query=${encodeURIComponent(query)}`;
    const res = await safeFetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "en-GB,en;q=0.9" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { products, retailer: "shopto", totalFound: 0, searchQuery: query };
    const html = await res.text();

    const blocks = html.match(/class="product[\s\S]*?(?=class="product|<div class="pagination)/g) || [];
    for (const block of blocks.slice(0, limit)) {
      const titleMatch = block.match(/<a[^>]*>([\s\S]*?)<\/a>/);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
      const priceMatch = block.match(/£(\d+[.,]\d{2})/);
      const price = priceMatch ? parsePrice(priceMatch[1]) : 0;
      const urlMatch = block.match(/href="([^"]+)"/);
      const imgMatch = block.match(/<img[^>]*src="([^"]+)"/);

      if (title && price > 0) {
        products.push({
          retailer: "shopto", country: "UK",
          productId: "", title, price, currency: "GBP", inStock: true,
          url: urlMatch ? `https://www.shopto.net${urlMatch[1]}` : "",
          image: imgMatch?.[1], lastSeen: new Date(),
        });
      }
    }
  } catch (err) {
    logger.debug(`[Shopto] Error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { products, retailer: "shopto", totalFound: products.length, searchQuery: query };
}

export const shoptoModule: RetailerModule = {
  id: "shopto", name: "Shopto", countries: ["FR", "DE", "BE", "NL", "ES", "IT", "CH", "UK"],
  search: searchShopto,
  getProduct: async (id) => (await searchShopto(id, "UK", 1)).products[0] || null,
};

// ─── 365games ───────────────────────────────────────────────────────────────

async function search365Games(query: string, _country: CountryCode, limit = 10): Promise<RetailerSearchResult> {
  const products: RetailerProduct[] = [];
  try {
    const url = `https://www.365games.co.uk/search.php?search_query=${encodeURIComponent(query)}`;
    const res = await safeFetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "en-GB,en;q=0.9" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { products, retailer: "365games", totalFound: 0, searchQuery: query };
    const html = await res.text();

    const blocks = html.match(/class="product[\s\S]*?(?=class="product|<div class="pagination)/g) || [];
    for (const block of blocks.slice(0, limit)) {
      const titleMatch = block.match(/<a[^>]*>([\s\S]*?)<\/a>/);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
      const priceMatch = block.match(/£(\d+[.,]\d{2})/);
      const price = priceMatch ? parsePrice(priceMatch[1]) : 0;
      const urlMatch = block.match(/href="([^"]+)"/);
      const imgMatch = block.match(/<img[^>]*src="([^"]+)"/);

      if (title && price > 0) {
        products.push({
          retailer: "365games", country: "UK",
          productId: "", title, price, currency: "GBP", inStock: true,
          url: urlMatch ? `https://www.365games.co.uk${urlMatch[1]}` : "",
          image: imgMatch?.[1], lastSeen: new Date(),
        });
      }
    }
  } catch (err) {
    logger.debug(`[365games] Error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { products, retailer: "365games", totalFound: products.length, searchQuery: query };
}

export const games365Module: RetailerModule = {
  id: "365games", name: "365games", countries: ["FR", "DE", "BE", "NL", "ES", "IT", "CH", "UK"],
  search: search365Games,
  getProduct: async (id) => (await search365Games(id, "UK", 1)).products[0] || null,
};

// ─── Base.com ───────────────────────────────────────────────────────────────

async function searchBaseCom(query: string, _country: CountryCode, limit = 10): Promise<RetailerSearchResult> {
  const products: RetailerProduct[] = [];
  try {
    const url = `https://www.base.com/search?q=${encodeURIComponent(query)}`;
    const res = await safeFetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "en-GB,en;q=0.9" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { products, retailer: "basecom", totalFound: 0, searchQuery: query };
    const html = await res.text();

    const blocks = html.match(/class="product[\s\S]*?(?=class="product|<div class="pagination)/g) || [];
    for (const block of blocks.slice(0, limit)) {
      const titleMatch = block.match(/<a[^>]*>([\s\S]*?)<\/a>/);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
      const priceMatch = block.match(/£(\d+[.,]\d{2})/);
      const price = priceMatch ? parsePrice(priceMatch[1]) : 0;
      const urlMatch = block.match(/href="([^"]+)"/);
      const imgMatch = block.match(/<img[^>]*src="([^"]+)"/);

      if (title && price > 0) {
        products.push({
          retailer: "basecom", country: "UK",
          productId: "", title, price, currency: "GBP", inStock: true,
          url: urlMatch ? `https://www.base.com${urlMatch[1]}` : "",
          image: imgMatch?.[1], lastSeen: new Date(),
        });
      }
    }
  } catch (err) {
    logger.debug(`[Base.com] Error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { products, retailer: "basecom", totalFound: products.length, searchQuery: query };
}

export const basecomModule: RetailerModule = {
  id: "basecom", name: "Base.com", countries: ["FR", "DE", "BE", "NL", "ES", "IT", "CH", "UK"],
  search: searchBaseCom,
  getProduct: async (id) => (await searchBaseCom(id, "UK", 1)).products[0] || null,
};

// ─── Gamesplanet ────────────────────────────────────────────────────────────

async function searchGamesplanet(query: string, country: CountryCode, limit = 10): Promise<RetailerSearchResult> {
  const products: RetailerProduct[] = [];
  const domains: Record<string, string> = {
    FR: "fr.gamesplanet.com", DE: "de.gamesplanet.com", UK: "uk.gamesplanet.com",
    ES: "es.gamesplanet.com", IT: "it.gamesplanet.com",
  };
  const domain = domains[country] || domains.FR;

  try {
    const url = `https://${domain}/search?search=${encodeURIComponent(query)}`;
    const res = await safeFetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { products, retailer: "gamesplanet", totalFound: 0, searchQuery: query };
    const html = await res.text();

    const blocks = html.match(/class="product[\s\S]*?(?=class="product|<div class="pagination)/g) || [];
    for (const block of blocks.slice(0, limit)) {
      const titleMatch = block.match(/<a[^>]*>([\s\S]*?)<\/a>/);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
      const priceMatch = block.match(/(\d+[.,]\d{2})\s*€/);
      const price = priceMatch ? parsePrice(priceMatch[1]) : 0;
      const urlMatch = block.match(/href="([^"]+)"/);
      const imgMatch = block.match(/<img[^>]*src="([^"]+)"/);

      if (title && price > 0) {
        products.push({
          retailer: "gamesplanet", country,
          productId: "", title, price, currency: "EUR", inStock: true,
          url: urlMatch ? `https://${domain}${urlMatch[1]}` : "",
          image: imgMatch?.[1], lastSeen: new Date(),
        });
      }
    }
  } catch (err) {
    logger.debug(`[Gamesplanet] Error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { products, retailer: "gamesplanet", totalFound: products.length, searchQuery: query };
}

export const gamesplanetModule: RetailerModule = {
  id: "gamesplanet", name: "Gamesplanet", countries: ["FR", "DE", "ES", "IT", "UK"],
  search: searchGamesplanet,
  getProduct: async (id, country) => (await searchGamesplanet(id, country, 1)).products[0] || null,
};
