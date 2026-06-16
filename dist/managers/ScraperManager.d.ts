/**
 * ScraperManager.ts — Bridge TypeScript & Validation Atomique (Générique)
 *
 * Gestionnaire qui exécute le script Python engine.py via child_process.spawn,
 * valide les données avec Zod, applique la barrière temporelle de 48h,
 * et dédoublonne via Prisma avant de poursuivre le pipeline.
 *
 * Supporte TOUS les types de contenu : tweets, free games, patch notes,
 * deals, videos, game updates, price alerts.
 */
import { z } from "zod";
/**
 * Types de contenu supportés par le ScraperManager générique.
 * Chaque type correspond à un modèle Processed* dans Prisma.
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
 * Configuration d'un type de contenu : mapping vers le modèle Prisma.
 */
interface ContentTypeConfig {
    /** Nom de la table Prisma (ex: "processedPatchNotes") */
    tableName: string;
    /** Nom du champ unique utilisé pour la déduplication (ex: "guid") */
    uniqueField: string;
}
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
 * Exécute engine.py via child_process.spawn de manière totalement asynchrone.
 * Capture stdout, applique un timeout, et parse le JSON.
 */
export declare function executeScraper(options: ScraperOptions): Promise<ScrapedData>;
/**
 * Vérifie si une date est dans la fenêtre des 48 dernières heures.
 * Retourne false si l'item est trop vieux ou si la date est invalide.
 */
export declare function isWithinTemporalBarrier(pubDate: string): boolean;
/**
 * Retourne la configuration Prisma pour un type de contenu donné.
 */
export declare function getContentTypeConfig(type: ContentType): ContentTypeConfig;
/**
 * Retourne le nom du champ unique pour un type de contenu donné.
 */
export declare function getUniqueField(type: ContentType): string;
/**
 * Vérifie si un identifiant unique existe déjà dans la table Processed* correspondante.
 * Retourne true si l'élément est inédit (doit être traité).
 *
 * @param type - Type de contenu (détermine la table Prisma)
 * @param uniqueId - Identifiant unique (guid, tweetId, videoId, etc.)
 */
export declare function isNewItem(type: ContentType, uniqueId: string): Promise<boolean>;
/**
 * Enregistre un identifiant unique comme traité dans la table Processed* correspondante.
 *
 * @param type - Type de contenu (détermine la table Prisma)
 * @param uniqueId - Identifiant unique (guid, tweetId, videoId, etc.)
 */
export declare function markAsProcessed(type: ContentType, uniqueId: string): Promise<void>;
/**
 * Pipeline complet générique : Scraping → Validation Zod → Barrière 48h → Déduplication.
 * Retourne un PipelineResult indiquant si l'item est valide et doit être publié.
 *
 * @param type - Type de contenu pour la déduplication (défaut: PATCH_NOTE)
 * @param url - URL à scraper
 * @param guid - Identifiant unique pour la déduplication
 * @param options - Options de scraping additionnelles
 */
export declare function runScrapingPipeline(url: string, guid: string, options?: Partial<ScraperOptions>, type?: ContentType): Promise<PipelineResult>;
/**
 * Wrapper pratique pour les flux RSS.
 */
export declare function scrapeRssFeed(url: string, timeout?: number): Promise<ScrapedData>;
export default executeScraper;
//# sourceMappingURL=ScraperManager.d.ts.map