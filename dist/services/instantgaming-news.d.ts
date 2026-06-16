import { Client } from "discord.js";
interface ArticleData {
    title: string;
    url: string;
    image: string | null;
    summary: string;
    pubDate: string;
}
/**
 * Parse le contenu HTML d'un article pour y trouver la première balise <img src="..." />.
 */
declare function extractImageFromHtml(html: string): string | null;
/**
 * Vérifie si une URL d'image est valide (non vide, commence par http/https).
 */
declare function isValidImageUrl(url: unknown): url is string;
/**
 * Extraction robuste de l'image d'illustration d'un article RSS.
 *
 * Ordre de priorité :
 * 1. `enclosure.url` (balise <enclosure> RSS standard)
 * 2. `media:content` (namespace Media RSS, souvent utilisé par les blogs)
 * 3. `media:thumbnail` (vignette Media RSS)
 * 4. Parsing HTML de `content:encoded` pour y trouver une balise <img>
 * 5. Parsing HTML de `description` pour y trouver une balise <img>
 * 6. URL de secours (logo Instant Gaming)
 */
declare function extractArticleImage(item: Record<string, any>): string | null;
declare function fetchNewsRSS(): Promise<ArticleData[]>;
export declare function checkInstantGamingNews(client: Client): Promise<void>;
export declare function startInstantGamingNewsCheck(client: Client): void;
export declare function stopInstantGamingNewsCheck(): void;
export { fetchNewsRSS, extractArticleImage, extractImageFromHtml, isValidImageUrl };
//# sourceMappingURL=instantgaming-news.d.ts.map