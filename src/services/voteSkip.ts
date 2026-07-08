/**
 * voteSkip.ts — Vote pour skip une musique
 *
 * Petit registre in-memory. Une seule "session de vote" est active
 * par guild à un moment donné : démarrer un nouveau vote remplace
 * l'ancien. Chaque vote est idempotent côté utilisateur (le dernier
 * vote "l'emporte") : voter "yes" après avoir voté "no" retire
 * l'id du set "no".
 *
 * `checkExpired()` nettoie les sessions expirées (à appeler
 * périodiquement, ex: dans un CRON ou après chaque `client.events`).
 */

import logger from "../utils/logger.js";

// ─── Types ────────────────────────────────────────────────────────

export interface VoteSkip {
  guildId: string;
  trackName: string;
  yesVotes: string[];
  noVotes: string[];
  /** Seuil de yes votes pour valider le skip. */
  threshold: number;
  /** Timestamp (ms) d'expiration. `<= now` ⇒ expiré. */
  expiresAt: number;
}

export type VoteResult = {
  passed: boolean;
  yesVotes: number;
  noVotes: number;
  threshold: number;
};

// ─── Constante ────────────────────────────────────────────────────

/** Seuil minimum par défaut si non spécifié. */
const DEFAULT_THRESHOLD = 3;

// ─── Store en mémoire ─────────────────────────────────────────────
const activeVotesByGuild = new Map<string, VoteSkip>();

// ─── API publique ─────────────────────────────────────────────────

/**
 * Démarre (ou remplace) un vote pour `trackName` dans `guildId`.
 *
 * @param durationMs Durée du vote en ms. Default = 30s.
 * @param threshold  Nombre de yes votes requis. Default = 3.
 */
export function startVoteSkip(
  guildId: string,
  trackName: string,
  threshold: number = DEFAULT_THRESHOLD,
  durationMs: number = 30_000,
): VoteSkip {
  if (!guildId) throw new Error("[voteSkip] guildId requis");
  if (!trackName) throw new Error("[voteSkip] trackName requis");
  if (!Number.isFinite(threshold) || threshold <= 0) {
    throw new Error(`[voteSkip] threshold invalide (${threshold})`);
  }
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error(`[voteSkip] durationMs invalide (${durationMs})`);
  }

  const vote: VoteSkip = {
    guildId,
    trackName,
    yesVotes: [],
    noVotes: [],
    threshold,
    expiresAt: Date.now() + durationMs,
  };
  activeVotesByGuild.set(guildId, vote);
  logger.info(
    `[voteSkip] Vote démarré pour ${guildId} — "${trackName}" (threshold=${threshold}, duration=${durationMs}ms)`,
  );
  return vote;
}

/**
 * Enregistre le vote d'un utilisateur. Le dernier vote l'emporte :
 * si l'utilisateur passe de "yes" à "no" (ou inversement), on
 * nettoie son id de l'ancien set.
 *
 * Si le seuil est atteint après l'opération, `passed=true` ET un
 * effet de bord supprime le vote (one-shot).
 *
 * Retourne `null` si aucun vote n'est actif dans ce guild (ou s'il
 * a expiré). Le caller peut alors choisir de ne rien dire ou
 * d'initier un nouveau `startVoteSkip`.
 */
export function vote(
  guildId: string,
  userId: string,
  choice: "yes" | "no",
): VoteResult | null {
  if (!guildId || !userId) return null;
  if (choice !== "yes" && choice !== "no") return null;

  const v = activeVotesByGuild.get(guildId);
  if (!v) return null;

  // Expiration lazy : on retire les votes expirés à la volée.
  if (Date.now() >= v.expiresAt) {
    activeVotesByGuild.delete(guildId);
    logger.debug(`[voteSkip] Vote expiré à la première interaction: ${guildId}`);
    return null;
  }

  // Idempotence : retirer de l'autre set d'abord pour éviter les doublons.
  if (choice === "yes") {
    v.noVotes = v.noVotes.filter((id) => id !== userId);
    if (!v.yesVotes.includes(userId)) v.yesVotes.push(userId);
  } else {
    v.yesVotes = v.yesVotes.filter((id) => id !== userId);
    if (!v.noVotes.includes(userId)) v.noVotes.push(userId);
  }

  const passed = v.yesVotes.length >= v.threshold;
  if (passed) {
    logger.info(
      `[voteSkip] Vote PASSED pour ${guildId} — oui=${v.yesVotes.length}/${v.threshold}`,
    );
    // One-shot : on consomme le vote.
    activeVotesByGuild.delete(guildId);
    return {
      passed: true,
      yesVotes: v.yesVotes.length,
      noVotes: v.noVotes.length,
      threshold: v.threshold,
    };
  }

  return {
    passed: false,
    yesVotes: v.yesVotes.length,
    noVotes: v.noVotes.length,
    threshold: v.threshold,
  };
}

/**
 * Retourne l'état actuel d'un vote (ou null si pas de vote actif).
 * N'altère pas l'état.
 */
export function getVote(guildId: string): VoteSkip | null {
  return activeVotesByGuild.get(guildId) ?? null;
}

/**
 * Annule un vote actif. Retourne true si quelque chose a été retiré.
 */
export function cancelVoteSkip(guildId: string): boolean {
  const removed = activeVotesByGuild.delete(guildId);
  if (removed) logger.info(`[voteSkip] Vote annulé: ${guildId}`);
  return removed;
}

/**
 * Supprime les votes expirés. À appeler périodiquement (CRON). Retourne
 * le nombre de votes nettoyés.
 */
export function checkExpired(now: number = Date.now()): number {
  let cleaned = 0;
  for (const [guildId, v] of activeVotesByGuild.entries()) {
    if (now >= v.expiresAt) {
      activeVotesByGuild.delete(guildId);
      cleaned += 1;
      logger.debug(`[voteSkip] Vote expiré nettoyé: ${guildId}`);
    }
  }
  return cleaned;
}

/**
 * Reset complet (utile pour tests).
 */
export function clearVotes(): void {
  activeVotesByGuild.clear();
}
