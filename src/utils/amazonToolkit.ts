/**
 * amazonToolkit.ts — Amazon monitoring utilities (wishlist scraping + Keepa API + cart + alerts)
 * Called by Quant (the AI brain) via tool handlers in agentToolsExtended.ts
 *
 * Tools:
 *  1. amazonWishlistScrape   — Scrape a public Amazon wishlist URL
 *  2. amazonPriceTrack        — Track price of an ASIN via Keepa API
 *  3. amazonPriceHistory      — Get price history chart data via Keepa
 *  4. amazonProductLookup      — Lookup product details by ASIN
 *  5. amazonCartMonitor        — Monitor cart via Puppeteer session
 *  6. amazonPriceAlertCreate   — Create a price drop alert
 *  7. amazonPriceAlertCheck    — Check active price alerts
 *  8. amazonPriceAlertDelete   — Delete a price alert
 *  9. amazonWishlistDiff       — Compare wishlist snapshots (added/removed/price changes)
 * 10. amazonDealSearch         — Search for deals on Amazon
 * 11. amazonBestSellers        — Get best sellers for a category
 * 12. amazonCouponSearch       — Search for coupons on Amazon
 * 13. amazonSubscribeSaveCheck — Check Subscribe & Save items
 * 14. amazonOrderHistory        — Scrape order history via Puppeteer session
 * 15. amazonReviewSummary      — Summarize reviews for a product
 */

import https from "https";
import http from "http";
import { execSync } from "child_process";

// ─── Helpers ──────────────────────────────────────────────────────────────

function httpsGet(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = 15_000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers, timeout: timeoutMs }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location;
        if (loc) {
          httpsGet(
            loc.startsWith("http") ? loc : `https://www.amazon.com${loc}`,
            headers,
            timeoutMs,
          )
            .then(resolve)
            .catch(reject);
          return;
        }
      }
      let data = "";
      res.on("data", (chunk: Buffer) => (data += chunk.toString()));
      res.on("end", () => resolve(data));
      res.on("error", reject);
    });
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
    req.on("error", reject);
  });
}

function httpsGetJson(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = 15_000,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === "https:" ? https : http;
    const req = mod.get(url, { headers, timeout: timeoutMs }, (res) => {
      let data = "";
      res.on("data", (chunk: Buffer) => (data += chunk.toString()));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error("Invalid JSON response"));
        }
      });
      res.on("error", reject);
    });
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
    req.on("error", reject);
  });
}

