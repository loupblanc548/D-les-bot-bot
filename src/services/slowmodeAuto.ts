/**
 * slowmodeAuto.ts — Auto-régulation du slowmode d'un salon
 *
 * Suit le nombre de messages par salon sur une fenêtre glissante de
 * 60 secondes (fenêtre fixe pour rester simple et unbounded-friendly).
 * Quand le compteur dépasse `threshold` dans la fenêtre, on impose un
 * slowmode de 5 secondes. Quand l'activité redescend sous le seuil,
 * on retire le slowmode — sans condition sur l'écoulement de la
 * fenêtre (la fenêtre est réinitialisée au prochain `recordMessage`).
 *
 * Limitation assumée : la fenêtre est fixe (60s rolling start) — pas de
 * vrai sliding window. Pour une précision millimétrée, garder un buffer
 * de timestamps (coût mémoire). Le présent design est suffisant pour
 * calmer un raid en cours.
 */

import { TextChannel } from "discord.js";
import logger from "../utils/logger.js";

// ─── Constantes ───────────────────────────────────────────────────

/** Longueur de la fenêtre d'analyse en ms. */
const SLOWMODE_WINDOW_MS = 60_000;
/** Slowmode appliqué quand le seuil est dépassé (secondes). */
const SLOWMODE_THRESHOLD_SECONDS = 5;

// ─── Types ────────────────────────────────────────────────────────

interface ChannelActivityState {
  messageCount: number;
  windowStart: number;
}

// ─── Store en mémoire ─────────────────────────────────────────────
const stateByChannelId = new Map<string, ChannelActivityState>();

// ─── API publique ─────────────────────────────────────────────────

/**
 * Incrémente le compteur de messages pour `channelId`. Réinitialise
 * automatiquement la fenêtre si elle est écoulée.
 */
export function recordMessage(channelId: string): void {
  if (!channelId) return;
  const now = Date.now();
  const state = stateByChannelId.get(channelId);
  if (!state || now - state.windowStart > SLOWMODE_WINDOW_MS) {
    stateByChannelId.set(channelId, { messageCount: 1, windowStart: now });
    return;
  }
  state.messageCount += 1;
}

/**
 * Évalue l'état d'un salon et applique/retire le slowmode si nécessaire.
 * À appeler périodiquement ou après chaque burst de messages.
 *
 * - `messageCount > threshold` → slowmode forcé à 5s (s'il ne l'est
 *   pas déjà). Le compteur de la fenêtre courante est conservé pour
 *   permettre un retour à la normale à la prochaine évaluation.
 * - `messageCount <= threshold` ET slowmode actuellement à 5s → reset
 *   à 0 (l'activité est redescendue, on libère le salon). Pas de
 *   condition sur l'écoulement de la fenêtre : le compteur sera de
 *   toute façon ré-initialisé au prochain `recordMessage` quand la
 *   fenêtre roulante expirera.
 */
export async function checkAndAdjust(
  channel: TextChannel,
  threshold: number,
): Promise<void> {
  if (!channel) return;
  if (!Number.isFinite(threshold) || threshold <= 0) {
    logger.warn(`[slowmodeAuto] threshold invalide (${threshold}) — skip`);
    return;
  }

  const state = stateByChannelId.get(channel.id);
  if (!state) return; // aucun message enregistré → rien à faire

  if (state.messageCount > threshold) {
    // Pic d'activité — on impose (ou on garde) le slowmode 5s.
    if (channel.rateLimitPerUser !== SLOWMODE_THRESHOLD_SECONDS) {
      try {
        await channel.setRateLimitPerUser(SLOWMODE_THRESHOLD_SECONDS);
        logger.info(
          `[slowmodeAuto] Slowmode 5s activé sur #${channel.name} (count=${state.messageCount} > ${threshold})`,
        );
      } catch (error) {
        logger.warn(
          `[slowmodeAuto] Échec setRateLimitPerUser sur #${channel.name}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return;
  }

  if (channel.rateLimitPerUser === SLOWMODE_THRESHOLD_SECONDS) {
    // Activité redevenue normale — on retire le slowmode, sans attendre
    // la fin de la fenêtre (la fenêtre sera réinitialisée au prochain message).
    try {
      await channel.setRateLimitPerUser(0);
      logger.info(
        `[slowmodeAuto] Slowmode retiré sur #${channel.name} (count=${state.messageCount} ≤ ${threshold})`,
      );
    } catch (error) {
      logger.warn(
        `[slowmodeAuto] Échec reset rateLimitPerUser sur #${channel.name}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

/** Reset complet (utile pour tests). */
export function clearSlowmodeState(): void {
  stateByChannelId.clear();
}

/** Inspection utilitaire. */
export function getChannelState(
  channelId: string,
): ChannelActivityState | null {
  return stateByChannelId.get(channelId) ?? null;
}
