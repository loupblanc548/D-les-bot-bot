/**
 * dealAggregators.ts — Agrégateurs de deals communautaires
 *
 * Dealabs (FR), MyDealz (DE), HotUKDeals (UK), Slickdeals (US)
 * + Comparateurs : Idealo, Google Shopping, PriceSpy
 */

import logger from "../../utils/logger.js";
import { safeFetch } from "../../utils/ssrfGuard.js";
import Parser from "rss-parser";
import type { RetailerModule, RetailerProduct, RetailerSearchResult, CountryCode } from "./types.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const rssParser = new Parser({ timeout: 10000, headers: { "User-Agent": UA } });

function parsePrice(str: string): number {
  return parseFloat(str.replace(/[^\d,.]/g, "").replace(",", ".")) || 0;
}

// ─── Dealabs (FR) ───────────────────────────────────────────────────────────

async function searchDealabs(query: string, _country: CountryCode, limit = 10): Promise<RetailerSearchResult> {
  const products: RetailerProduct[] = [];
  try {
    const url = `https://www.dealabs.com/api/v2/threads?search_query=${encodeURIComponent(query)}&limit=${limit}`;
    const res = await safeFetch(url, {
      headers: { "User-Agent": UA, "Accept": "application/json", "Accept-Language": "fr-FR" },
      signal: AbortSignal.timeout(15000),
    });

    if (res.ok) {
      const data = (await res.json()) as {
        data?: Array<{
          thread_id?: number;
          title?: string;
          price?: number;
          temperature?: number;
          url?: string;
          image?: string;
        }>;
      };
      for (const deal of data.data || []) {
        products.push({
          retailer: "dealabs", country: "FR",
          productId: String(deal.thread_id || ""),
          title: deal.title || "",
          price: deal.price || 0,
          currency: "EUR",
          inStock: true,
          url: deal.url || `https://www.dealabs.com/discussion/${deal.thread_id}`,
          image: deal.image,
          lastSeen: new Date(),
        });
      }
    } else {
      // Fallback RSS
      const feed = await rssParser.parseURL(`https://www.dealabs.com/rss/`);
      for (const item of feed.items.slice(0, limit)) {
        const title = item.title || "";
        const priceMatch = title.match(/(\d+[.,]\d{2})\s*€/);
        const price = priceMatch ? parsePrice(priceMatch[1]) : 0;
        if (title) {
          products.push({
            retailer: "dealabs", country: "FR",
            productId: item.guid || item.link || "",
            title, price, currency: "EUR", inStock: true,
            url: item.link || "", lastSeen: new Date(),
          });
        }
      }
    }
  } catch (err) {
    logger.debug(`[Dealabs] Error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { products, retailer: "dealabs", totalFound: products.length, searchQuery: query };
}

export const dealabsModule: RetailerModule = {
  id: "dealabs", name: "Dealabs", countries: ["FR", "BE", "CH"],
  search: searchDealabs,
  getProduct: async () => null,
  getDeals: async (_country, limit = 20) => {
    const result = await searchDealabs("", "FR", limit);
    return result.products;
  },
};

// ─── MyDealz (DE) ───────────────────────────────────────────────────────────

async function searchMyDealz(query: string, _country: CountryCode, limit = 10): Promise<RetailerSearchResult> {
  const products: RetailerProduct[] = [];
  try {
    const feed = await rssParser.parseURL(`https://www.mydealz.de/rss/`);
    for (const item of feed.items.slice(0, limit)) {
      const title = item.title || "";
      const priceMatch = title.match(/(\d+[.,]\d{2})\s*€/);
      const price = priceMatch ? parsePrice(priceMatch[1]) : 0;
      if (title) {
        products.push({
          retailer: "mydealz", country: "DE",
          productId: item.guid || item.link || "",
          title, price, currency: "EUR", inStock: true,
          url: item.link || "", lastSeen: new Date(),
        });
      }
    }
  } catch (err) {
    logger.debug(`[MyDealz] Error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { products, retailer: "mydealz", totalFound: products.length, searchQuery: query };
}

export const mydealzModule: RetailerModule = {
  id: "mydealz", name: "MyDealz", countries: ["DE", "AT", "CH"],
  search: searchMyDealz,
  getProduct: async () => null,
  getDeals: async (_country, limit = 20) => {
    const result = await searchMyDealz("", "DE", limit);
    return result.products;
  },
};

// ─── HotUKDeals (UK) ────────────────────────────────────────────────────────

async function searchHotUKDeals(query: string, _country: CountryCode, limit = 10): Promise<RetailerSearchResult> {
  const products: RetailerProduct[] = [];
  try {
    const feed = await rssParser.parseURL(`https://www.hotukdeals.com/rss`);
    for (const item of feed.items.slice(0, limit)) {
      const title = item.title || "";
      const priceMatch = title.match(/£(\d+[.,]\d{2})/);
      const price = priceMatch ? parsePrice(priceMatch[1]) : 0;
      if (title) {
        products.push({
          retailer: "hotukdeals", country: "UK",
          productId: item.guid || item.link || "",
          title, price, currency: "GBP", inStock: true,
          url: item.link || "", lastSeen: new Date(),
        });
      }
    }
  } catch (err) {
    logger.debug(`[HotUKDeals] Error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { products, retailer: "hotukdeals", totalFound: products.length, searchQuery: query };
}

export const hotukdealsModule: RetailerModule = {
  id: "hotukdeals", name: "HotUKDeals", countries: ["UK"],
  search: searchHotUKDeals,
  getProduct: async () => null,
  getDeals: async (_country, limit = 20) => {
    const result = await searchHotUKDeals("", "UK", limit);
    return result.products;
  },
};

// ─── Idealo (FR, DE, ES, IT, CH) ────────────────────────────────────────────

async function searchIdealo(query: string, country: CountryCode, limit = 10): Promise<RetailerSearchResult> {
  const products: RetailerProduct[] = [];
  const domains: Record<string, string> = {
    FR: "www.idealo.fr", DE: "www.idealo.de", ES: "www.idealo.es",
    IT: "www.idealo.it", CH: "www.idealo.ch",
  };
  const domain = domains[country] || domains.FR;
  const currencies: Record<string, string> = { CH: "CHF", UK: "GBP" };

  try {
    const url = `https://${domain}/compare/offerList?searchQuery=${encodeURIComponent(query)}`;
    const res = await safeFetch(url, {
      headers: { "User-Agent": UA, "Accept": "application/json", "Accept-Language": "fr-FR" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { products, retailer: "idealo", totalFound: 0, searchQuery: query };
    const data = (await res.json()) as {
      offers?: Array<{
        title?: string;
        price?: { value?: number; currency?: string };
        shopName?: string;
        offerUrl?: string;
        imageUrl?: string;
      }>;
    };

    for (const offer of (data.offers || []).slice(0, limit)) {
      products.push({
        retailer: "idealo", country,
        productId: "",
        title: offer.title || "",
        price: offer.price?.value || 0,
        currency: offer.price?.currency || currencies[country] || "EUR",
        inStock: true,
        url: offer.offerUrl || "",
        image: offer.imageUrl,
        lastSeen: new Date(),
      });
    }
  } catch (err) {
    logger.debug(`[Idealo] Error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { products, retailer: "idealo", totalFound: products.length, searchQuery: query };
}

export const idealoModule: RetailerModule = {
  id: "idealo", name: "Idealo", countries: ["FR", "DE", "ES", "IT", "CH"],
  search: searchIdealo,
  getProduct: async (id, country) => (await searchIdealo(id, country, 1)).products[0] || null,
};

// ─── PriceSpy (FR, UK, DE, ES, IT) ──────────────────────────────────────────

async function searchPriceSpy(query: string, country: CountryCode, limit = 10): Promise<RetailerSearchResult> {
  const products: RetailerProduct[] = [];
  const domains: Record<string, string> = {
    FR: "www.pricespy.fr", UK: "www.pricespy.co.uk", DE: "www.pricespy.de",
    ES: "www.pricespy.es", IT: "www.pricespy.it",
  };
  const domain = domains[country] || domains.FR;
  const currencies: Record<string, string> = { UK: "GBP" };

  try {
    const url = `https://${domain}/search?search=${encodeURIComponent(query)}`;
    const res = await safeFetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { products, retailer: "pricespy", totalFound: 0, searchQuery: query };
    const html = await res.text();

    const blocks = html.match(/class="product[\s\S]*?(?=class="product|<div class="pagination)/g) || [];
    for (const block of blocks.slice(0, limit)) {
      const titleMatch = block.match(/<a[^>]*>([\s\S]*?)<\/a>/);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
      const priceMatch = block.match(/(\d+[.,]\d{2})\s*[€£]/);
      const price = priceMatch ? parsePrice(priceMatch[1]) : 0;
      const urlMatch = block.match(/href="([^"]+)"/);
      const imgMatch = block.match(/<img[^>]*src="([^"]+)"/);

      if (title && price > 0) {
        products.push({
          retailer: "pricespy", country,
          productId: "", title, price,
          currency: currencies[country] || "EUR",
          inStock: true,
          url: urlMatch ? `https://${domain}${urlMatch[1]}` : "",
          image: imgMatch?.[1], lastSeen: new Date(),
        });
      }
    }
  } catch (err) {
    logger.debug(`[PriceSpy] Error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { products, retailer: "pricespy", totalFound: products.length, searchQuery: query };
}

export const pricespyModule: RetailerModule = {
  id: "pricespy", name: "PriceSpy", countries: ["FR", "UK", "DE", "ES", "IT"],
  search: searchPriceSpy,
  getProduct: async (id, country) => (await searchPriceSpy(id, country, 1)).products[0] || null,
};
