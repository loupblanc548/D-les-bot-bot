import * as cheerio from "cheerio";

/**
 * Strip HTML tags safely using cheerio parser (not regex).
 * Also decodes HTML entities (&amp;, &lt;, &gt;, &nbsp;, &quot;, &#39;).
 * Replaces <table>, <style>, <script> blocks with empty string before stripping.
 */
export function stripHtml(text: string): string {
  if (!text) return "";
  // Remove table/style/script blocks entirely
  const cleaned = text
    .replace(/<table[\s\S]*?<\/table>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "");
  // Use cheerio to strip tags and decode entities
  const $ = cheerio.load(`<div id="__root">${cleaned}</div>`);
  return $("#__root").text().trim();
}

/**
 * Sanitize a string for safe logging — removes newlines and control chars
 * that could be used for log injection.
 */
export function sanitizeForLog(text: string): string {
  return text.replace(/[\r\n\t]/g, " ").replace(/\x1b\[[0-9;]*m/g, "").slice(0, 500);
}

/**
 * Escape HTML entities to prevent reflected XSS.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