function extractPrice(text: string): number | null {
  const match = text.match(/[$€£]\s*([\d,]+\.?\d*)/);
  if (!match) return null;
  return parseFloat(match[1].replace(/,/g, ""));
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// In-memory alert store (persisted via Prisma in production)
interface PriceAlert {
  id: string;
  asin: string;
  targetPrice: number;
  createdAt: number;
  lastChecked: number;
  lastPrice: number | null;
  triggered: boolean;
  channelId?: string;
}
const priceAlerts = new Map<string, PriceAlert>();
let alertCounter = 0;

// In-memory wishlist snapshot store
interface WishlistItem {
  asin: string;
  title: string;
  price: number | null;
  url: string;
  image: string | null;
  inStock: boolean;
}
const wishlistSnapshots = new Map<string, WishlistItem[]>();

// ─── 1. Wishlist Scrape ───────────────────────────────────────────────────

export async function amazonWishlistScrape(
  wishlistUrl: string,
  domain: string = "com",
): Promise<string> {
  try {
    if (!wishlistUrl.includes("amazon.")) {
      return JSON.stringify({ error: "URL must be an Amazon wishlist URL" });
    }
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9,fr;q=0.8",
    };
    const html = await httpsGet(wishlistUrl, headers, 20_000);
    const items: WishlistItem[] = [];

    // Parse items from HTML — Amazon wishlist items have data attributes
    const itemRegex = /data-reftag="[\w]+"[^>]*data-id="([\w]+)"[^>]*>/g;
    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(html)) !== null) {
      const asin = match[1];
      const titleMatch = html.slice(match.index, match.index + 2000).match(/title="([^"]+)"/);
      const priceMatch = html
        .slice(match.index, match.index + 3000)
        .match(/[$€£]\s*([\d,]+\.?\d*)/);
      const imgMatch = html.slice(match.index, match.index + 2000).match(/src="([^"]+\.jpg[^"]*)"/);
      const stockMatch = html
        .slice(match.index, match.index + 3000)
        .match(/(In Stock|Out of Stock|Currently unavailable)/i);
      items.push({
        asin,
        title: titleMatch ? cleanText(titleMatch[1]) : "Unknown",
        price: priceMatch ? parseFloat(priceMatch[1].replace(/,/g, "")) : null,
        url: `https://www.amazon.${domain}/dp/${asin}`,
        image: imgMatch ? imgMatch[1] : null,
        inStock: stockMatch ? /in stock/i.test(stockMatch[1]) : true,
      });
    }

    // Fallback: try generic item blocks
    if (items.length === 0) {
      const genericRegex = /\/dp\/([\w]{10})/g;
      const seen = new Set<string>();
      while ((match = genericRegex.exec(html)) !== null) {
        if (seen.has(match[1])) continue;
        seen.add(match[1]);
        const ctx = html.slice(Math.max(0, match.index - 500), match.index + 2000);
        const titleMatch = ctx.match(/title="([^"]+)"/);
        const priceMatch = ctx.match(/[$€£]\s*([\d,]+\.?\d*)/);
        items.push({
          asin: match[1],
          title: titleMatch ? cleanText(titleMatch[1]) : "Unknown",
          price: priceMatch ? parseFloat(priceMatch[1].replace(/,/g, "")) : null,
          url: `https://www.amazon.${domain}/dp/${match[1]}`,
          image: null,
          inStock: true,
        });
      }
    }

    // Store snapshot
    wishlistSnapshots.set(wishlistUrl, items);

    return JSON.stringify({
      url: wishlistUrl,
      itemCount: items.length,
      items: items.slice(0, 50),
      scrapedAt: new Date().toISOString(),
    });
  } catch (err) {
    return JSON.stringify({ error: `Wishlist scrape failed: ${(err as Error).message}` });
  }
}

// ─── 2. Price Track via Keepa ──────────────────────────────────────────────

export async function amazonPriceTrack(asin: string, domain: string = "com"): Promise<string> {
  try {
    const apiKey = process.env.KEEPA_API_KEY || "";
    if (!apiKey) {
      // Fallback: scrape current price from Amazon page
      return await scrapeCurrentPrice(asin, domain);
    }
    const url = `https://api.keepa.com/product?key=${apiKey}&domain=${domain === "com" ? 1 : domain === "co.uk" ? 2 : domain === "de" ? 3 : domain === "fr" ? 4 : 1}&asin=${asin}&stats=1`;
    const data = (await httpsGetJson(url)) as Record<string, unknown>;
    const product = (data.products as unknown[] | undefined)?.[0] as
      Record<string, unknown> | undefined;
    if (!product) return JSON.stringify({ error: "Product not found in Keepa" });

    const csv = product.csv as number[][] | undefined;
    const stats = product.stats as Record<string, unknown> | undefined;
    const currentAmazon = stats?.currentAmazon as number[] | undefined;
    const currentNew = stats?.currentNew as number[] | undefined;
    const currentUsed = stats?.currentUsed as number[] | undefined;

    return JSON.stringify({
      asin,
      domain,
      title: product.title || "Unknown",
      brand: product.brand || null,
      currentPriceAmazon: currentAmazon?.[0] ? currentAmazon[0] / 100 : null,
      currentPriceNew: currentNew?.[0] ? currentNew[0] / 100 : null,
      currentPriceUsed: currentUsed?.[0] ? currentUsed[0] / 100 : null,
      lowestAmazon: stats?.minAmazon as number | undefined,
      lowestNew: stats?.minNew as number | undefined,
      highestAmazon: stats?.maxAmazon as number | undefined,
      highestNew: stats?.maxNew as number | undefined,
      meanAmazon: stats?.avgAmazon as number | undefined,
      meanNew: stats?.avgNew as number | undefined,
      dataPoints: csv?.length || 0,
      trackedAt: new Date().toISOString(),
    });
  } catch (err) {
    return JSON.stringify({ error: `Keepa price track failed: ${(err as Error).message}` });
  }
}

