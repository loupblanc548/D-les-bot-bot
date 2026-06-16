/**
 * Utilitaires de validation pour les entrées utilisateur
 */
export declare function isValidDiscordId(id: string): boolean;
export declare function isValidUrl(url: string): boolean;
export declare function isValidEmail(email: string): boolean;
export declare function isValidMention(mention: string): boolean;
export declare function extractIdFromMention(mention: string): string | null;
export declare function extractIdFromChannelMention(mention: string): string | null;
export declare function extractIdFromRoleMention(mention: string): string | null;
/**
 * Sanitize une chaîne pour éviter les injections XSS
 */
export declare function sanitizeString(input: string): string;
/**
 * Tronque une chaîne à une longueur maximale
 */
export declare function truncateString(str: string, maxLength: number, suffix?: string): string;
/**
 * Valide qu'une chaîne n'est pas vide après nettoyage
 */
export declare function isNotEmptyString(str: string | undefined | null): boolean;
//# sourceMappingURL=validators.d.ts.map