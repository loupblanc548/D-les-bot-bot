/**
 * serverBackup.ts — Sauvgarde / restauration basique d'un serveur Discord
 *
 * Capture les rôles, salons textuels/vocaux et catégories d'un guild, les
 * sérialise en JSON, et permet de les recréer sur un autre serveur.
 * Conçu pour un admin : `restoreBackup` ne touche PAS aux salons/rôles
 * existants — il AJOUTE par-dessus (pas de delete massif).
 *
 * Limitations assumées :
 *   - Permissions sur salons (overwrites) : non sauvegardées.
 *   - Threads, forums, stages, annonces : non sauvegardés (scope = guild
 *     text / voice / category).
 *   - Rate limits Discord : pas de sleep entre les créations — le caller
 *     peut wrapping pour batch si le serveur a beaucoup d'éléments.
 */

import { Guild, PermissionsBitField } from "discord.js";
import logger from "../utils/logger.js";

// ─── Types ────────────────────────────────────────────────────────

/** Permissions sérialisées en string base-10 pour rester JSON-safe. */
export interface SerializedRole {
  name: string;
  permissions: string;
  color: number;
  hoist: boolean;
  mentionable: boolean;
}

/** `type` est un alias lisible : "text" | "voice" | "category". */
export interface SerializedChannel {
  name: string;
  type: string;
  parentId?: string;
  topic?: string;
  position: number;
}

export interface SerializedCategory {
  id?: string;
  name: string;
  position: number;
}

export interface ServerBackup {
  id: string;
  guildId: string;
  createdAt: Date;
  roles: SerializedRole[];
  channels: SerializedChannel[];
  categories: SerializedCategory[];
}

/** Forme minimale d'un salon créé, juste l'ID — évite `unknown` du type union discord.js. */
interface CreatedChannelLike {
  id: string;
}

// ─── Constantes ───────────────────────────────────────────────────

/** Mapping interne → representation lisible dans le JSON. */
const CHANNEL_TYPE_TO_STRING: Record<number, string> = {
  0: "text",
  2: "voice",
  4: "category",
};

const STRING_TO_CHANNEL_TYPE: Record<string, number> = {
  text: 0,
  voice: 2,
  category: 4,
};

// ─── Helpers ──────────────────────────────────────────────────────

function isBotOrEveryoneRole(
  role: { id: string; managed: boolean; name: string },
  guildId: string,
): boolean {
  if (role.id === guildId) return true; // @everyone
  if (role.managed) return true; // rôles gérés par bots/integrations
  return false;
}

/** Nom du rôle @everyone selon le guild — Discord le renomme parfois. */
function everyoneRoleName(guild: Guild): string {
  return guild.roles.everyone?.name ?? "@everyone";
}

function serializePerms(perm: Readonly<PermissionsBitField>): string {
  return perm.bitfield.toString();
}

function deserializePerms(stored: string): PermissionsBitField {
  return new PermissionsBitField(BigInt(stored));
}

function mapChannelTypeToString(type: number): string {
  return CHANNEL_TYPE_TO_STRING[type] ?? "text";
}

function mapStringToChannelType(name: string): number | null {
  return STRING_TO_CHANNEL_TYPE[name] ?? null;
}

// ─── createBackup ─────────────────────────────────────────────────

/**
 * Snapshot des rôles (hors @everyone et rôles gérés), des salons
 * textuels/vocaux et des catégories d'un guild. L'ID du backup combine
 * `guildId` et timestamp pour rester unique et traçable.
 */