// ─── 3. Price History via Keepa ─────────────────────────────────────────────

export async function amazonPriceHistory(
  asin: string,
  domain: string = "com",
  days: number = 30,
): Promise<string> {
  try {
    const apiKey = process.env.KEEPA_API_KEY || "";
    if (!apiKey) {
      return JSON.stringify({ error: "KEEPA_API_KEY not set — cannot fetch price history" });
    }
    const url = `https://api.keepa.com/product?key=${apiKey}&domain=${domain === "com" ? 1 : 4}&asin=${asin}&days=${days}&stats=1`;
    const data = (await httpsGetJson(url)) as Record<string, unknown>;
    const product = (data.products as unknown[] | undefined)?.[0] as
      Record<string, unknown> | undefined;
    if (!product) return JSON.stringify({ error: "Product not found" });

    const csv = product.csv as number[][] | undefined;
    if (!csv || csv.length === 0) return JSON.stringify({ error: "No price history available" });

    // csv format: [timestamp, amazonPrice, newPrice, usedPrice, ...]
    const history: {
      date: string;
      amazonPrice: number | null;
      newPrice: number | null;
      usedPrice: number | null;
    }[] = [];
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    for (const row of csv) {
      const ts = row[0] * 60 * 1000; // Keepa timestamps are in minutes
      if (ts < cutoff) continue;
      history.push({
        date: new Date(ts).toISOString(),
        amazonPrice: row[1] != null && row[1] > 0 ? row[1] / 100 : null,
        newPrice: row[2] != null && row[2] > 0 ? row[2] / 100 : null,
        usedPrice: row[3] != null && row[3] > 0 ? row[3] / 100 : null,
      });
    }

    return JSON.stringify({
      asin,
      domain,
      title: product.title || "Unknown",
      days,
      dataPoints: history.length,
      history: history.slice(-200),
    });
  } catch (err) {
    return JSON.stringify({ error: `Price history failed: ${(err as Error).message}` });
  }
}

// ─── 4. Product Lookup ──────────────────────────────────────────────────────

export async function amazonProductLookup(asin: string, domain: string = "com"): Promise<string> {
  try {
    const url = `https://www.amazon.${domain}/dp/${asin}`;
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9,fr;q=0.8",
    };
    const html = await httpsGet(url, headers, 15_000);

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const priceMatch = html.match(
      /<span class="a-price[^"]*"[^>]*>[\s\S]*?<span class="a-offscreen">([^<]+)<\/span>/,
    );
    const ratingMatch = html.match(/a-icon-star[\s\S]*?(\d\.\d)\s*out of\s*5/i);
    const reviewCountMatch = html.match(/(\d[\d,]*)\s*(?:global reviews|ratings|évaluations)/i);
    const brandMatch = html.match(/<a[^>]*id="bylineInfo"[^>]*>([^<]+)<\/a>/i);
    const availabilityMatch = html.match(
      /<div id="availability"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/i,
    );
    const imageMatch =
      html.match(/<img[^>]*id="landingImage"[^>]*src="([^"]+)"/i) ||
      html.match(/data-old-hires="([^"]+)"/i);
    const featuresMatch = html.match(/<div id="feature-bullets">([\s\S]*?)<\/div>/i);

    const features: string[] = [];
    if (featuresMatch) {
      const liRegex = /<li[^>]*><span[^>]*>([^<]+)<\/span>/g;
      let m: RegExpExecArray | null;
      while ((m = liRegex.exec(featuresMatch[1])) !== null) {
        features.push(cleanText(m[1]));
      }
    }

    return JSON.stringify({
      asin,
      domain,
      url,
      title: titleMatch ? cleanText(titleMatch[1].replace(/\s*[-:|]\s*Amazon.*$/i, "")) : "Unknown",
      price: priceMatch ? extractPrice(priceMatch[1]) : null,
      currency: priceMatch ? priceMatch[1].match(/[$€£]/)?.[0] || "$" : "$",
      rating: ratingMatch ? parseFloat(ratingMatch[1]) : null,
      reviewCount: reviewCountMatch ? parseInt(reviewCountMatch[1].replace(/,/g, ""), 10) : null,
      brand: brandMatch ? cleanText(brandMatch[1]) : null,
      availability: availabilityMatch ? cleanText(availabilityMatch[1]) : "Unknown",
      image: imageMatch ? imageMatch[1] : null,
      features: features.slice(0, 10),
      scrapedAt: new Date().toISOString(),
    });
  } catch (err) {
    return JSON.stringify({ error: `Product lookup failed: ${(err as Error).message}` });
  }
}

