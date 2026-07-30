/**
 * euRetailers.ts — Modules revendeurs EU (DE, BE, NL, ES, IT, CH)
 *
 * Alternate, Mindfactory, Caseking — tech hardware
 * Top Achat, Materiel.net — déjà dans frenchRetailers
 */

import logger from "../../utils/logger.js";
import { safeFetch } from "../../utils/ssrfGuard.js";
import type { RetailerModule, RetailerProduct, RetailerSearchResult, CountryCode } from "./types.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function parsePrice(str: string): number {
  return parseFloat(str.replace(/[^\d,.]/g, "").replace(",", ".")) || 0;
}

// ─── Alternate (DE, FR, NL, BE, ES) ─────────────────────────────────────────

async function searchAlternate(query: string, country: CountryCode, limit = 10): Promise<RetailerSearchResult> {
  const products: RetailerProduct[] = [];
  const domains: Record<string, string> = {
    FR: "www.alternate.fr", DE: "www.alternate.de", NL: "www.alternate.nl",
    BE: "www.alternate.be", ES: "www.alternate.es",
  };
  const domain = domains[country] || domains.FR;
  const currencies: Record<string, string> = { CH: "CHF" };

  try {
    const url = `https://${domain}/search?q=${encodeURIComponent(query)}`;
    const res = await safeFetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { products, retailer: "alternate", totalFound: 0, searchQuery: query };
    const html = await res.text();

    const blocks = html.match(/class="listRow[\s\S]*?(?=class="listRow|<div class="pagination)/g) || [];
    for (const block of blocks.slice(0, limit)) {
      const titleMatch = block.match(/<a[^>]*class="[^"]*product[^"]*"[^>]*>([\s\S]*?)<\/a>/) || block.match(/title="([^"]+)"/);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
      const priceMatch = block.match(/class="price[^"]*"[^>]*>[\s\S]*?([\d.,]+)/) || block.match(/(\d+[.,]\d{2})\s*€/);
      const price = priceMatch ? parsePrice(priceMatch[1]) : 0;
      const urlMatch = block.match(/href="([^"]*product[^"]*)"/);
      const imgMatch = block.match(/<img[^>]*src="([^"]+)"/);

      if (title && price > 0) {
        products.push({
          retailer: "alternate", country,
          productId: "", title, price,
          currency: currencies[country] || "EUR",
          inStock: true,
          url: urlMatch ? `https://${domain}${urlMatch[1]}` : "",
          image: imgMatch?.[1], lastSeen: new Date(),
        });
      }
    }
  } catch (err) {
    logger.debug(`[Alternate] Error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { products, retailer: "alternate", totalFound: products.length, searchQuery: query };
}

export const alternateModule: RetailerModule = {
  id: "alternate", name: "Alternate", countries: ["FR", "DE", "NL", "BE", "ES"],
  search: searchAlternate,
  getProduct: async (id, country) => (await searchAlternate(id, country, 1)).products[0] || null,
};

// ─── Mindfactory (DE) ───────────────────────────────────────────────────────

async function searchMindfactory(query: string, _country: CountryCode, limit = 10): Promise<RetailerSearchResult> {
  const products: RetailerProduct[] = [];
  try {
    const url = `https://www.mindfactory.de/search_result.php?search_query=${encodeURIComponent(query)}`;
    const res = await safeFetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "de-DE,de;q=0.9" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { products, retailer: "mindfactory", totalFound: 0, searchQuery: query };
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
          retailer: "mindfactory", country: "DE", productId: "",
          title, price, currency: "EUR", inStock: true,
          url: urlMatch ? `https://www.mindfactory.de${urlMatch[1]}` : "",
          image: imgMatch?.[1], lastSeen: new Date(),
        });
      }
    }
  } catch (err) {
    logger.debug(`[Mindfactory] Error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { products, retailer: "mindfactory", totalFound: products.length, searchQuery: query };
}

export const mindfactoryModule: RetailerModule = {
  id: "mindfactory", name: "Mindfactory", countries: ["DE"],
  search: searchMindfactory,
  getProduct: async (id) => (await searchMindfactory(id, "DE", 1)).products[0] || null,
};

// ─── Caseking (DE) ──────────────────────────────────────────────────────────

async function searchCaseking(query: string, _country: CountryCode, limit = 10): Promise<RetailerSearchResult> {
  const products: RetailerProduct[] = [];
  try {
    const url = `https://www.caseking.de/search?search=${encodeURIComponent(query)}`;
    const res = await safeFetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "de-DE,de;q=0.9" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { products, retailer: "caseking", totalFound: 0, searchQuery: query };
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
          retailer: "caseking", country: "DE", productId: "",
          title, price, currency: "EUR", inStock: true,
          url: urlMatch ? `https://www.caseking.de${urlMatch[1]}` : "",
          image: imgMatch?.[1], lastSeen: new Date(),
        });
      }
    }
  } catch (err) {
    logger.debug(`[Caseking] Error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { products, retailer: "caseking", totalFound: products.length, searchQuery: query };
}

export const casekingModule: RetailerModule = {
  id: "caseking", name: "Caseking", countries: ["DE"],
  search: searchCaseking,
  getProduct: async (id) => (await searchCaseking(id, "DE", 1)).products[0] || null,
};
