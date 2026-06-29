/**
 * Validation utilities for RSS feed data
 */

/**
 * Validate RSS item structure
 */
export function validateRssItem(item: Record<string, unknown>): boolean {
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
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitize string to prevent XSS
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  let sanitized = input
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .trim()
    .substring(0, 1000); // Limit length

  // Remove javascript: and other dangerous protocols using URL parsing
  try {
    const parsed = new URL(sanitized);
    const proto = parsed.protocol.toLowerCase();
    if (proto === 'javascript:' || proto === 'data:' || proto === 'vbscript:') {
      sanitized = sanitized.replace(/^(javascript|data|vbscript):/gi, '');
    }
  } catch {
    // Not a URL — remove dangerous protocol prefixes manually
    sanitized = sanitized.replace(/^(javascript|vbscript):/gi, '');
  }

  return sanitized;
}

/**
 * Validate Discord channel ID format
 */
export function isValidDiscordId(id: string): boolean {
  return /^\d{17,20}$/.test(id);
}

/**
 * Validate GUID format
 */
export function isValidGuid(guid: string): boolean {
  // Accept various GUID formats
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(guid) ||
         /^[a-f0-9]{32}$/i.test(guid) ||
         guid.length >= 10 && guid.length <= 100; // Accept custom GUIDs
}