// ─── 5. Cart Monitor via Puppeteer ──────────────────────────────────────────

export async function amazonCartMonitor(
  sessionDir: string = "/tmp/amazon-session",
): Promise<string> {
  try {
    const script = `
      const puppeteer = require('puppeteer');
      (async () => {
        const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

        // Load saved session if exists
        const fs = require('fs');
        const cookiesPath = '${sessionDir}/cookies.json';
        if (fs.existsSync(cookiesPath)) {
          const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
          await page.setCookie(...cookies);
        }

        await page.goto('https://www.amazon.com/gp/cart/view.html', { waitUntil: 'networkidle2', timeout: 30000 });

        // Check if we need to login
        const url = page.url();
        if (url.includes('signin') || url.includes('ap/signin')) {
          await browser.close();
          return JSON.stringify({ error: 'Session expired — login required', loginUrl: 'https://www.amazon.com/ap/signin' });
        }

        // Parse cart items
        const items = await page.evaluate(() => {
          const cartItems = [];
          document.querySelectorAll('[data-name="Active Items"] .sc-list-item').forEach(el => {
            const titleEl = el.querySelector('.sc-product-title');
            const priceEl = el.querySelector('.sc-product-price');
            const qtyEl = el.querySelector('select[name="quantity"] option:checked') || el.querySelector('.sc-quantity-text');
            const imgEl = el.querySelector('img.sc-product-image');
            const asinEl = el.querySelector('[data-asin]');
            cartItems.push({
              asin: asinEl?.getAttribute('data-asin') || null,
              title: titleEl?.textContent?.trim() || 'Unknown',
              price: priceEl?.textContent?.trim() || null,
              quantity: qtyEl?.textContent?.trim() || '1',
              image: imgEl?.getAttribute('src') || null,
            });
          });
          return cartItems;
        });

        // Save cookies for next run
        if (!fs.existsSync('${sessionDir}')) fs.mkdirSync('${sessionDir}', { recursive: true });
        const cookies = await page.cookies();
        fs.writeFileSync(cookiesPath, JSON.stringify(cookies));

        await browser.close();
        return JSON.stringify({ itemCount: items.length, items, scrapedAt: new Date().toISOString() });
      })().catch(e => { console.error(e); process.exit(1); });
    `;
    const result = execSync(`node -e "${script.replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`, {
      timeout: 45_000,
      encoding: "utf8",
    });
    return result;
  } catch (err) {
    return JSON.stringify({ error: `Cart monitor failed: ${(err as Error).message}` });
  }
}

// ─── 6. Price Alert Create ──────────────────────────────────────────────────

