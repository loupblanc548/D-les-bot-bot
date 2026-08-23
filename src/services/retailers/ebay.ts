/**
 * ebay.ts — Module eBay multi-pays
 *
 * Pays : FR, DE, BE, NL, ES, IT, CH, UK, US
 * API : eBay Browse API (OAuth2 gratuit) + fallback scraping
 */

import logger from "../../utils/logger.js";
import { safeFetch } from "../../utils/ssrfGuard.js";
import type { RetailerModule, RetailerProduct, RetailerSearchResult, CountryCode } from "./types.js";

const EBAY_DOMAINS: Record<CountryCode, string> = {
  FR: "www.ebay.fr",
  DE: "www.ebay.de",
  BE: "www.ebay.be",
  NL: "www.ebay.nl",
  ES: "www.ebay.es",
  IT: "www.ebay.it",
  CH: "www.ebay.ch",
  UK: "www.ebay.co.uk",
  US: "www.ebay.com",
  AT: "www.ebay.at",
};

const EBAY_CURRENCIES: Record<CountryCode, string> = {
  FR: "EUR", DE: "EUR", BE: "EUR", NL: "EUR", ES: "EUR", IT: "EUR", CH: "CHF", UK: "GBP", US: "USD", AT: "EUR",
};

const EBAY_CLIENT_ID = process.env.EBAY_CLIENT_ID || "";
const EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET || "";

function hasEbayApi(): boolean {
  return !!(EBAY_CLIENT_ID && EBAY_CLIENT_SECRET);
}

async function getEbayToken(): Promise<string | null> {
  if (!hasEbayApi()) return null;
  try {
    const creds = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString("base64");
    const res = await safeFetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${creds}`,
      },
      body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string };
    return data.access_token || null;
  } catch {
    return null;
  }
}

async function searchApi(query: string, country: CountryCode, limit: number): Promise<RetailerSearchResult | null> {
  const token = await getEbayToken();
  if (!token) return null;

  const marketplaceMap: Record<CountryCode, string> = {
    FR: "EBAY_FR", DE: "EBAY_DE", BE: "EBAY_BE", NL: "EBAY_NL",
    ES: "EBAY_ES", IT: "EBAY_IT", CH: "EBAY_CH", UK: "EBAY_GB", US: "EBAY_US", AT: "EBAY_AT",
  };
  const marketplaceId = marketplaceMap[country] || "EBAY_FR";
  const currency = EBAY_CURRENCIES[country] || "EUR";

  try {
    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&limit=${limit}&marketplace_id=${marketplaceId}`;
    const res = await safeFetch(url, {
      headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": marketplaceId },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      itemSummaries?: Array<{
        itemId?: string;
        title?: string;
        price?: { value?: string; currency?: string };
        itemHref?: string;
        itemWebUrl?: string;
        image?: { imageUrl?: string };
        condition?: string;
        seller?: { feedbackPercentage?: string };
      }>;
      total?: number;
    };

    const products: RetailerProduct[] = (data.itemSummaries || []).map((item) => ({
      retailer: "ebay" as const,
      country,
      productId: item.itemId?.replace("v1|", "") || "",
      title: item.title || "",
      price: parseFloat(item.price?.value || "0"),
      currency: item.price?.currency || currency,
      inStock: true,
      url: item.itemWebUrl || "",
      image: item.image?.imageUrl,
      lastSeen: new Date(),
    }));

    return { products, retailer: "ebay", totalFound: data.total || products.length, searchQuery: query };
  } catch (err) {
    logger.debug(`[eBay] API search error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function searchScraping(query: string, country: CountryCode, limit = 10): Promise<RetailerSearchResult> {
  const domain = EBAY_DOMAINS[country] || EBAY_DOMAINS.FR;
  const currency = EBAY_CURRENCIES[country] || "EUR";
  const products: RetailerProduct[] = [];

  try {
    const url = `https://${domain}/sch/i.html?_nkw=${encodeURIComponent(query)}&_sop=15&LH_PrefLoc=1`;
    const res = await safeFetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "fr-FR,fr;q=0.9",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return { products, retailer: "ebay", totalFound: 0, searchQuery: query };
    const html = await res.text();

    // Extraction des items eBay
    const itemBlocks = html.match(/class="s-item[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g) || [];

    for (const block of itemBlocks.slice(0, limit)) {
      try {
        const titleMatch = block.match(/class="s-item__title[^"]*"[^>]*>([\s\S]*?)<\/h3>/);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
        if (!title || title === "Shop on eBay") continue;

        const priceMatch = block.match(/class="s-item__price[^"]*"[^>]*>([\d.,]+)/);
        const price = priceMatch ? parseFloat(priceMatch[1].replace(",", ".")) : 0;

        const urlMatch = block.match(/class="s-item__link"[^>]*href="([^"]+)"/);
        const itemUrl = urlMatch ? urlMatch[1] : "";

        const imgMatch = block.match(/class="s-item__image[^"]*"[^>]*src="([^"]+)"/) || block.match(/<img[^>]*src="([^"]+)"/);
        const image = imgMatch ? imgMatch[1] : undefined;

        const idMatch = itemUrl.match(/\/itm\/(\d+)/);
        const itemId = idMatch ? idMatch[1] : "";

        if (title && price > 0) {
          products.push({
            retailer: "ebay",
            country,
            productId: itemId,
            title,
            price,
            currency,
            inStock: true,
            url: itemUrl,
            image,
            lastSeen: new Date(),
          });
        }
      } catch { logger.error("[Silent catch]"); }
    }
  } catch (err) {
    logger.debug(`[eBay] Scraping error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { products, retailer: "ebay", totalFound: products.length, searchQuery: query };
}

export const ebayModule: RetailerModule = {
  id: "ebay",
  name: "eBay",
  countries: ["FR", "DE", "BE", "NL", "ES", "IT", "CH", "UK", "US"],
  search: async (query, country, limit = 10) => {
    const apiResult = await searchApi(query, country, limit);
    if (apiResult && apiResult.products.length > 0) return apiResult;
    return searchScraping(query, country, limit);
  },
  getProduct: async (itemId, country) => {
    const result = await searchScraping(itemId, country, 1);
    return result.products[0] || null;
  },
};
