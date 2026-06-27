/**
 * sanitize.ts — Nettoyage des entrées utilisateur pour éviter les injections Discord.
 *
 * Supprime les mentions @everyone, @here, et les mentions de rôles
 * qui pourraient être injectées par un utilisateur malveillant.
 */

const EVERYONE_PATTERN = /@everyone/gi;
const HERE_PATTERN = /@here/gi;
const ROLE_MENTION_PATTERN = /<@&\d+>/g;
const USER_MENTION_PATTERN = /<@!?\d+>/g;

/**
 * Supprime les mentions dangereuses d'un texte.
 * - @everyone / @here → texte normal sans déclencher la mention
 * - <@&ID> (rôle) → supprimé
 * - <@!ID> / <@ID> (utilisateur) → supprimé
 */
export function sanitizeMentions(text: string): string {
  return text
    .replace(EVERYONE_PATTERN, "everyone")
    .replace(HERE_PATTERN, "here")
    .replace(ROLE_MENTION_PATTERN, "")
    .replace(USER_MENTION_PATTERN, "")
    .trim();
}

/**
 * Supprime uniquement @everyone et @here mais garde les mentions d'utilisateurs/rôles.
 * Utile pour les commandes modérateurs où les mentions de rôles sont légitimes.
 */
export function sanitizeMassMentions(text: string): string {
  return text.replace(EVERYONE_PATTERN, "everyone").replace(HERE_PATTERN, "here").trim();
}
