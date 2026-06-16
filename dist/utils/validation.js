"use strict";
/**
 * Validation utilities for RSS feed data
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRssItem = validateRssItem;
exports.isValidUrl = isValidUrl;
exports.sanitizeString = sanitizeString;
exports.isValidDiscordId = isValidDiscordId;
exports.isValidGuid = isValidGuid;
/**
 * Validate RSS item structure
 */
function validateRssItem(item) {
    if (!item || typeof item !== 'object') {
        return false;
    }
    // Required fields
    if (!item.title || typeof item.title !== 'string') {
        return false;
    }
    if (!item.link || typeof item.link !== 'string') {
        return false;
    }
    // Optional but recommended fields
    if (item.pubDate && typeof item.pubDate !== 'string') {
        return false;
    }
    return true;
}
/**
 * Validate URL format
 */
function isValidUrl(url) {
    try {
        new URL(url);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Sanitize string to prevent XSS
 */
function sanitizeString(input) {
    if (typeof input !== 'string') {
        return '';
    }
    return input
        .replace(/[<>]/g, '') // Remove potential HTML tags
        .replace(/javascript:/gi, '') // Remove javascript: protocol
        .trim()
        .substring(0, 1000); // Limit length
}
/**
 * Validate Discord channel ID format
 */
function isValidDiscordId(id) {
    return /^\d{17,20}$/.test(id);
}
/**
 * Validate GUID format
 */
function isValidGuid(guid) {
    // Accept various GUID formats
    return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(guid) ||
        /^[a-f0-9]{32}$/i.test(guid) ||
        guid.length >= 10 && guid.length <= 100; // Accept custom GUIDs
}
//# sourceMappingURL=validation.js.map