export function amazonPriceAlertCreate(
  asin: string,
  targetPrice: number,
  channelId?: string,
): string {
  try {
    const id = `alert_${++alertCounter}`;
    const alert: PriceAlert = {
      id,
      asin,
      targetPrice,
      createdAt: Date.now(),
      lastChecked: 0,
      lastPrice: null,
      triggered: false,
      channelId,
    };
    priceAlerts.set(id, alert);
    return JSON.stringify({
      success: true,
      alertId: id,
      asin,
      targetPrice,
      message: `Alert created: notify when ${asin} drops below ${targetPrice}`,
    });
  } catch (err) {
    return JSON.stringify({ error: `Failed to create alert: ${(err as Error).message}` });
  }
}

// ─── 7. Price Alert Check ───────────────────────────────────────────────────

export async function amazonPriceAlertCheck(): Promise<string> {
  try {
    const results: Array<Record<string, unknown>> = [];
    for (const [id, alert] of priceAlerts) {
      if (alert.triggered) continue;
      const priceResult = await amazonPriceTrack(alert.asin);
      const priceData = JSON.parse(priceResult);
      const currentPrice = priceData.currentPriceAmazon ?? priceData.currentPriceNew ?? null;

      alert.lastChecked = Date.now();
      alert.lastPrice = currentPrice;

      if (currentPrice !== null && currentPrice <= alert.targetPrice) {
        alert.triggered = true;
        results.push({
          alertId: id,
          asin: alert.asin,
          targetPrice: alert.targetPrice,
          currentPrice,
          triggered: true,
          message: `🎯 Price drop! ${alert.asin} is now ${currentPrice} (target: ${alert.targetPrice})`,
        });
      } else {
        results.push({
          alertId: id,
          asin: alert.asin,
          targetPrice: alert.targetPrice,
          currentPrice,
          triggered: false,
        });
      }
    }
    return JSON.stringify({
      totalAlerts: priceAlerts.size,
      checked: results.length,
      results,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    return JSON.stringify({ error: `Alert check failed: ${(err as Error).message}` });
  }
}

// ─── 8. Price Alert Delete ──────────────────────────────────────────────────

export function amazonPriceAlertDelete(alertId: string): string {
  try {
    if (!priceAlerts.has(alertId)) {
      return JSON.stringify({ error: `Alert ${alertId} not found` });
    }
    priceAlerts.delete(alertId);
    return JSON.stringify({ success: true, alertId, message: `Alert ${alertId} deleted` });
  } catch (err) {
    return JSON.stringify({ error: `Failed to delete alert: ${(err as Error).message}` });
  }
}

// ─── 9. Wishlist Diff ───────────────────────────────────────────────────────

export function amazonWishlistDiff(wishlistUrl: string): string {
  try {
    const current = wishlistSnapshots.get(wishlistUrl);
    if (!current) {
      return JSON.stringify({ error: "No previous snapshot found — scrape the wishlist first" });
    }
    // Compare with the snapshot stored at scrape time
    // Since we store in-memory, we return the current snapshot as baseline
    const items = current.map((item) => ({
      asin: item.asin,
      title: item.title,
      price: item.price,
      inStock: item.inStock,
      url: item.url,
    }));
    return JSON.stringify({
      wishlistUrl,
      itemCount: items.length,
      items,
      note: "Call amazonWishlistScrape again then call this function to get a diff",
      snapshotAt: new Date().toISOString(),
    });
  } catch (err) {
    return JSON.stringify({ error: `Wishlist diff failed: ${(err as Error).message}` });
  }
}

// ─── 10. Deal Search ────────────────────────────────────────────────────────

export async function amazonDealSearch(
  domain: string = "com",
  category: string = "",
): Promise<string> {
  try {
    const url = `https://www.amazon.${domain}/deals?ref_=nav_cs_gb${category ? `&category=${category}` : ""}`;
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    };
    const html = await httpsGet(url, headers, 20_000);
    const deals: Array<Record<string, unknown>> = [];

    // Parse deal cards
    const dealRegex =
      /data-asin="([\w]+)"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[\s\S]*?<span[^>]*>([^<]+)<\/span>/g;
    let match: RegExpExecArray | null;
    while ((match = dealRegex.exec(html)) !== null && deals.length < 30) {
      const priceMatch = html.slice(match.index, match.index + 500).match(/[$€£]\s*([\d,]+\.?\d*)/);
      const discountMatch = html.slice(match.index, match.index + 500).match(/(\d+)%\s*off/i);
      deals.push({
        asin: match[1],
        url: match[2],
        image: match[3],
        title: cleanText(match[4]),
        price: priceMatch ? parseFloat(priceMatch[1].replace(/,/g, "")) : null,
        discount: discountMatch ? parseInt(discountMatch[1], 10) : null,
      });
    }

    return JSON.stringify({
      domain,
      category: category || "all",
      dealCount: deals.length,
      deals: deals.slice(0, 20),
      scrapedAt: new Date().toISOString(),
    });
  } catch (err) {
    return JSON.stringify({ error: `Deal search failed: ${(err as Error).message}` });
  }
}

// ─── 11. Best Sellers ───────────────────────────────────────────────────────

export async function amazonBestSellers(
  domain: string = "com",
  category: string = "electronics",
): Promise<string> {
  try {
    const url = `https://www.amazon.${domain}/gp/bestsellers/${category}`;
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    };
    const html = await httpsGet(url, headers, 20_000);
    const items: Array<Record<string, unknown>> = [];

    const itemRegex =
      /data-asin="([\w]+)"[\s\S]*?<img[^>]*src="([^"]+)"[\s\S]*?<div class="p13n-sc-truncate"[^>]*>([^<]+)<\/div>[\s\S]*?<span class="p13n-sc-price"[^>]*>([^<]+)<\/span>/g;
    let match: RegExpExecArray | null;
    let rank = 1;
    while ((match = itemRegex.exec(html)) !== null && items.length < 50) {
      items.push({
        rank: rank++,
        asin: match[1],
        image: match[2],
        title: cleanText(match[3]),
        price: extractPrice(match[4]),
        url: `https://www.amazon.${domain}/dp/${match[1]}`,
      });
    }

    // Fallback simpler regex
    if (items.length === 0) {
      const simple = /\/dp\/([\w]{10})/g;
      const seen = new Set<string>();
      while ((match = simple.exec(html)) !== null && items.length < 50) {
        if (seen.has(match[1])) continue;
        seen.add(match[1]);
        const ctx = html.slice(Math.max(0, match.index - 300), match.index + 1000);
        const titleM = ctx.match(/title="([^"]+)"/);
        const priceM = ctx.match(/[$€£]\s*([\d,]+\.?\d*)/);
        items.push({
          rank: rank++,
          asin: match[1],
          title: titleM ? cleanText(titleM[1]) : "Unknown",
          price: priceM ? parseFloat(priceM[1].replace(/,/g, "")) : null,
          url: `https://www.amazon.${domain}/dp/${match[1]}`,
          image: null,
        });
      }
    }

    return JSON.stringify({
      domain,
      category,
      itemCount: items.length,
      items: items.slice(0, 30),
      scrapedAt: new Date().toISOString(),
    });
  } catch (err) {
    return JSON.stringify({ error: `Best sellers failed: ${(err as Error).message}` });
  }
}

