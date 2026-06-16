"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidDiscordId = isValidDiscordId;
exports.isValidUrl = isValidUrl;
exports.isValidEmail = isValidEmail;
exports.isValidMention = isValidMention;
exports.extractIdFromMention = extractIdFromMention;
exports.extractIdFromChannelMention = extractIdFromChannelMention;
exports.extractIdFromRoleMention = extractIdFromRoleMention;
exports.sanitizeString = sanitizeString;
exports.truncateString = truncateString;
exports.isNotEmptyString = isNotEmptyString;
const constants_1 = require("./constants");
/**
 * Utilitaires de validation pour les entrées utilisateur
 */
function isValidDiscordId(id) {
    return constants_1.REGEX_PATTERNS.DISCORD_ID.test(id);
}
function isValidUrl(url) {
    return constants_1.REGEX_PATTERNS.URL.test(url);
}
function isValidEmail(email) {
    return constants_1.REGEX_PATTERNS.EMAIL.test(email);
}
function isValidMention(mention) {
    return constants_1.REGEX_PATTERNS.MENTION.test(mention);
}
function extractIdFromMention(mention) {
    const match = mention.match(constants_1.REGEX_PATTERNS.MENTION);
    return match ? match[1] : null;
}
function extractIdFromChannelMention(mention) {
    const match = mention.match(constants_1.REGEX_PATTERNS.CHANNEL_MENTION);
    return match ? match[1] : null;
}
function extractIdFromRoleMention(mention) {
    const match = mention.match(constants_1.REGEX_PATTERNS.ROLE_MENTION);
    return match ? match[1] : null;
}
/**
 * Sanitize une chaîne pour éviter les injections XSS
 */
function sanitizeString(input) {
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
function truncateString(str, maxLength, suffix = "...") {
    if (str.length <= maxLength)
        return str;
    return str.slice(0, maxLength - suffix.length) + suffix;
}
/**
 * Valide qu'une chaîne n'est pas vide après nettoyage
 */
function isNotEmptyString(str) {
    return typeof str === "string" && str.trim().length > 0;
}
//# sourceMappingURL=validators.js.map