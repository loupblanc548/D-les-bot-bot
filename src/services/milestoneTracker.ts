/**
 * milestoneTracker.ts — Suivi des jalons d'un serveur
 *
 * Permet à un admin de définir des objectifs (ex: "1000 membres", "50 boosts")
 * et déclenche un message congratulatif dans le salon lié quand l'objectif
 * est atteint. Les jalons sont des records en mémoire, pas une table
 * Prisma — c'est volontairement petit pour des usages éphémères.
 *
 * Types supportés :
 *   - "members"  : progression sur le nombre de membres du guild.
 *   - "messages" : progression sur le compteur de messages globaux.
 *   - "boosts"   : progression sur le nombre de boosts serveur.
 *   - "online"   : progression sur le nombre de membres en ligne.
 *
 * Un jalon est marqué `achievedAt` une fois atteint ; il ne peut être
 * atteint qu'une seule fois (anti-spam). Si on modifie la cible d'un
 * jalon déjà atteint via `setMilestone`, on réinitialise `current` et
 * `achievedAt` pour permettre un nouveau déclenchement.
 */

import { EmbedBuilder, Guild } from "discord.js";
import logger from "../utils/logger.js";

// ─── Types ────────────────────────────────────────────────────────

export type MilestoneType = "members" | "messages" | "boosts" | "online";

export interface Milestone {
  id: string;
  guildId: string;
  type: MilestoneType;
  target: number;
  /** Dernière valeur observée par `checkMilestone`. */
  current: number;
  /** Date du premier déclenchement. Null tant que non atteint. */
  achievedAt: Date | null;
  /** Salon cible pour la notification de félicitations. */
  channelId: string;
}

// ─── Store en mémoire ─────────────────────────────────────────────
const milestonesById = new Map<string, Milestone>();
const milestonesByGuild = new Map<string, Set<string>>();

// ─── Helpers ──────────────────────────────────────────────────────

