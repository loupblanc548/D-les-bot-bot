import { REGEX_PATTERNS } from "./constants.js";
/**
 * Utilitaires de validation pour les entrées utilisateur
 */
export function isValidDiscordId(id) {
    return REGEX_PATTERNS.DISCORD_ID.test(id);
}
export function isValidUrl(url) {
    return REGEX_PATTERNS.URL.test(url);
}
export function isValidEmail(email) {
    return REGEX_PATTERNS.EMAIL.test(email);
}
export function isValidMention(mention) {
    return REGEX_PATTERNS.MENTION.test(mention);
}
export function extractIdFromMention(mention) {
    const match = mention.match(REGEX_PATTERNS.MENTION);
    return match ? match[1] : null;
}
export function extractIdFromChannelMention(mention) {
    const match = mention.match(REGEX_PATTERNS.CHANNEL_MENTION);
    return match ? match[1] : null;
}
export function extractIdFromRoleMention(mention) {
    const match = mention.match(REGEX_PATTERNS.ROLE_MENTION);
    return match ? match[1] : null;
}
/**
 * Sanitize une chaîne pour éviter les injections XSS
 */
export function sanitizeString(input) {
    return input
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#x27;")
        .replace(/\//g, "&#x2F;");
}
/**
 * Tronque une chaîne à une longueur maximale
 */
export function truncateString(str, maxLength, suffix = "...") {
    if (str.length <= maxLength)
        return str;
    return str.slice(0, maxLength - suffix.length) + suffix;
}
/**
 * Valide qu'une chaîne n'est pas vide après nettoyage
 */
export function isNotEmptyString(str) {
    return typeof str === "string" && str.trim().length > 0;
}
//# sourceMappingURL=validators.js.map