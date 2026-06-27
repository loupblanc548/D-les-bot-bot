/**
 * cronHealthTracker.ts — Suivi de la santé des crons.
 *
 * Compte les échecs consécutifs de chaque cron. Si un cron échoue 3 fois
 * de suite, envoie une alerte via le logger (et optionnellement Discord).
 */

import logger from "../utils/logger.js";
import { pingCronSuccess, pingCronFailure } from "./healthchecks.js";
import { sendCronAlert } from "./ntfy.js";

interface CronHealth {
  consecutiveFailures: number;
  lastSuccess: Date | null;
  lastFailure: Date | null;
  lastError: string | null;
}

const MAX_FAILURES_BEFORE_ALERT = 3;
const cronHealth = new Map<string, CronHealth>();

/**
 * Marque un cron comme ayant réussi. Réinitialise le compteur d'échecs.
 */
export function markCronSuccess(cronName: string): void {
  const health = cronHealth.get(cronName) ?? {
    consecutiveFailures: 0,
    lastSuccess: null,
    lastFailure: null,
    lastError: null,
  };
  health.consecutiveFailures = 0;
  health.lastSuccess = new Date();
  cronHealth.set(cronName, health);
  pingCronSuccess(cronName).catch(() => {});
}

/**
 * Marque un cron comme ayant échoué. Si 3 échecs consécutifs, log une alerte.
 */
export function markCronFailure(cronName: string, error: unknown): void {
  const errorMsg = error instanceof Error ? error.message : String(error);
  const health = cronHealth.get(cronName) ?? {
    consecutiveFailures: 0,
    lastSuccess: null,
    lastFailure: null,
    lastError: null,
  };
  health.consecutiveFailures++;
  health.lastFailure = new Date();
  health.lastError = errorMsg;
  cronHealth.set(cronName, health);

  logger.warn(`[CronHealth] ${cronName} échec #${health.consecutiveFailures}: ${errorMsg}`);

  if (health.consecutiveFailures >= MAX_FAILURES_BEFORE_ALERT) {
    logger.error(
      `[CronHealth] 🚨 ALERTE: ${cronName} a échoué ${health.consecutiveFailures} fois de suite. Dernier succès: ${health.lastSuccess?.toISOString() ?? "jamais"}. Dernière erreur: ${errorMsg}`,
    );
    // Alerte push ntfy.sh (no-op si non configure)
    sendCronAlert(cronName, errorMsg).catch(() => {});
  }

  pingCronFailure(cronName, error).catch(() => {});
}

/**
 * Retourne l'état de santé de tous les crons.
 */
export function getCronHealthReport(): Map<string, CronHealth> {
  return new Map(cronHealth);
}
