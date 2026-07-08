/**
 * tagSystem.ts — Système de tags par serveur
 *
 * Stocke en mémoire des snippets textuels nommés par guildId. Un tag
 * = (name, content, createdBy, createdAt). Limite stricte à 2000 chars
 * (la limite Discord pour un message) — au-delà, on refuse l'écriture.
 *
 * Implémentation volontairement simple : Map<guildId, Map<name, Tag>>.
 * Si le scope grossit, basculer vers Prisma (cf. note en bas du fichier).
 */

import logger from "../utils/logger.js";

// ─── Types ────────────────────────────────────────────────────────

export interface Tag {
  name: string;
  guildId: string;
  content: string;
  createdBy: string;
  createdAt: Date;
}

// ─── Constantes ───────────────────────────────────────────────────

/** Limite haute du contenu (aligné sur la limite Discord pour un message). */
const MAX_CONTENT_LENGTH = 2000;
/** Regex de validation du nom de tag : alphanumérique + tirets/underscores. */
const NAME_REGEX = /^[a-zA-Z0-9_-]{1,32}$/;

// ─── Store en mémoire ─────────────────────────────────────────────
const tagsByGuild = new Map<string, Map<string, Tag>>();

// ─── API publique ─────────────────────────────────────────────────

/**
 * Crée ou écrase un tag. Renvoie `null` si le nom ou le contenu est invalide
 * (log un warn à chaque refus).
 */
export function createTag(
  guildId: string,
  name: string,
  content: string,
  userId: string,
): Tag | null {
  if (!isValidName(name)) {
    logger.warn(`[tagSystem] Nom de tag invalide: "${name}"`);
    return null;
  }
  if (!isValidContent(content)) {
    logger.warn(
      `[tagSystem] Contenu trop long pour "${name}": ${content.length} > ${MAX_CONTENT_LENGTH}`,
    );
    return null;
  }
  if (!guildId || !userId) {
    logger.warn("[tagSystem] guildId ou userId manquant");
    return null;
  }

  const bucket = getOrCreateBucket(guildId);
  const existing = bucket.get(name);
  const tag: Tag = {
    name,
    guildId,
    content,
    createdBy: userId,
    createdAt: existing?.createdAt ?? new Date(),
  };
  bucket.set(name, tag);
  logger.info(
    `[tagSystem] Tag "${name}" ${existing ? "mis à jour" : "créé"} sur ${guildId}`,
  );
  return tag;
}

/** Récupère un tag par son nom dans un guild. */
export function getTag(guildId: string, name: string): Tag | null {
  return tagsByGuild.get(guildId)?.get(name) ?? null;
}

/** Liste tous les tags d'un guild (triés par nom). */
export function listTags(guildId: string): Tag[] {
  const bucket = tagsByGuild.get(guildId);
  if (!bucket) return [];
  return Array.from(bucket.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/** Supprime un tag. Renvoie `true` si quelque chose a été supprimé. */
export function deleteTag(guildId: string, name: string): boolean {
  const bucket = tagsByGuild.get(guildId);
  if (!bucket) return false;
  const removed = bucket.delete(name);
  if (bucket.size === 0) tagsByGuild.delete(guildId); // GC
  if (removed) {
    logger.info(`[tagSystem] Tag "${name}" supprimé sur ${guildId}`);
  }
  return removed;
}

/** Inspection utilitaire — utile pour tests. */
export function getTagCount(guildId: string): number {
  return tagsByGuild.get(guildId)?.size ?? 0;
}

/** Reset complet (utile pour tests). */
export function clearTags(): void {
  tagsByGuild.clear();
}

// ─── Helpers ──────────────────────────────────────────────────────

function isValidName(name: string): boolean {
  return typeof name === "string" && NAME_REGEX.test(name);
}

function isValidContent(content: string): boolean {
  return typeof content === "string" && content.length <= MAX_CONTENT_LENGTH;
}

function getOrCreateBucket(guildId: string): Map<string, Tag> {
  let bucket = tagsByGuild.get(guildId);
  if (!bucket) {
    bucket = new Map();
    tagsByGuild.set(guildId, bucket);
  }
  return bucket;
}

/*
 * Note de migration vers Prisma (si besoin futur) :
 *   - modèle GuildTag { id, guildId, name, content, createdBy, createdAt }
 *   - @@unique([guildId, name])
 *   - Les accès deviennent async ; wrappers `getTagSync`/`createTagSync`
 *     à supprimer pour forcer le passage async.
 */
