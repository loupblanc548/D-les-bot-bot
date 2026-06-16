/**
 * Scraper Bridge - TypeScript wrapper for the Python Scrapling scraper.
 * Spawns a Python child process and returns parsed JSON results.
 *
 * Provides async/await interface with timeout, error handling, and logging.
 */
import { z } from "zod";
export interface ScraperSelectors {
    title?: string;
    content?: string;
    date?: string;
    image?: string;
}
export interface ScrapedResult {
    title: string;
    content: string;
    date: string;
    link: string;
    image?: string;
    items?: Array<Record<string, unknown>>;
    raw?: string;
    error?: string;
}
export interface ScraperOptions {
    url: string;
    selectors?: ScraperSelectors;
    mode?: "html" | "rss";
    timeout?: number;
}
export declare const ScrapedDataSchema: z.ZodObject<{
    title: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    content: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    pubDate: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    date: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    link: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    image: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    items: z.ZodOptional<z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    raw: z.ZodOptional<z.ZodString>;
    error: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type ValidatedScrapedData = z.infer<typeof ScrapedDataSchema>;
export declare const RssItemSchema: z.ZodObject<{
    title: z.ZodString;
    content: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    pubDate: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    link: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    guid: z.ZodOptional<z.ZodString>;
    thumbnail: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type ValidatedRssItem = z.infer<typeof RssItemSchema>;
/**
 * Executes the Python Scrapling scraper and returns parsed JSON.
 *
 * @param options - Scraping options (URL, selectors, mode, timeout)
 * @returns Promise resolving to the scraped data
 * @throws Error if scraping fails, times out, or returns invalid JSON
 */
export declare function scrapeWithScrapling(options: ScraperOptions): Promise<ScrapedResult>;
/**
 * Scrapes an RSS feed URL and returns parsed items.
 * Convenience wrapper around scrapeWithScrapling with mode='rss'.
 */
export declare function scrapeRssFeed(url: string, timeout?: number): Promise<ScrapedResult>;
export default scrapeWithScrapling;
//# sourceMappingURL=scraper-bridge.d.ts.map