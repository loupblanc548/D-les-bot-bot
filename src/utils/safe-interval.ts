/**
 * safe-interval.ts — setInterval robuste pour les pollers periodiques.
 *
 * Apporte 3 garanties absentes d'un setInterval brut :
 *   1. Anti-chevauchement : si le tick precedent n'est pas termine, on saute
 *      le tick courant (evite l'empilement quand un check dure > l'intervalle).
 *   2. Capture des rejets de promesse : les fn async sont awaitees et leurs
 *      erreurs loguees (un setInterval brut ne catch pas les rejets async).
 *   3. Jitter optionnel : desynchronise les pollers pour lisser les pics.
 */
import logger from "./logger.js";

export interface SafeIntervalOptions {
  /** Decalage aleatoire max (ms) applique avant chaque tick. Defaut 0. */
  jitterMs?: number;
}

/**
 * @param name      Nom lisible pour les logs (ex. "Monitor").
 * @param fn        Fonction (sync ou async) executee a chaque tick.
 * @param intervalMs Periode en ms.
 * @param options   Options (jitter).
 */
export function safeInterval(
  name: string,
  fn: () => unknown | Promise<unknown>,
  intervalMs: number,
  options: SafeIntervalOptions = {},
): NodeJS.Timeout {
  let running = false;
  const jitter = options.jitterMs ?? 0;

  const tick = async (): Promise<void> => {
    if (running) {
      logger.warn(`[${name}] tick saute : execution precedente encore en cours`);
      return;
    }
    running = true;
    try {
      await fn();
    } catch (err) {
      logger.error(
        `[${name}] erreur dans le tick : ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      running = false;
    }
  };

  return setInterval(() => {
    if (jitter > 0) {
      setTimeout(() => void tick(), Math.floor(Math.random() * jitter));
    } else {
      void tick();
    }
  }, intervalMs);
}
