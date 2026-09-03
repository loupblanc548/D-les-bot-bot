/**
 * Titres d'embed Discord : une ligne, sans HTML / Markdown de corps d'article.
 */
import { htmlToMarkdown } from "./sanitizeHtml.js";

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  mdash: "—",
  ndash: "–",
  hellip: "…",
};

export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (full, ent: string) => {
    if (ent[0] === "#") {
      const code =
        ent[1] === "x" || ent[1] === "X" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    }
    return NAMED_ENTITIES[ent.toLowerCase()] ?? full;
  });
}

/** Titre d'une ligne, lisible dans un embed Discord (max 256, défaut 90). */
export function oneLineEmbedTitle(text: string, max = 90): string {
  const cap = Math.min(256, Math.max(8, max));
  const markdown = htmlToMarkdown(String(text || ""));
  const cleaned = decodeHtmlEntities(markdown)
    .replace(/[#*_`>~]+/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");
  const first =
    cleaned
      .split(/\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .find((line) => line.length > 0) || "Notification";
  if (first.length <= cap) return first;
  return `${first.slice(0, cap - 1)}…`;
}

/** Icône + titre court + label plateforme, toujours ≤ 256. */
export function notificationHeadline(icon: string, rawTitle: string, label = ""): string {
  const line = oneLineEmbedTitle(rawTitle, 72);
  const parts = [icon.trim(), line];
  if (label.trim()) parts.push("—", label.trim());
  const joined = parts.join(" ").replace(/\s+/g, " ").trim();
  return joined.length <= 256 ? joined : `${joined.slice(0, 255)}…`;
}

export function isFortniteOnTopic(title: string, handle = ""): boolean {
  if (/^(FortniteFR|FortniteGame|Fortnite)$/i.test(handle)) return true;
  return /fortnite|fncs|item shop|boutique fortnite|og season|saison og|battle royale|\breload\b|crew pack|loot (pool|hack)/i.test(
    title,
  );
}
