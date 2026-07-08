/**
 * eventScheduler.ts — Planificateur d'événements serveur
 *
 * Service léger, in-memory. Le rôle :
 *   - createEvent(...) : crée un événement planifié.
 *   - listEvents(...) : retourne les événements d'un guild triés par date.
 *   - cancelEvent(id) : supprime l'événement.
 *   - checkEvents(client) : à invoquer périodiquement (CRON ou setInterval).
 *     Pour chaque événement dont `scheduledAt <= now`, envoie un embed
 *     dans `channelId` puis retire l'événement de la map.
 *
 * Timezone : on stocke `scheduledAt` en UTC (Date) ; on formate les
 * affichages avec `Intl.DateTimeFormat` en respectant une locale/zone
 * passée par le caller (default : fr-FR / Europe/Paris).
 *
 * Si le salon n'existe plus / le bot n'y a plus accès, on log un
 * warning et on supprime l'événement silencieusement — pas de
 * retentative pour ne pas spammer.
 */

import { Client, EmbedBuilder, TextChannel } from "discord.js";
import logger from "../utils/logger.js";

// ─── Types ────────────────────────────────────────────────────────

export interface ServerEvent {
  id: string;
  guildId: string;
  name: string;
  description: string;
  /** Date absolue (UTC). */
  scheduledAt: Date;
  channelId: string;
  /** ID Discord du créateur. */
  createdBy: string;
  /**
   * Décalage en ms avant l'heure planifiée à laquelle on veut un
   * rappel (ex: 15 * 60_000 = 15 minutes avant). 0 = pas de rappel.
   * NOTE : seul l'envoi à l'heure est implémenté ici ; ce champ est
   * conservé pour les callers qui veulent poster un "événement arrive
   * bientôt" via leur propre orchestrateur.
   */
  reminderMs: number;
}

// ─── Store en mémoire ─────────────────────────────────────────────
const eventsById = new Map<string, ServerEvent>();
const eventsByGuild = new Map<string, Set<string>>();

// ─── Helpers ──────────────────────────────────────────────────────

