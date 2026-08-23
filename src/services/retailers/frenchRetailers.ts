/**
 * frenchRetailers.ts — Modules revendeurs français
 *
 * Cdiscount, Fnac, Darty, Boulanger, LDLC, Top Achat, Materiel.net,
 * Rakuten France, La Redoute, Decathlon, IKEA France, Zalando FR,
 * Back Market, Vinted, Leboncoin
 */

import logger from "../../utils/logger.js";
import { safeFetch } from "../../utils/ssrfGuard.js";
import type { RetailerModule, RetailerProduct, RetailerSearchResult, CountryCode } from "./types.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function parsePrice(str: string): number {
  return parseFloat(str.replace(/[^\d,.]/g, "").replace(",", ".")) || 0;
}

// ─── Cdiscount ─────────────────────────────────────────────────────────────

async function searchCdiscount(query: string, _country: CountryCode, limit = 10): Promise<RetailerSearchResult> {
  const products: RetailerProduct[] = [];
  try {
    const url = `https://www.cdiscount.com/s/10/${encodeURIComponent(query)}.html`;
    const res = await safeFetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { products, retailer: "cdiscount", totalFound: 0, searchQuery: query };
    const html = await res.text();

    const blocks = html.match(/data-sku="[^"]*"[\s\S]*?(?=<\/li>|<\/div>)/g) || [];
    for (const block of blocks.slice(0, limit)) {
      const titleMatch = block.match(/<a[^>]*class="[^"]*jsProductTitleLink[^"]*"[^>]*>([\s\S]*?)<\/a>/) || block.match(/title="([^"]+)"/);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
      const priceMatch = block.match(/class="[^"]*price[^"]*"[^>]*>[\s\S]*?([\d.,]+)/) || block.match(/(\d+[.,]\d{2})\s*€/);
      const price = priceMatch ? parsePrice(priceMatch[1]) : 0;
      const urlMatch = block.match(/href="([^"]*fiche[^"]*)"/) || block.match(/href="([^"]+)"/);
      const imgMatch = block.match(/<img[^>]*src="([^"]+\.jpg[^"]*)"/);
      const skuMatch = block.match(/data-sku="([^"]+)"/);

      if (title && price > 0) {
        products.push({
          retailer: "cdiscount", country: "FR", productId: skuMatch?.[1] || "",
          title, price, currency: "EUR", inStock: true,
          url: urlMatch ? `https://www.cdiscount.com${urlMatch[1]}` : "",
          image: imgMatch?.[1], lastSeen: new Date(),
        });
      }
    }
  } catch (err) {
    logger.debug(`[Cdiscount] Error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { products, retailer: "cdiscount", totalFound: products.length, searchQuery: query };
}

export const cdiscountModule: RetailerModule = {
  id: "cdiscount", name: "Cdiscount", countries: ["FR"],
  search: searchCdiscount,
  getProduct: async (id) => (await searchCdiscount(id, "FR", 1)).products[0] || null,
};

// ─── Fnac ───────────────────────────────────────────────────────────────────

async function searchFnac(query: string, _country: CountryCode, limit = 10): Promise<RetailerSearchResult> {
  const products: RetailerProduct[] = [];
  try {
    const url = `https://www.fnac.com/SearchResult/ResultList.aspx?Search=${encodeURIComponent(query)}&sft=1&sa=0`;
    const res = await safeFetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { products, retailer: "fnac", totalFound: 0, searchQuery: query };
    const html = await res.text();

    const blocks = html.match(/class="Article-item[\s\S]*?(?=class="Article-item|<div class="pagination)/g) || [];
    for (const block of blocks.slice(0, limit)) {
      const titleMatch = block.match(/class="Article-title[^"]*"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
      const priceMatch = block.match(/class="userPrice[^"]*"[^>]*>[\s\S]*?([\d.,]+)/) || block.match(/(\d+[.,]\d{2})\s*€/);
      const price = priceMatch ? parsePrice(priceMatch[1]) : 0;
      const urlMatch = block.match(/href="([^"]*p[^"]*)"/);
      const imgMatch = block.match(/<img[^>]*src="([^"]+\.jpg[^"]*)"/) || block.match(/data-src="([^"]+)"/);
      const idMatch = urlMatch?.[1].match(/p-([a-z0-9]+)/i);

      if (title && price > 0) {
        products.push({
          retailer: "fnac", country: "FR", productId: idMatch?.[1] || "",
          title, price, currency: "EUR", inStock: true,
          url: urlMatch ? `https://www.fnac.com${urlMatch[1]}` : "",
          image: imgMatch?.[1], lastSeen: new Date(),
        });
      }
    }
  } catch (err) {
    logger.debug(`[Fnac] Error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { products, retailer: "fnac", totalFound: products.length, searchQuery: query };
}

export const fnacModule: RetailerModule = {
  id: "fnac", name: "Fnac", countries: ["FR", "BE", "ES", "CH"],
  search: searchFnac,
  getProduct: async (id) => (await searchFnac(id, "FR", 1)).products[0] || null,
};

// ─── Darty ──────────────────────────────────────────────────────────────────

async function searchDarty(query: string, _country: CountryCode, limit = 10): Promise<RetailerSearchResult> {
  const products: RetailerProduct[] = [];
  try {
    const url = `https://www.darty.com/nav/recherche?text=${encodeURIComponent(query)}`;
    const res = await safeFetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { products, retailer: "darty", totalFound: 0, searchQuery: query };
    const html = await res.text();

    const blocks = html.match(/class="product[\s\S]*?(?=class="product|<div class="pagination)/g) || [];
    for (const block of blocks.slice(0, limit)) {
      const titleMatch = block.match(/class="[^"]*product_name[^"]*"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/) || block.match(/title="([^"]+)"/);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
      const priceMatch = block.match(/class="darty_prix[^"]*"[^>]*>[\s\S]*?([\d.,]+)/) || block.match(/(\d+[.,]\d{2})\s*€/);
      const price = priceMatch ? parsePrice(priceMatch[1]) : 0;
      const urlMatch = block.match(/href="([^"]*produit[^"]*)"/);
      const imgMatch = block.match(/<img[^>]*src="([^"]+)"/);

      if (title && price > 0) {
        products.push({
          retailer: "darty", country: "FR", productId: "",
          title, price, currency: "EUR", inStock: true,
          url: urlMatch ? `https://www.darty.com${urlMatch[1]}` : "",
          image: imgMatch?.[1], lastSeen: new Date(),
        });
      }
    }
  } catch (err) {
    logger.debug(`[Darty] Error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { products, retailer: "darty", totalFound: products.length, searchQuery: query };
}

export const dartyModule: RetailerModule = {
  id: "darty", name: "Darty", countries: ["FR", "BE"],
  search: searchDarty,
  getProduct: async (id) => (await searchDarty(id, "FR", 1)).products[0] || null,
};

// ─── Boulanger ──────────────────────────────────────────────────────────────

async function searchBoulanger(query: string, _country: CountryCode, limit = 10): Promise<RetailerSearchResult> {
  const products: RetailerProduct[] = [];
  try {
    const url = `https://www.boulanger.com/resultats?tr=${encodeURIComponent(query)}`;
    const res = await safeFetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { products, retailer: "boulanger", totalFound: 0, searchQuery: query };
    const html = await res.text();

    const blocks = html.match(/data-product-id="[^"]*"[\s\S]*?(?=<\/article>|<\/li>)/g) || [];
    for (const block of blocks.slice(0, limit)) {
      const titleMatch = block.match(/<a[^>]*class="[^"]*product[^"]*"[^>]*title="([^"]+)"/) || block.match(/title="([^"]+)"/);
      const title = titleMatch ? titleMatch[1].trim() : "";
      const priceMatch = block.match(/class="[^"]*price[^"]*"[^>]*>[\s\S]*?([\d.,]+)/) || block.match(/(\d+[.,]\d{2})\s*€/);
      const price = priceMatch ? parsePrice(priceMatch[1]) : 0;
      const urlMatch = block.match(/href="([^"]*produit[^"]*)"/);
      const imgMatch = block.match(/<img[^>]*src="([^"]+)"/);

      if (title && price > 0) {
        products.push({
          retailer: "boulanger", country: "FR", productId: "",
          title, price, currency: "EUR", inStock: true,
          url: urlMatch ? `https://www.boulanger.com${urlMatch[1]}` : "",
          image: imgMatch?.[1], lastSeen: new Date(),
        });
      }
    }
  } catch (err) {
    logger.debug(`[Boulanger] Error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { products, retailer: "boulanger", totalFound: products.length, searchQuery: query };
}

export const boulangerModule: RetailerModule = {
  id: "boulanger", name: "Boulanger", countries: ["FR", "BE"],
  search: searchBoulanger,
  getProduct: async (id) => (await searchBoulanger(id, "FR", 1)).products[0] || null,
};

// ─── LDLC ───────────────────────────────────────────────────────────────────

async function searchLDLC(query: string, _country: CountryCode, limit = 10): Promise<RetailerSearchResult> {
  const products: RetailerProduct[] = [];
  try {
    const url = `https://www.ldlc.com/recherche/${encodeURIComponent(query)}/`;
    const res = await safeFetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { products, retailer: "ldlc", totalFound: 0, searchQuery: query };
    const html = await res.text();

    const blocks = html.match(/class="[^"]*product[\s\S]*?(?=class="[^"]*product|<div class="pagination)/g) || [];
    for (const block of blocks.slice(0, limit)) {
      const titleMatch = block.match(/<a[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/a>/) || block.match(/title="([^"]+)"/);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
      const priceMatch = block.match(/class="[^"]*price[^"]*"[^>]*>[\s\S]*?([\d.,]+)/) || block.match(/(\d+[.,]\d{2})\s*€/);
      const price = priceMatch ? parsePrice(priceMatch[1]) : 0;
      const urlMatch = block.match(/href="([^"]*fiche[^"]*)"/);
      const imgMatch = block.match(/<img[^>]*src="([^"]+)"/);

      if (title && price > 0) {
        products.push({
          retailer: "ldlc", country: "FR", productId: "",
          title, price, currency: "EUR", inStock: true,
          url: urlMatch ? `https://www.ldlc.com${urlMatch[1]}` : "",
          image: imgMatch?.[1], lastSeen: new Date(),
        });
      }
    }
  } catch (err) {
    logger.debug(`[LDLC] Error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { products, retailer: "ldlc", totalFound: products.length, searchQuery: query };
}

export const ldlcModule: RetailerModule = {
  id: "ldlc", name: "LDLC", countries: ["FR", "BE", "ES", "IT", "CH"],
  search: searchLDLC,
  getProduct: async (id) => (await searchLDLC(id, "FR", 1)).products[0] || null,
};

// ─── Decathlon ──────────────────────────────────────────────────────────────

async function searchDecathlon(query: string, country: CountryCode, limit = 10): Promise<RetailerSearchResult> {
  const products: RetailerProduct[] = [];
  const domains: Record<string, string> = {
    FR: "www.decathlon.fr", DE: "www.decathlon.de", ES: "www.decathlon.es",
    NL: "www.decathlon.nl", BE: "www.decathlon.be", IT: "www.decathlon.it",
    CH: "www.decathlon.ch",
  };
  const domain = domains[country] || domains.FR;

  try {
    const url = `https://${domain}/search?search=${encodeURIComponent(query)}`;
    const res = await safeFetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { products, retailer: "decathlon", totalFound: 0, searchQuery: query };
    const html = await res.text();

    // Decathlon utilise du JSON embarqué
    const jsonMatch = html.match(/__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[1]);
        const items = data?.props?.pageProps?.products || [];
        for (const item of items.slice(0, limit)) {
          products.push({
            retailer: "decathlon", country,
            productId: String(item.id || ""),
            title: item.title || item.name || "",
            price: item.price || 0,
            currency: country === "CH" ? "CHF" : "EUR",
            inStock: item.inStock !== false,
            url: `https://${domain}/${item.slug || item.id}`,
            image: item.image,
            lastSeen: new Date(),
          });
        }
      } catch { logger.error("[Silent catch]"); }
    }
  } catch (err) {
    logger.debug(`[Decathlon] Error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { products, retailer: "decathlon", totalFound: products.length, searchQuery: query };
}

export const decathlonModule: RetailerModule = {
  id: "decathlon", name: "Decathlon", countries: ["FR", "DE", "BE", "NL", "ES", "IT", "CH"],
  search: searchDecathlon,
  getProduct: async (id, country) => (await searchDecathlon(id, country, 1)).products[0] || null,
};

// ─── Back Market ────────────────────────────────────────────────────────────

async function searchBackMarket(query: string, country: CountryCode, limit = 10): Promise<RetailerSearchResult> {
  const products: RetailerProduct[] = [];
  const domains: Record<string, string> = {
    FR: "www.backmarket.fr", DE: "www.backmarket.de", ES: "www.backmarket.es",
    IT: "www.backmarket.it", NL: "www.backmarket.nl", BE: "www.backmarket.be",
  };
  const domain = domains[country] || domains.FR;

  try {
    const url = `https://${domain}/fr-fr/search?q=${encodeURIComponent(query)}`;
    const res = await safeFetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { products, retailer: "backmarket", totalFound: 0, searchQuery: query };
    const html = await res.text();

    const blocks = html.match(/data-product="[^"]*"[\s\S]*?(?=<\/article>|<\/div>)/g) || [];
    for (const block of blocks.slice(0, limit)) {
      const titleMatch = block.match(/<a[^>]*>([\s\S]*?)<\/a>/);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
      const priceMatch = block.match(/class="[^"]*price[^"]*"[^>]*>[\s\S]*?([\d.,]+)/) || block.match(/(\d+[.,]\d{2})\s*€/);
      const price = priceMatch ? parsePrice(priceMatch[1]) : 0;
      const urlMatch = block.match(/href="([^"]+)"/);
      const imgMatch = block.match(/<img[^>]*src="([^"]+)"/);

      if (title && price > 0) {
        products.push({
          retailer: "backmarket", country,
          productId: "", title, price, currency: "EUR", inStock: true,
          url: urlMatch ? `https://${domain}${urlMatch[1]}` : "",
          image: imgMatch?.[1], lastSeen: new Date(),
        });
      }
    }
  } catch (err) {
    logger.debug(`[BackMarket] Error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { products, retailer: "backmarket", totalFound: products.length, searchQuery: query };
}

export const backmarketModule: RetailerModule = {
  id: "backmarket", name: "Back Market", countries: ["FR", "DE", "BE", "NL", "ES", "IT"],
  search: searchBackMarket,
  getProduct: async (id, country) => (await searchBackMarket(id, country, 1)).products[0] || null,
};

// ─── Vinted ─────────────────────────────────────────────────────────────────

async function searchVinted(query: string, country: CountryCode, limit = 10): Promise<RetailerSearchResult> {
  const products: RetailerProduct[] = [];
  const domains: Record<string, string> = {
    FR: "www.vinted.fr", DE: "www.vinted.de", BE: "www.vinted.be",
    NL: "www.vinted.nl", ES: "www.vinted.es", IT: "www.vinted.it",
  };
  const domain = domains[country] || domains.FR;

  try {
    const url = `https://${domain}/api/v2/catalog/items?search_text=${encodeURIComponent(query)}&limit=${limit}`;
    const res = await safeFetch(url, {
      headers: { "User-Agent": UA, "Accept": "application/json", "Accept-Language": "fr-FR" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { products, retailer: "vinted", totalFound: 0, searchQuery: query };
    const data = (await res.json()) as {
      items?: Array<{
        id?: number;
        title?: string;
        price?: string;
        total_item_price?: string;
        url?: string;
        photo?: { url?: string };
      }>;
    };

    for (const item of data.items || []) {
      products.push({
        retailer: "vinted", country,
        productId: String(item.id || ""),
        title: item.title || "",
        price: parseFloat(item.price || "0"),
        currency: "EUR",
        inStock: true,
        url: item.url || `https://${domain}/items/${item.id}`,
        image: item.photo?.url,
        lastSeen: new Date(),
      });
    }
  } catch (err) {
    logger.debug(`[Vinted] Error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { products, retailer: "vinted", totalFound: products.length, searchQuery: query };
}

export const vintedModule: RetailerModule = {
  id: "vinted", name: "Vinted", countries: ["FR", "DE", "BE", "NL", "ES", "IT"],
  search: searchVinted,
  getProduct: async (id, country) => (await searchVinted(id, country, 1)).products[0] || null,
};

// ─── Leboncoin ──────────────────────────────────────────────────────────────

async function searchLeboncoin(query: string, _country: CountryCode, limit = 10): Promise<RetailerSearchResult> {
  const products: RetailerProduct[] = [];
  try {
    const url = `https://api.leboncoin.fr/finder/search?text=${encodeURIComponent(query)}&limit=${limit}`;
    const res = await safeFetch(url, {
      headers: { "User-Agent": UA, "Accept": "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { products, retailer: "leboncoin", totalFound: 0, searchQuery: query };
    const data = (await res.json()) as {
      ads?: Array<{
        list_id?: number;
        subject?: string;
        price?: number[];
        url?: string;
        images?: { thumb_url?: string }[];
      }>;
    };

    for (const ad of data.ads || []) {
      products.push({
        retailer: "leboncoin", country: "FR",
        productId: String(ad.list_id || ""),
        title: ad.subject || "",
        price: ad.price?.[0] || 0,
        currency: "EUR",
        inStock: true,
        url: ad.url || `https://www.leboncoin.fr/ad/${ad.list_id}`,
        image: ad.images?.[0]?.thumb_url,
        lastSeen: new Date(),
      });
    }
  } catch (err) {
    logger.debug(`[Leboncoin] Error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { products, retailer: "leboncoin", totalFound: products.length, searchQuery: query };
}

export const leboncoinModule: RetailerModule = {
  id: "leboncoin", name: "Leboncoin", countries: ["FR"],
  search: searchLeboncoin,
  getProduct: async (id) => (await searchLeboncoin(id, "FR", 1)).products[0] || null,
};

// ─── Rakuten France ─────────────────────────────────────────────────────────

async function searchRakuten(query: string, _country: CountryCode, limit = 10): Promise<RetailerSearchResult> {
  const products: RetailerProduct[] = [];
  try {
    const url = `https://fr.shopping.rakuten.com/search/${encodeURIComponent(query)}`;
    const res = await safeFetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { products, retailer: "rakuten", totalFound: 0, searchQuery: query };
    const html = await res.text();

    const blocks = html.match(/data-product-id="[^"]*"[\s\S]*?(?=<\/li>|<\/article>)/g) || [];
    for (const block of blocks.slice(0, limit)) {
      const titleMatch = block.match(/title="([^"]+)"/);
      const title = titleMatch ? titleMatch[1].trim() : "";
      const priceMatch = block.match(/(\d+[.,]\d{2})\s*€/);
      const price = priceMatch ? parsePrice(priceMatch[1]) : 0;
      const urlMatch = block.match(/href="([^"]+)"/);
      const imgMatch = block.match(/<img[^>]*src="([^"]+)"/);

      if (title && price > 0) {
        products.push({
          retailer: "rakuten", country: "FR", productId: "",
          title, price, currency: "EUR", inStock: true,
          url: urlMatch ? `https://fr.shopping.rakuten.com${urlMatch[1]}` : "",
          image: imgMatch?.[1], lastSeen: new Date(),
        });
      }
    }
  } catch (err) {
    logger.debug(`[Rakuten] Error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { products, retailer: "rakuten", totalFound: products.length, searchQuery: query };
}

export const rakutenModule: RetailerModule = {
  id: "rakuten", name: "Rakuten", countries: ["FR"],
  search: searchRakuten,
  getProduct: async (id) => (await searchRakuten(id, "FR", 1)).products[0] || null,
};

// ─── IKEA ───────────────────────────────────────────────────────────────────

async function searchIKEA(query: string, country: CountryCode, limit = 10): Promise<RetailerSearchResult> {
  const products: RetailerProduct[] = [];
  const domains: Record<string, string> = {
    FR: "www.ikea.com", DE: "www.ikea.com", ES: "www.ikea.com",
    NL: "www.ikea.com", BE: "www.ikea.com", IT: "www.ikea.com", CH: "www.ikea.com",
  };
  const paths: Record<string, string> = {
    FR: "/fr/fr/", DE: "/de/de/", ES: "/es/es/", NL: "/nl/nl/",
    BE: "/be/fr/", IT: "/it/it/", CH: "/ch/fr/",
  };
  const domain = domains[country] || domains.FR;
  const path = paths[country] || paths.FR;
  const currencies: Record<string, string> = { CH: "CHF", UK: "GBP" };

  try {
    const url = `https://${domain}${path}search/?query=${encodeURIComponent(query)}`;
    const res = await safeFetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { products, retailer: "ikea", totalFound: 0, searchQuery: query };
    const html = await res.text();

    const blocks = html.match(/class="plp-product[\s\S]*?(?=class="plp-product|<div class="pagination)/g) || [];
    for (const block of blocks.slice(0, limit)) {
      const titleMatch = block.match(/class="plp-product__title[^"]*"[^>]*>([\s\S]*?)<\/span>/);
      const title = titleMatch ? titleMatch[1].trim() : "";
      const priceMatch = block.match(/class="plp-price[^"]*"[^>]*>[\s\S]*?([\d.,]+)/);
      const price = priceMatch ? parsePrice(priceMatch[1]) : 0;
      const urlMatch = block.match(/href="([^"]+p[^"]*)"/);
      const imgMatch = block.match(/<img[^>]*src="([^"]+)"/);

      if (title && price > 0) {
        products.push({
          retailer: "ikea", country,
          productId: "", title, price,
          currency: currencies[country] || "EUR",
          inStock: true,
          url: urlMatch ? `https://${domain}${urlMatch[1]}` : "",
          image: imgMatch?.[1], lastSeen: new Date(),
        });
      }
    }
  } catch (err) {
    logger.debug(`[IKEA] Error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { products, retailer: "ikea", totalFound: products.length, searchQuery: query };
}

export const ikeaModule: RetailerModule = {
  id: "ikea", name: "IKEA", countries: ["FR", "DE", "BE", "NL", "ES", "IT", "CH"],
  search: searchIKEA,
  getProduct: async (id, country) => (await searchIKEA(id, country, 1)).products[0] || null,
};

// ─── Zalando ────────────────────────────────────────────────────────────────

async function searchZalando(query: string, country: CountryCode, limit = 10): Promise<RetailerSearchResult> {
  const products: RetailerProduct[] = [];
  const domains: Record<string, string> = {
    FR: "www.zalando.fr", DE: "www.zalando.de", BE: "www.zalando.be",
    NL: "www.zalando.nl", ES: "www.zalando.es", IT: "www.zalando.it",
    CH: "www.zalando.ch",
  };
  const domain = domains[country] || domains.FR;
  const currencies: Record<string, string> = { CH: "CHF" };

  try {
    const url = `https://${domain}/catalogue/?q=${encodeURIComponent(query)}`;
    const res = await safeFetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { products, retailer: "zalando", totalFound: 0, searchQuery: query };
    const html = await res.text();

    const blocks = html.match(/data-article-id="[^"]*"[\s\S]*?(?=<\/article>|<\/div>)/g) || [];
    for (const block of blocks.slice(0, limit)) {
      const titleMatch = block.match(/<a[^>]*>([\s\S]*?)<\/a>/);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
      const priceMatch = block.match(/(\d+[.,]\d{2})\s*€/) || block.match(/(\d+[.,]\d{2})\s*CHF/);
      const price = priceMatch ? parsePrice(priceMatch[1]) : 0;
      const urlMatch = block.match(/href="([^"]+)"/);
      const imgMatch = block.match(/<img[^>]*src="([^"]+)"/);

      if (title && price > 0) {
        products.push({
          retailer: "zalando", country,
          productId: "", title, price,
          currency: currencies[country] || "EUR",
          inStock: true,
          url: urlMatch ? `https://${domain}${urlMatch[1]}` : "",
          image: imgMatch?.[1], lastSeen: new Date(),
        });
      }
    }
  } catch (err) {
    logger.debug(`[Zalando] Error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { products, retailer: "zalando", totalFound: products.length, searchQuery: query };
}

export const zalandoModule: RetailerModule = {
  id: "zalando", name: "Zalando", countries: ["FR", "DE", "BE", "NL", "ES", "IT", "CH"],
  search: searchZalando,
  getProduct: async (id, country) => (await searchZalando(id, country, 1)).products[0] || null,
};
