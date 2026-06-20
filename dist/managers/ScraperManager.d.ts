/**

 * ScraperManager.ts ÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ Bridge TypeScript & Validation Atomique (GÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©nÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©rique)

 *

 * Gestionnaire qui exÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©cute le script Python engine.py via child_process.spawn,

 * valide les donnÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©es avec Zod, applique la barriÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¨re temporelle de 48h,

 * et dÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©doublonne via Prisma avant de poursuivre le pipeline.

 *

 * Supporte TOUS les types de contenu : tweets, free games, patch notes,

 * deals, videos, game updates, price alerts.

 */
import { z } from "zod";
/** Re-export du closeBrowser du scraper */
export declare function closeBrowser(): Promise<void>;
/**

 * Types de contenu supportÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©s par le ScraperManager gÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©nÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©rique.

 * Chaque type correspond ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ  un modÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¨le Processed* dans Prisma.

 */
export declare enum ContentType {
    TWEET = "tweet",
    FREE_GAME = "free_game",
    PATCH_NOTE = "patch_note",
    DEAL = "deal",
    VIDEO = "video",
    GAME_UPDATE = "game_update",
    PRICE_ALERT = "price_alert"
}
/**

 * Configuration d'un type de contenu : mapping vers le modÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¨le Prisma.

 */
interface ContentTypeConfig {
    /** Nom de la table Prisma (ex: "processedPatchNotes") */
    tableName: string;
    /** Nom du champ unique utilisÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ© pour la dÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©duplication (ex: "guid") */
    uniqueField: string;
}
/**
 * Retourne la configuration Prisma pour un type de contenu donne.
 */
export declare function getContentTypeConfig(type: ContentType): ContentTypeConfig;
/**
 * Verifie si la date de publication est dans la barriere temporelle (24h).
 */
export declare function isWithinTemporalBarrier(pubDate: string): boolean;
export declare const ScrapedDataSchema: z.ZodObject<{
    success: z.ZodBoolean;
    title: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    content: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    pubDate: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    link: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    image: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    raw: z.ZodOptional<z.ZodString>;
    error: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type ScrapedData = z.infer<typeof ScrapedDataSchema>;
export declare const ScrapedItemSchema: z.ZodObject<{
    guid: z.ZodString;
    title: z.ZodString;
    content: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    pubDate: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    link: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    image: z.ZodDefault<z.ZodOptional<z.ZodString>>;
}, z.core.$strip>;
export type ScrapedItem = z.infer<typeof ScrapedItemSchema>;
export interface ScraperSelectors {
    title?: string;
    content?: string;
    date?: string;
    image?: string;
}
export interface ScraperOptions {
    url: string;
    selectors?: ScraperSelectors;
    mode?: "html" | "rss";
    timeout?: number;
}
export interface PipelineResult {
    valid: boolean;
    item?: ScrapedItem;
    skippedReason?: string;
    error?: string;
}
/**

 * ExÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©cute engine.py via child_process.spawn de maniÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¨re totalement asynchrone.

 * Capture stdout, applique un timeout, et parse le JSON.

 */
export declare function executeScraper(options: ScraperOptions): Promise<ScrapedData>;
export declare function isNewItem(type: ContentType, uniqueId: string): Promise<boolean>;
/**

 * Enregistre un identifiant unique comme traitÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ© dans la table Processed* correspondante.

 *

 * @param type - Type de contenu (dÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©termine la table Prisma)

 * @param uniqueId - Identifiant unique (guid, tweetId, videoId, etc.)

 */
export declare function markAsProcessed(type: ContentType, uniqueId: string): Promise<void>;
/**

 * Pipeline complet gÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©nÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©rique : Scraping ÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ Validation Zod ÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ BarriÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¨re 48h ÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ DÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©duplication.

 * Retourne un PipelineResult indiquant si l'item est valide et doit ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂªtre publiÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©.

 *

 * @param type - Type de contenu pour la dÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©duplication (dÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©faut: PATCH_NOTE)

 * @param url - URL ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ  scraper

 * @param guid - Identifiant unique pour la dÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ©duplication

 * @param options - Options de scraping additionnelles

 */
export declare function runScrapingPipeline(url: string, guid: string, options?: Partial<ScraperOptions>, type?: ContentType): Promise<PipelineResult>;
/**

 * Wrapper pratique pour les flux RSS.

 */
export declare function scrapeRssFeed(url: string, timeout?: number): Promise<ScrapedData>;
export declare const scrapeWithScrapling: typeof executeScraper;
export default executeScraper;
//# sourceMappingURL=ScraperManager.d.ts.map