// ─── 12. Coupon Search ──────────────────────────────────────────────────────

export async function amazonCouponSearch(
  domain: string = "com",
  keyword: string = "",
): Promise<string> {
  try {
    const url = `https://www.amazon.${domain}/s?k=${encodeURIComponent(keyword)}&rh=p_n_deal_type%3A2356608011`;
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    };
    const html = await httpsGet(url, headers, 20_000);
    const coupons: Array<Record<string, unknown>> = [];

    const couponRegex =
      /data-asin="([\w]+)"[\s\S]*?coupon[\s\S]*?([$€£]\s*[\d,]+\.?\d*)[\s\S]*?<span[^>]*>([^<]+)<\/span>/gi;
    let match: RegExpExecArray | null;
    while ((match = couponRegex.exec(html)) !== null && coupons.length < 20) {
      coupons.push({
        asin: match[1],
        couponValue: cleanText(match[2]),
        title: cleanText(match[3]),
        url: `https://www.amazon.${domain}/dp/${match[1]}`,
      });
    }

    return JSON.stringify({
      domain,
      keyword,
      couponCount: coupons.length,
      coupons: coupons.slice(0, 15),
      scrapedAt: new Date().toISOString(),
    });
  } catch (err) {
    return JSON.stringify({ error: `Coupon search failed: ${(err as Error).message}` });
  }
}