function newId(guildId: string): string {
  return `${guildId}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function indexByGuild(e: ServerEvent): void {
  let set = eventsByGuild.get(e.guildId);
  if (!set) {
    set = new Set<string>();
    eventsByGuild.set(e.guildId, set);
  }
  set.add(e.id);
}

function unindexByGuild(guildId: string, id: string): void {
  const set = eventsByGuild.get(guildId);
  if (!set) return;
  set.delete(id);
  if (set.size === 0) eventsByGuild.delete(guildId);
}

// ─── API publique ─────────────────────────────────────────────────

/**
 * Crée un nouvel événement. Valide sommairement les paramètres et
 * retourne l'objet créé.
 */
export function createEvent(
  guildId: string,
  name: string,
  description: string,
  scheduledAt: Date,
  channelId: string,
  createdBy: string,
  reminderMs: number = 0,
): ServerEvent {
  if (!guildId) throw new Error("[eventScheduler] guildId requis");
  if (!name || typeof name !== "string") {
    throw new Error("[eventScheduler] name requis");
  }
  if (!(scheduledAt instanceof Date) || Number.isNaN(scheduledAt.getTime())) {
    throw new Error("[eventScheduler] scheduledAt invalide");
  }
  if (!channelId) throw new Error("[eventScheduler] channelId requis");
  if (!createdBy) throw new Error("[eventScheduler] createdBy requis");
  if (!Number.isFinite(reminderMs) || reminderMs < 0) {
    throw new Error(
      `[eventScheduler] reminderMs invalide (${reminderMs})`,
    );
  }

  const e: ServerEvent = {
    id: newId(guildId),
    guildId,
    name: name.slice(0, 200),
    description: description.slice(0, 2000),
    scheduledAt,
    channelId,
    createdBy,
    reminderMs,
  };
  eventsById.set(e.id, e);
  indexByGuild(e);
  logger.info(
    `[eventScheduler] Événement créé: ${e.id} "${name}" à ${scheduledAt.toISOString()}`,
  );
  return e;
}

/**
 * Liste les événements d'un guild, triés par date croissante (le
 * plus proche en premier).
 */
export function listEvents(guildId: string): ServerEvent[] {
  const ids = eventsByGuild.get(guildId);
  if (!ids) return [];
  return Array.from(ids)
    .map((id) => eventsById.get(id))
    .filter((e): e is ServerEvent => Boolean(e))
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}

/**
 * Supprime un événement par id. Retourne true si quelque chose a été
 * effectivement retiré.
 */
export function cancelEvent(id: string): boolean {
  const e = eventsById.get(id);
  if (!e) return false;
  eventsById.delete(id);
  unindexByGuild(e.guildId, id);
  logger.info(`[eventScheduler] Événement supprimé: ${id}`);
  return true;
}

/**
 * Inspection test : retourne un événement précis.
 */
export function getEvent(id: string): ServerEvent | null {
  return eventsById.get(id) ?? null;
}

/**
 * Reset complet (utile pour tests).
 */
export function clearEvents(): void {
  eventsById.clear();
  eventsByGuild.clear();
}

/**
 * Itère tous les événements dus (`scheduledAt <= now`). Pour chacun,
 * tente de poster un embed dans le channelId. En cas d'échec (salon
 * introuvable, permissions perdues), on log un warning et on supprime
 * l'événement silencieusement.
 *
 * Options de format (timezone, locale) contrôlent l'affichage :
 *   - `tz` défaut "Europe/Paris"
 *   - `locale` défaut "fr-FR"
 *
 * Cette fonction ne lance jamais : les erreurs par événement sont
 * avalées dans le log.
 */
export async function checkEvents(
  client: Client,
  opts: { tz?: string; locale?: string } = {},
): Promise<{ dispatched: ServerEvent[] }> {
  if (!client) {
    logger.warn("[eventScheduler] checkEvents: client manquant");
    return { dispatched: [] };
  }
  const tz = opts.tz ?? "Europe/Paris";
  const locale = opts.locale ?? "fr-FR";
  const now = Date.now();
  const dispatched: ServerEvent[] = [];

  // Snapshot pour mutation safe pendant itération.
  const ids = Array.from(eventsById.keys());
  for (const id of ids) {
    const e = eventsById.get(id);
    if (!e || e.scheduledAt.getTime() > now) continue;

    try {
      const channel = await client.channels.fetch(e.channelId);
      if (!channel || !channel.isTextBased()) {
        logger.warn(
          `[eventScheduler] Salon introuvable ou non textuel: ${e.channelId} — événement ${e.id} supprimé`,
        );
        cancelEvent(e.id);
        continue;
      }
      // Type narrowing : c'est un TextChannel (GuildNews ou DMChannel
      // restent possibles, mais on n'envoie qu'aux TextChannel-like).
      const embed = buildEventEmbed(e, { tz, locale });
      await (channel as TextChannel).send({ embeds: [embed] });
      dispatched.push(e);
      cancelEvent(e.id); // one-shot
      logger.info(
        `[eventScheduler] 📣 Événement envoyé: ${e.id} "${e.name}"`,
      );
    } catch (error) {
      logger.warn(
        `[eventScheduler] Échec dispatch événement ${e.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      // On retire quand même pour ne pas retenter en boucle.
      cancelEvent(e.id);
    }
  }

  return { dispatched };
}

// ─── Embed helper ─────────────────────────────────────────────────

function buildEventEmbed(
  e: ServerEvent,
  opts: { tz: string; locale: string },
): EmbedBuilder {
  let when = e.scheduledAt.toISOString();
  try {
    const fmt = new Intl.DateTimeFormat(opts.locale, {
      timeZone: opts.tz,
      dateStyle: "full",
      timeStyle: "short",
    });
    when = fmt.format(e.scheduledAt);
  } catch {
    // Locale/tz invalide → on retombe sur ISO.
  }
  return new EmbedBuilder()
    .setTitle(`📅 ${e.name}`)
    .setDescription(e.description || "_(pas de description)_")
    .addFields(
      { name: "Quand", value: when, inline: false },
      {
        name: "Rappel",
        value:
          e.reminderMs > 0
            ? `${Math.round(e.reminderMs / 60_000)} min avant`
            : "Aucun",
        inline: true,
      },
    )
    .setColor(0x3498db)
    .setTimestamp(e.scheduledAt)
    .setFooter({ text: `eventId: ${e.id}` });
}
