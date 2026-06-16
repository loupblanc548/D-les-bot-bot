/**
 * Nettoie une URL en retirant les paramètres de tracking et en normalisant
 * les URLs YouTube pour éviter les doublons causés par des liens
 * légèrement différents pointant vers le même contenu.
 */
/**
 * Nettoie une URL en retirant les paramètres de tracking.
 *
 * Pour YouTube : normalise vers le format canonique
 *   https://www.youtube.com/watch?v=VIDEO_ID
 *
 * Pour les autres URLs : retire les paramètres de tracking connus
 *   (utm_*, fbclid, ref, si, t, etc.)
 *
 * Si l'URL est invalide ou vide, retourne la chaîne d'origine.
 */
export declare function cleanUrl(rawUrl: string): string;
//# sourceMappingURL=url-cleaner.d.ts.map