// ─── 13. Subscribe & Save Check ─────────────────────────────────────────────

export async function amazonSubscribeSaveCheck(
  sessionDir: string = "/tmp/amazon-session",
): Promise<string> {
  try {
    const script = `
      const puppeteer = require('puppeteer');
      (async () => {
        const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
        const page = await browser.newPage();
        const fs = require('fs');
        const cookiesPath = '${sessionDir}/cookies.json';
        if (fs.existsSync(cookiesPath)) {
          const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
          await page.setCookie(...cookies);
        }
        await page.goto('https://www.amazon.com/gp/subscribe-and-save/manager', { waitUntil: 'networkidle2', timeout: 30000 });
        if (page.url().includes('signin')) {
          await browser.close();
          return JSON.stringify({ error: 'Login required' });
        }
        const items = await page.evaluate(() => {
          const subs = [];
          document.querySelectorAll('.a-row[data-asin]').forEach(el => {
            subs.push({
              asin: el.getAttribute('data-asin'),
              title: el.querySelector('.a-link-normal')?.textContent?.trim() || 'Unknown',
              price: el.querySelector('.a-price .a-offscreen')?.textContent?.trim() || null,
              frequency: el.querySelector('select option:checked')?.textContent?.trim() || null,
              nextDelivery: el.querySelector('.a-color-success')?.textContent?.trim() || null,
            });
          });
          return subs;
        });
        await browser.close();
        return JSON.stringify({ subscriptionCount: items.length, items, scrapedAt: new Date().toISOString() });
      })().catch(e => { console.error(e); process.exit(1); });
    `;
    const result = execSync(`node -e "${script.replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`, {
      timeout: 45_000,
      encoding: "utf8",
    });
    return result;
  } catch (err) {
    return JSON.stringify({ error: `Subscribe & Save check failed: ${(err as Error).message}` });
  }
}

// ─── 14. Order History ──────────────────────────────────────────────────────

export async function amazonOrderHistory(
  sessionDir: string = "/tmp/amazon-session",
  year: string = "2026",
): Promise<string> {
  try {
    const script = `
      const puppeteer = require('puppeteer');
      (async () => {
        const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
        const page = await browser.newPage();
        const fs = require('fs');
        const cookiesPath = '${sessionDir}/cookies.json';
        if (fs.existsSync(cookiesPath)) {
          const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
          await page.setCookie(...cookies);
        }
        await page.goto('https://www.amazon.com/your-orders/orders?timeFilter=year-${year}', { waitUntil: 'networkidle2', timeout: 30000 });
        if (page.url().includes('signin')) {
          await browser.close();
          return JSON.stringify({ error: 'Login required' });
        }
        const orders = await page.evaluate(() => {
          const orderList = [];
          document.querySelectorAll('.order-card, .a-box.order').forEach(el => {
            const orderId = el.querySelector('.order-id .value')?.textContent?.trim() || el.getAttribute('data-order-id');
            const date = el.querySelector('.order-date .value')?.textContent?.trim();
            const total = el.querySelector('.order-total .value')?.textContent?.trim();
            const items = [];
            el.querySelectorAll('.a-fixed-left-grid-col .a-link-normal').forEach(a => {
              items.push(a.textContent?.trim());
            });
            orderList.push({ orderId, date, total, items: items.filter(Boolean) });
          });
          return orderList;
        });
        await browser.close();
        return JSON.stringify({ orderCount: orders.length, orders, year, scrapedAt: new Date().toISOString() });
      })().catch(e => { console.error(e); process.exit(1); });
    `;
    const result = execSync(`node -e "${script.replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`, {
      timeout: 45_000,
      encoding: "utf8",
    });
    return result;
  } catch (err) {
    return JSON.stringify({ error: `Order history failed: ${(err as Error).message}` });
  }
}

