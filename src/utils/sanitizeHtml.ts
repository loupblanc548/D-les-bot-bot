/**
 * sanitizeHtml.ts — Nettoyage HTML pour embeds et dashboard
 *
 * Inspiré de sanitize-html :
 * - Whitelist de tags/attributs/styles autorisés
 * - Suppression des scripts, event handlers, javascript: URLs
 * - Conversion HTML → markdown pour embeds Discord
 * - Escape HTML pour affichage dashboard
 *
 * Sans dépendance externe — implementation pure TypeScript.
 */

// ─── Configuration ────────────────────────────────────────────────────────────

const ALLOWED_TAGS = new Set([
  "b", "strong", "i", "em", "u", "s", "del", "ins",
  "br", "p", "div", "span",
  "a", "code", "pre", "blockquote",
  "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "img", "hr",
  "table", "thead", "tbody", "tr", "th", "td",
  "sub", "sup", "mark",
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title"]),
  img: new Set(["src", "alt", "title", "width", "height"]),
  span: new Set(["class", "style"]),
  div: new Set(["class", "style"]),
  p: new Set(["class", "style"]),
  code: new Set(["class"]),
  pre: new Set(["class"]),
  td: new Set(["colspan", "rowspan", "align"]),
  th: new Set(["colspan", "rowspan", "align"]),
  table: new Set(["class"]),
};

const ALLOWED_STYLES = new Set([
  "color",
  "background-color",
  "font-weight",
  "font-style",
  "text-decoration",
  "text-align",
]);

const SELF_CLOSING_TAGS = new Set(["br", "img", "hr", "input"]);

// ─── Sanitization principale ──────────────────────────────────────────────────

/**
 * Nettoie du HTML en gardant uniquement les tags/attributs autorisés.
 * Supprime les scripts, event handlers, et URLs dangereuses.
 */
export function sanitizeHtml(html: string, options?: {
  allowedTags?: string[];
  disallowedTagsMode?: "discard" | "escape";
}): string {
  const allowedTags = options?.allowedTags
    ? new Set(options.allowedTags)
    : ALLOWED_TAGS;
  const escapeMode = options?.disallowedTagsMode ?? "discard";

  // Supprimer les commentaires HTML et les scripts/style
  let result = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, "");

  // Parser les tags restants
  result = result.replace(/<\/?([a-zA-Z0-9]+)([^>]*?)\/?>/g, (match, tag: string, attrs: string) => {
    const lowerTag = tag.toLowerCase();

    if (!allowedTags.has(lowerTag)) {
      if (escapeMode === "escape") {
        return match.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      }
      return "";
    }

    // Nettoyer les attributs
    const cleanAttrs = sanitizeAttributes(lowerTag, attrs);
    const isSelfClosing = SELF_CLOSING_TAGS.has(lowerTag);
    const isClosing = match.startsWith("</");

    if (isClosing) {
      return `</${lowerTag}>`;
    }

    return cleanAttrs
      ? `<${lowerTag} ${cleanAttrs}${isSelfClosing ? " /" : ""}>`
      : `<${lowerTag}${isSelfClosing ? " /" : ""}>`;
  });

  // Nettoyer les attributs restants dans les tags autorisés (event handlers)
  result = result.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "");
  result = result.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "");
  result = result.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "");

  return result;
}

/**
 * Nettoie les attributs d'un tag.
 */
function sanitizeAttributes(tag: string, attrs: string): string {
  const allowed = ALLOWED_ATTRS[tag];
  if (!allowed) return "";

  const cleanAttrs: string[] = [];
  const attrRegex = /([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match: RegExpExecArray | null;

  while ((match = attrRegex.exec(attrs)) !== null) {
    const attrName = match[1].toLowerCase();
    const attrValue = match[2] ?? match[3] ?? match[4] ?? "";

    if (!allowed.has(attrName)) continue;

    // Vérifier les URLs dangereuses
    if (attrName === "href" || attrName === "src") {
      if (isDangerousUrl(attrValue)) continue;
    }

    // Filtrer les styles
    if (attrName === "style") {
      const cleanStyle = sanitizeStyle(attrValue);
      if (!cleanStyle) continue;
      cleanAttrs.push(`${attrName}="${cleanStyle}"`);
      continue;
    }

    cleanAttrs.push(`${attrName}="${escapeAttr(attrValue)}"`);
  }

  return cleanAttrs.join(" ");
}

/**
 * Vérifie si une URL est dangereuse (javascript:, data:, vbscript:).
 */
function isDangerousUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim(), "http://safe.invalid");
    const proto = parsed.protocol.toLowerCase();
    return proto === "javascript:" || proto === "data:" || proto === "vbscript:" || proto === "file:";
  } catch {
    const trimmed = url.trim().toLowerCase();
    return trimmed.startsWith("javascript:") || trimmed.startsWith("vbscript:");
  }
}

/**
 * Nettoie les styles CSS en gardant uniquement les propriétés autorisées.
 */
