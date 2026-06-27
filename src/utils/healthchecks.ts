/**
 * healthchecks.ts — Integration avec Healthchecks.io
 *
 * Permet a chaque cron de faire un ping HTTP apres execution.
 * Si un cron rate 3 executions, Healthchecks.io envoie une alerte.
 *
 * Config: HEALTHCHECKS_BASE_URL dans .env (ex: https://hc-ping.com/<uuid>)
 * Chaque cron a sa propre URL: <base>/<cron-name>
 *
 * Si HEALTHCHECKS_BASE_URL n'est pas configure, les pings sont no-ops.
 */

import logger from "./logger.js";

const BASE_URL = process.env.HEALTHCHECKS_BASE_URL || "";

/**
 * Envoie un ping de succes a Healthchecks.io pour un cron donne.
 * No-op si HEALTHCHECKS_BASE_URL n'est pas configure.
 */
export async function pingCronSuccess(cronName: string): Promise<void> {
  if (!BASE_URL) return;
  try {
    const url = `${BASE_URL}/${cronName}`;
    await fetch(url, { method: "GET", signal: AbortSignal.timeout(5000) });
  } catch (err) {
    logger.debug(
      `[Healthchecks] Ping success "${cronName}" failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Envoie un ping d'echec a Healthchecks.io pour un cron donne.
 * Le body contient le message d'erreur.
 */
export async function pingCronFailure(cronName: string, error: unknown): Promise<void> {
  if (!BASE_URL) return;
  try {
    const url = `${BASE_URL}/${cronName}/fail`;
    const errorMsg = error instanceof Error ? error.message : String(error);
    await fetch(url, {
      method: "POST",
      body: errorMsg.slice(0, 500),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    logger.debug(
      `[Healthchecks] Ping fail "${cronName}" failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Wrapper qui execute une fonction cron et ping Healthchecks.io
 * automatiquement (success ou failure).
 */
export async function withHealthcheck<T>(cronName: string, fn: () => Promise<T>): Promise<T> {
  try {
    const result = await fn();
    await pingCronSuccess(cronName);
    return result;
  } catch (err) {
    await pingCronFailure(cronName, err);
    throw err;
  }
}