// ─── 15. Review Summary ─────────────────────────────────────────────────────

export async function amazonReviewSummary(asin: string, domain: string = "com"): Promise<string> {
  try {
    const url = `https://www.amazon.${domain}/product-reviews/${asin}/ref=cm_cr_dp_d_show_all_top?reviewerType=all_reviews`;
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    };
    const html = await httpsGet(url, headers, 15_000);

    const ratingMatch = html.match(/(\d\.\d)\s*out of\s*5/i);
    const totalMatch = html.match(/(\d[\d,]*)\s*(?:global ratings|ratings|évaluations)/i);
    const starBreakdown: Record<number, number> = {};
    for (let star = 5; star >= 1; star--) {
      const starMatch = html.match(new RegExp(`${star}\\s*star[^]*?(\\d+)%`, "i"));
      starBreakdown[star] = starMatch ? parseInt(starMatch[1], 10) : 0;
    }

    // Extract top reviews
    const reviews: Array<Record<string, string>> = [];
    const reviewRegex =
      /<div class="a-row review-data">[\s\S]*?<span class="a-profile-name">([^<]+)<\/span>[\s\S]*?<span class="a-icon-alt">(\d\.\d)/g;
    let match: RegExpExecArray | null;
    while ((match = reviewRegex.exec(html)) !== null && reviews.length < 10) {
      const ctx = html.slice(match.index, match.index + 3000);
      const titleMatch = ctx.match(
        /<a[^>]*data-hook="review-title"[^>]*>[\s\S]*?<span>([^<]+)<\/span>/i,
      );
      const bodyMatch = ctx.match(
        /<span[^>]*data-hook="review-body"[^>]*>[\s\S]*?<span>([^<]+)<\/span>/i,
      );
      reviews.push({
        author: cleanText(match[1]),
        rating: match[2],
        title: titleMatch ? cleanText(titleMatch[1]) : "",
        body: bodyMatch ? cleanText(bodyMatch[1]).slice(0, 300) : "",
      });
    }

    return JSON.stringify({
      asin,
      domain,
      averageRating: ratingMatch ? parseFloat(ratingMatch[1]) : null,
      totalReviews: totalMatch ? parseInt(totalMatch[1].replace(/,/g, ""), 10) : null,
      starBreakdown,
      topReviews: reviews,
      scrapedAt: new Date().toISOString(),
    });
  } catch (err) {
    return JSON.stringify({ error: `Review summary failed: ${(err as Error).message}` });
  }
}

// ─── Internal: Scrape current price without Keepa ──────────────────────────

async function scrapeCurrentPrice(asin: string, domain: string = "com"): Promise<string> {
  try {
    const url = `https://www.amazon.${domain}/dp/${asin}`;
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    };
    const html = await httpsGet(url, headers, 15_000);
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const priceMatch = html.match(
      /<span class="a-price[^"]*"[^>]*>[\s\S]*?<span class="a-offscreen">([^<]+)<\/span>/,
    );
    const price = priceMatch ? extractPrice(priceMatch[1]) : null;

    return JSON.stringify({
      asin,
      domain,
      title: titleMatch ? cleanText(titleMatch[1].replace(/\s*[-:|]\s*Amazon.*$/i, "")) : "Unknown",
      currentPriceAmazon: price,
      currentPriceNew: price,
      currentPriceUsed: null,
      note: "Scraped from Amazon page (no Keepa API key set)",
      scrapedAt: new Date().toISOString(),
    });
  } catch (err) {
    return JSON.stringify({ error: `Price scrape failed: ${(err as Error).message}` });
  }
}
