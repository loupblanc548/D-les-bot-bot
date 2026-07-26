/**
 * string.ts — Utilitaires de manipulation de chaînes
 */

/** Normalise le texte (NFC, trim, collapse whitespace) */
export function normalizeText(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

/** Tronque avec ellipsis optionnel */
export function truncate(text: string, maxLen: number, suffix = "…"): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - suffix.length) + suffix;
}

/** Capitalise la première lettre */
export function capitalize(text: string): string {
  if (!text) return text;
  return text[0].toUpperCase() + text.slice(1);
}

/** Convertit en kebab-case */
export function kebabCase(text: string): string {
  return text
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase()
    .replace(/^-|-$/g, "");
}

/** Pluralise un mot (règle simple FR/EN) */
export function pluralize(word: string, count: number): string {
  if (count <= 1) return word;
  if (word.endsWith("s") || word.endsWith("x")) return word;
  if (word.endsWith("al")) return word.slice(0, -2) + "aux";
  if (word.endsWith("eau") || word.endsWith("eu")) return word + "x";
  return word + "s";
}

/** Sanitize le markdown Discord (échappe les caractères de formatage) */
export function sanitizeMarkdownDiscord(text: string): string {
  return text.replace(/[*_`~|>]/g, (m) => `\\${m}`);
}

/** Compte le nombre de mots */
export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
