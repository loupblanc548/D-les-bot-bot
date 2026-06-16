/**
 * Service d'agrégation de news gaming multi-sources
 * Agrège les news de plusieurs sources (IGN, GameSpot, Kotaku, etc.)
 */
interface NewsItem {
    title: string;
    description: string;
    link: string;
    pubDate: Date;
    source: string;
    category?: string;
    imageUrl?: string;
}
/**
 * Récupère les news de toutes les sources
 */
export declare function fetchAllNews(): Promise<NewsItem[]>;
/**
 * Récupère les news par catégorie
 */
export declare function fetchNewsByCategory(category: string): Promise<NewsItem[]>;
/**
 * Récupère les news récentes (dernières 24h)
 */
export declare function fetchRecentNews(hours?: number): Promise<NewsItem[]>;
/**
 * Recherche des news par mot-clé
 */
export declare function searchNews(keyword: string): Promise<NewsItem[]>;
/**
 * Nettoie le cache des news
 */
export declare function clearNewsCache(): void;
export {};
//# sourceMappingURL=newsAggregator.d.ts.map