import * as cheerio from "cheerio";

/**
 * Strip HTML tags safely using cheerio parser (not regex).
 * Also decodes HTML entities (&amp;, &lt;, &gt;, &nbsp;, &quot;, &#39;).
 * Removes <table>, <style>, <script> blocks entirely before extracting text.
 */
export function stripHtml(text: string): string {
  if (!text) return "";
  const $ = cheerio.load(`<div id="__root">${text}</div>`);
  // Remove table/style/script blocks entirely using cheerio (not regex)
  $("#__root table, #__root style, #__root script").remove();
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
