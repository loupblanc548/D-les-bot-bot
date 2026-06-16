/**
 * Validation utilities for RSS feed data
 */
/**
 * Validate RSS item structure
 */
export declare function validateRssItem(item: Record<string, unknown>): boolean;
/**
 * Validate URL format
 */
export declare function isValidUrl(url: string): boolean;
/**
 * Sanitize string to prevent XSS
 */
export declare function sanitizeString(input: string): string;
/**
 * Validate Discord channel ID format
 */
export declare function isValidDiscordId(id: string): boolean;
/**
 * Validate GUID format
 */
export declare function isValidGuid(guid: string): boolean;
//# sourceMappingURL=validation.d.ts.map