function newId(guildId: string): string {
  // Canvas simple : timestamp + random court. Suffisant pour un store en
  // mémoire non-persistant ; pas une contrainte crypto.
  return `${guildId}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function indexByGuild(m: Milestone): void {
  let set = milestonesByGuild.get(m.guildId);
  if (!set) {
    set = new Set<string>();
    milestonesByGuild.set(m.guildId, set);
  }
  set.add(m.id);
}

function unindexByGuild(guildId: string, id: string): void {
  const set = milestonesByGuild.get(guildId);
  if (!set) return;
  set.delete(id);
  if (set.size === 0) milestonesByGuild.delete(guildId);
}

// ─── API publique ─────────────────────────────────────────────────

/**
 * Crée ou met à jour un jalon. Si un jalon ayant la même combinaison
 * `guildId+type` existe déjà, on fusionne en gardant l'`id` original
 * (et son `achievedAt`) mais on met à jour `target` et `channelId`.
 * Cette politique permet à l'admin de corriger une cible sans perdre
 * l'historique ; un nouveau jalon pour le même type nécessite
 * `forceNewId=false` (par défaut).
 *
 * @param forceNewId Si true, crée toujours un nouvel id (utile pour
 *                   supporter plusieurs jalons du MÊME type).
 */
export function setMilestone(
  guildId: string,
  type: MilestoneType,
  target: number,
  channelId: string,
  opts: { forceNewId?: boolean } = {},
): Milestone {
  if (!guildId || !type || !channelId) {
    throw new Error(
      "[milestoneTracker] setMilestone: guildId/type/channelId requis",
    );
  }
  if (!Number.isFinite(target) || target <= 0) {
    throw new Error(
      `[milestoneTracker] setMilestone: target invalide (${target})`,
    );
  }

  if (!opts.forceNewId) {
    const existing = findByGuildType(guildId, type);
    if (existing) {
      existing.target = target;
      existing.channelId = channelId;
      // Si on remonte la cible au-dessus de `current` ET qu'on était
      // déjà atteint : on ne réinitialise pas (l'événement reste acquis).
      // Si on baisse la cible : on réinitialise pour permettre un re-déclenchement
      // uniquement si `current >= target` n'est plus vrai.
      if (existing.achievedAt && existing.current < target) {
        existing.achievedAt = null;
      }
      logger.info(
        `[milestoneTracker] Jalon mis à jour: ${existing.id} (${type}=${target})`,
      );
      return existing;
    }
  }

  const m: Milestone = {
    id: newId(guildId),
    guildId,
    type,
    target,
    current: 0,
    achievedAt: null,
    channelId,
  };
  milestonesById.set(m.id, m);
  indexByGuild(m);
  logger.info(
    `[milestoneTracker] Nouveau jalon: ${m.id} (${type} → ${target})`,
  );
  return m;
}

/**
 * Répertorie les jalons d'un guild, triés par cible croissante (le plus
 * modeste en premier — utile pour dashboards).
 */
export function listMilestones(guildId: string): Milestone[] {
  const ids = milestonesByGuild.get(guildId);
  if (!ids) return [];
  return Array.from(ids)
    .map((id) => milestonesById.get(id))
    .filter((m): m is Milestone => Boolean(m))
    .sort((a, b) => a.target - b.target);
}

function findByGuildType(
  guildId: string,
  type: MilestoneType,
): Milestone | null {
  const list = listMilestones(guildId);
  for (const m of list) {
    if (m.type === type) return m;
  }
  return null;
}

/**
 * Helper pour tests / dashboards : retourne un jalon précis.
 */
export function getMilestone(id: string): Milestone | null {
  return milestonesById.get(id) ?? null;
}

/**
 * Supprime un jalon (utile quand on n'en veut plus le tracking).
 * Retourne true si quelque chose a effectivement été retiré.
 */
export function removeMilestone(id: string): boolean {
  const m = milestonesById.get(id);
  if (!m) return false;
  milestonesById.delete(id);
  unindexByGuild(m.guildId, id);
  logger.info(`[milestoneTracker] Jalon supprimé: ${id}`);
  return true;
}

/**
 * Évalue tous les jalons d'un guild du type demandé. Si au moins un
 * jalon est franchi pour la première fois, on construit un embed de
 * félicitations (avec % atteint, type, cible). Renvoie un tableau
 * d'embeds — un par jalon nouvellement atteint.
 *
 * Le caller (orchestrateur CRON ou autre) peut ensuite poster les
 * embeds dans `milestone.channelId` via une seconde étape.
 */
export async function checkMilestone(
  guild: Guild,
  type: MilestoneType,
  currentValue: number,
): Promise<{ newlyAchieved: Milestone[]; embeds: EmbedBuilder[] }> {
  if (!guild) {
    logger.warn("[milestoneTracker] checkMilestone: guild manquant");
    return { newlyAchieved: [], embeds: [] };
  }
  if (!Number.isFinite(currentValue)) {
    logger.warn(
      `[milestoneTracker] checkMilestone: currentValue invalide (${currentValue})`,
    );
    return { newlyAchieved: [], embeds: [] };
  }

  const candidates = listMilestones(guild.id).filter((m) => m.type === type);
  const newlyAchieved: Milestone[] = [];
  const embeds: EmbedBuilder[] = [];

  for (const m of candidates) {
    m.current = currentValue;
    const reached = currentValue >= m.target;
    if (reached && m.achievedAt === null) {
      m.achievedAt = new Date();
      newlyAchieved.push(m);
      embeds.push(buildCongratsEmbed(guild, m));
      logger.info(
        `[milestoneTracker] 🎉 Jalon atteint: ${m.id} (${type}=${currentValue}/${m.target})`,
      );
    }
  }

  return { newlyAchieved, embeds };
}

/**
 * Reset complet (utile pour tests).
 */
export function clearMilestones(): void {
  milestonesById.clear();
  milestonesByGuild.clear();
}

// ─── Embed helper ─────────────────────────────────────────────────

function buildCongratsEmbed(guild: Guild, m: Milestone): EmbedBuilder {
  const typeLabel = TYPE_LABELS[m.type] ?? m.type;
  const emoji = TYPE_EMOJI[m.type] ?? "🎯";
  return new EmbedBuilder()
    .setTitle(`${emoji} Jalon atteint : ${typeLabel} !`)
    .setDescription(
      [
        `**Serveur** : ${guild.name}`,
        `**Type** : ${typeLabel}`,
        `**Cible** : ${m.target}`,
        `**Valeur actuelle** : ${m.current}`,
        `**Atteint le** : <t:${Math.floor(m.achievedAt!.getTime() / 1000)}:F>`,
      ].join("\n"),
    )
    .setColor(0x2ecc71)
    .setTimestamp(m.achievedAt ?? new Date());
}

const TYPE_LABELS: Record<MilestoneType, string> = {
  members: "Membres",
  messages: "Messages",
  boosts: "Boosts",
  online: "En ligne",
};

const TYPE_EMOJI: Record<MilestoneType, string> = {
  members: "👥",
  messages: "💬",
  boosts: "🚀",
  online: "🟢",
};