export async function createBackup(guild: Guild): Promise<ServerBackup> {
  if (!guild) {
    throw new Error("[serverBackup] guild invalide");
  }

  const fetchedGuild = await guild.fetch().catch(() => guild);

  // ── Rôles : on exclut @everyone et tous les rôles gérés (bots / integrations).
  const roles = fetchedGuild.roles.cache
    .filter((role) => !isBotOrEveryoneRole(role, fetchedGuild.id))
    .map((role) => ({
      name: role.name,
      permissions: serializePerms(role.permissions),
      color: role.color,
      hoist: role.hoist,
      mentionable: role.mentionable,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // ── Catégories : on conserve l'id original pour le remap parentId lors
  //     d'une restauration ultérieure.
  const categories = fetchedGuild.channels.cache
    .filter((c) => c.type === 4)
    .map((c) => ({
      id: c.id,
      name: c.name,
      position: c.position,
    }))
    .sort((a, b) => a.position - b.position);

  // ── Salons : text (0) et voice (2). On exclut les catégories.
  const channels = fetchedGuild.channels.cache
    .filter((c) => c.type === 0 || c.type === 2)
    .map((c) => {
      const channel: SerializedChannel = {
        name: c.name,
        type: mapChannelTypeToString(c.type),
        position: c.position,
      };
      if (c.parentId) channel.parentId = c.parentId;
      if ("topic" in c && typeof c.topic === "string" && c.topic.length > 0) {
        channel.topic = c.topic;
      }
      return channel;
    })
    .sort((a, b) => a.position - b.position);

  const backup: ServerBackup = {
    id: `${fetchedGuild.id}-${Date.now()}`,
    guildId: fetchedGuild.id,
    createdAt: new Date(),
    roles,
    channels,
    categories,
  };

  logger.info(
    `[serverBackup] Backup créé pour ${fetchedGuild.name} (${fetchedGuild.id}) — ` +
      `${roles.length} rôle(s), ${categories.length} catégorie(s), ${channels.length} salon(s)`,
  );
  return backup;
}

// ─── exportBackupJson ─────────────────────────────────────────────

/**
 * Sérialise un backup en chaîne JSON lisible (indentation 2 espaces).
 */
export async function exportBackupJson(backup: ServerBackup): Promise<string> {
  return JSON.stringify(backup, null, 2);
}

// ─── restoreBackup ────────────────────────────────────────────────

/**
 * Restaure un backup sur `guild`.
 *
 * Ordre de restauration explicite (important pour Discord) :
 *   1. catégories — sans parent, on récolte leur nouvel ID pour remap.
 *   2. salons — leur parentId est remappé via la table oldId→newId.
 *   3. rôles — dernier pour ne pas perturber les permissions par défaut.
 *
 * Chaque élément est isolé dans un try/catch : un échec n'arrête pas la
 * boucle. `@everyone` est défensivement filtré à la restore au cas où
 * le backup serait mal formé.
 *
 * @returns `{ restored, failed }` — totaux par agrégat (catégories +
 *   salons + rôles). Utile pour logs/UX.
 */
export async function restoreBackup(
  guild: Guild,
  backup: ServerBackup,
): Promise<{ restored: number; failed: number }> {
  if (!guild) throw new Error("[serverBackup] guild invalide");
  if (!backup) throw new Error("[serverBackup] backup invalide");

  let restored = 0;
  let failed = 0;
  const idRemap = new Map<string, string>();
  const everyoneName = everyoneRoleName(guild);

  // ── 1. Catégories ──────────────────────────────────────────────
  // Le remap est clée par ID original (pas par nom) — deux catégories
  // peuvent porter le même nom, mais l'ID original est unique côté Discord.
  for (const category of backup.categories) {
    try {
      const created = (await guild.channels.create({
        name: category.name,
        type: 4, // GuildCategory
        position: category.position,
      })) as CreatedChannelLike;
      if (category.id) idRemap.set(category.id, created.id);
      restored++;
    } catch (error) {
      failed++;
      logger.warn(
        `[serverBackup] Échec création catégorie "${category.name}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // ── 2. Salons (text + voice) ───────────────────────────────────
  for (const channel of backup.channels) {
    try {
      const channelType = mapStringToChannelType(channel.type);
      if (channelType === null) {
        failed++;
        logger.warn(`[serverBackup] Type de salon inconnu: "${channel.type}"`);
        continue;
      }
      const parentRef =
        channel.parentId !== undefined ? idRemap.get(channel.parentId) : undefined;
      const created = (await guild.channels.create({
        name: channel.name,
        type: channelType,
        topic: channel.topic,
        parent: parentRef,
        position: channel.position,
      })) as CreatedChannelLike;
      idRemap.set(channel.name, created.id);
      restored++;
    } catch (error) {
      failed++;
      logger.warn(
        `[serverBackup] Échec création salon "${channel.name}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // ── 3. Rôles ───────────────────────────────────────────────────
  for (const role of backup.roles) {
    try {
      // Filet de sécurité : on ne recrée jamais @everyone (existe nativement).
      if (role.name === everyoneName) {
        continue;
      }
      await guild.roles.create({
        name: role.name,
        permissions: deserializePerms(role.permissions),
        color: role.color,
        hoist: role.hoist,
        mentionable: role.mentionable,
      });
      restored++;
    } catch (error) {
      failed++;
      logger.warn(
        `[serverBackup] Échec création rôle "${role.name}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  logger.info(
    `[serverBackup] Restauration terminée sur ${guild.name}: ${restored} créé(s), ${failed} échec(s)`,
  );
  return { restored, failed };
}