function sanitizeStyle(style: string): string {
  const declarations = style.split(";");
  const clean: string[] = [];

  for (const decl of declarations) {
    const colonIdx = decl.indexOf(":");
    if (colonIdx === -1) continue;

    const prop = decl.slice(0, colonIdx).trim().toLowerCase();
    const value = decl.slice(colonIdx + 1).trim();

    if (!ALLOWED_STYLES.has(prop)) continue;

    // Supprimer les expressions dangereuses (expression(), url(javascript:))
    if (/expression\s*\(/i.test(value)) continue;
    if (/url\s*\(\s*['"]?\s*javascript:/i.test(value)) continue;

    clean.push(`${prop}: ${value}`);
  }

  return clean.join("; ");
}

/**
 * Escape un attribut HTML.
 */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ─── HTML → Markdown pour Discord ──────────────────────────────────────────────

/**
 * Convertit du HTML en markdown Discord-compatible.
 * Utile pour les embeds qui reçoivent du contenu HTML (RSS, APIs).
 */
export function htmlToMarkdown(html: string): string {
  let md = sanitizeHtml(html, { disallowedTagsMode: "discard" });

  // Conversions HTML → Markdown
  md = md
    // Liens
    .replace(/<a\s+[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gis, (_match, href: string, text: string) => {
      const cleanText = text.replace(/<[^>]*>/g, "").trim();
      return cleanText ? `[${cleanText}](${href})` : "";
    })
    // Gras
    .replace(/<(?:b|strong)>(.*?)<\/(?:b|strong)>/gis, "**$1**")
    // Italique
    .replace(/<(?:i|em)>(.*?)<\/(?:i|em)>/gis, "*$1*")
    // Souligné
    .replace(/<u>(.*?)<\/u>/gis, "__$1__")
    // Barré
    .replace(/<(?:s|del|strike)>(.*?)<\/(?:s|del|strike)>/gis, "~~$1~~")
    // Code inline
    .replace(/<code>(.*?)<\/code>/gis, "`$1`")
    // Code block
    .replace(/<pre[^>]*>(.*?)<\/pre>/gis, "```\n$1\n```")
    // Citations
    .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gis, "> $1")
    // Titres
    .replace(/<h1[^>]*>(.*?)<\/h1>/gis, "# $1\n")
    .replace(/<h2[^>]*>(.*?)<\/h2>/gis, "## $1\n")
    .replace(/<h3[^>]*>(.*?)<\/h3>/gis, "### $1\n")
    .replace(/<h[456][^>]*>(.*?)<\/h[456]>/gis, "#### $1\n")
    // Listes
    .replace(/<li[^>]*>(.*?)<\/li>/gis, "- $1\n")
    .replace(/<\/?(?:ul|ol)[^>]*>/gis, "\n")
    // Images
    .replace(/<img\s+[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gis, (_, src, alt) => `[${alt}](${src})`)
    .replace(/<img\s+[^>]*src="([^"]*)"[^>]*\/?>/gis, (_, src) => `[image](${src})`)
    // Sauts de ligne
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<hr\s*\/?>/gi, "\n---\n")
    // Paragraphes et divs
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<\/div>/gi, "\n")
    .replace(/<div[^>]*>/gi, "")
    .replace(/<\/span>/gi, "")
    .replace(/<span[^>]*>/gi, "")
    // Marqueurs
    .replace(/<mark[^>]*>(.*?)<\/mark>/gis, "**$1**")
    // Supprimer les tags restants
    .replace(/<[^>]*>/g, "")
    // Nettoyer les espaces
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s+/gm, "")
    .trim();

  return md;
}

// ─── Helpers pour embeds Discord ───────────────────────────────────────────────

/**
 * Nettoie du texte pour un champ d'embed Discord.
 * Supprime le HTML, limite la longueur, escape les mentions.
 */
export function sanitizeForEmbed(text: string, maxLength = 1024): string {
  const markdown = htmlToMarkdown(text);
  return markdown.length > maxLength
    ? markdown.slice(0, maxLength - 3) + "..."
    : markdown;
}

/**
 * Nettoie du texte pour le titre d'un embed Discord (max 256 chars).
 */
export function sanitizeForEmbedTitle(text: string): string {
  return sanitizeForEmbed(text, 256);
}

/**
 * Nettoie du texte pour la description d'un embed Discord (max 4096 chars).
 */
export function sanitizeForEmbedDescription(text: string): string {
  return sanitizeForEmbed(text, 4096);
}

/**
 * Nettoie du texte pour un champ de footer d'embed Discord (max 2048 chars).
 */
export function sanitizeForEmbedFooter(text: string): string {
  return sanitizeForEmbed(text, 2048);
}

// ─── Escape HTML pour dashboard ───────────────────────────────────────────────

/**
 * Escape complet HTML pour affichage sécurisé dans le dashboard.
 */
export function escapeHtml(str: unknown): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Strip toutes les balises HTML — retourne uniquement le texte.
 */
export function stripAllHtml(html: string): string {
  // First strip all HTML tags, then decode entities ONCE (no double escaping)
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
