/**
 * Vérifie rapidement si une chaîne contient des liens suspects.
 * (Utilisé par l'event messages pour le filtrage temps réel)
 */
export declare function checkSuspiciousLinks(content: string): boolean;
/**
 * Variante détaillée qui retourne la liste des flags détectés.
 * (Utilisé par la commande /linkcheck pour afficher un rapport)
 */
export declare function checkSuspiciousLinksDetailed(content: string): string[];
/** Vérifie si l'anti-phishing est activé pour une guilde (avec cache). */
export declare function isAntiPhishingActive(guildId: string): Promise<boolean>;
/** Vérifie si l'anti-raid est activé pour une guilde (avec cache). */
export declare function isAntiRaidActive(guildId: string): Promise<{
    active: boolean;
    seuilHeures: number;
}>;
//# sourceMappingURL=utils.d.ts.map