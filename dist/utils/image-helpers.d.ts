/**
 * Extrait la miniature YouTube depuis les métadonnées RSS/Atom d'un item de flux.
 * Formats supportés :
 *   - RSS  : <media:thumbnail url="..." />
 *   - Atom : <media:group><media:thumbnail url="..." /></media:group>
 * Dans le flux Atom YouTube, les miniatures sont triées par taille ;
 * la dernière est maxresdefault (la plus grande).
 */
export declare function extractMediaThumbnail(item: Record<string, unknown>): string | undefined;
export declare function getYouTubeThumbnail(url: string): Promise<string | null>;
export declare function getOgImage(url: string): Promise<string | null>;
export declare function getBlogImage(url: string): Promise<string | null>;
export declare function getTweetImage(url: string): Promise<string | null>;
//# sourceMappingURL=image-helpers.d.ts.map