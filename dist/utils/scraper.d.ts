import { Browser, BrowserContext, Page } from 'playwright';
export declare function launchBrowser(): Promise<{
    browser: Browser;
    context: BrowserContext;
    page: Page;
}>;
/**
 * Ferme proprement le navigateur et le contexte.
 */
export declare function closeBrowser(): Promise<void>;
//# sourceMappingURL=scraper.d.ts.map