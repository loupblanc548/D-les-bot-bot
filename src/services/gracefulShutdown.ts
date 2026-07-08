/**
 * gracefulShutdown.ts — Arrêt gracieux parallelisable
 *
 * API volontairement différente de `src/shutdown.ts` (qui gère déjà
 * SIGINT/SIGTERM côté entrypoint) : ici on expose une registre de jobs
 * de nettoyage, lancés en parallèle avec un timeout strict par job.
 *
 * Cas d'usage typique : un sous-système (scheduler, batch, WebSocket
 * secondaire) déclare ses hooks ici via `registerShutdownHandler`, et
 * chaque hook est garanti de se terminer en 10s max avant qu'on
 * déconnecte le client Discord.
 *
 * Note de cohabitation : `src/shutdown.ts` reste l'autorité pour la
 * séquence de shutdown du bot principal ; ce module est destiné aux
 * plugins / workers qui ont besoin d'un registre découplé.
 */

import { Client } from "discord.js";
import logger from "../utils/logger.js";

// ─── Types ────────────────────────────────────────────────────────

export type ShutdownJob = {
  name: string;
  cleanup: () => Promise<void>;
};

interface RuntimeRegistration {
  jobs: ShutdownJob[];
  /** Vrai une fois que `triggerShutdown()` a démarré (anti double-run). */
  triggered: boolean;
  /** Vrai une fois que les listeners process.on ont été attachés. */
  listenersAttached: boolean;
}

// ─── Constantes ───────────────────────────────────────────────────

/** Timeout strict appliqué à chaque job individuel. */
const JOB_TIMEOUT_MS = 10_000;

// ─── Module-level state ───────────────────────────────────────────

/** Module-level singleton : on s'attend à un seul registre global. */
const registration: RuntimeRegistration = {
  jobs: [],
  triggered: false,
  listenersAttached: false,
};

// ─── API publique ─────────────────────────────────────────────────

/**
 * Enregistre une liste de jobs à exécuter sur SIGINT ou SIGTERM. Chaque
 * job est exécuté en parallèle avec un timeout de 10s. Une fois tous
 * les jobs terminés (succès, échec ou timeout), on déconnecte le
 * client Discord proprement.
 *
 * Idempotent sur les listeners process : un second (ou N-ième) appel
 * étend simplement la liste de jobs sans re-attacher SIGINT/SIGTERM.
 */
export function registerShutdownHandler(
  client: Client,
  jobs: ShutdownJob[],
): void {
  if (!client) {
    logger.warn("[gracefulShutdown] client manquant — register ignoré");
    return;
  }
  if (!Array.isArray(jobs)) {
    logger.warn("[gracefulShutdown] jobs non-array — register ignoré");
    return;
  }

  registration.jobs.push(...jobs);
  logger.info(
    `[gracefulShutdown] ${jobs.length} job(s) enregistré(s) — total: ${registration.jobs.length}`,
  );

  if (!registration.listenersAttached) {
    registration.listenersAttached = true;
    process.on("SIGINT", () => {
      void triggerShutdown(client, "SIGINT");
    });
    process.on("SIGTERM", () => {
      void triggerShutdown(client, "SIGTERM");
    });
    logger.info("[gracefulShutdown] Handlers SIGINT et SIGTERM enregistrés");
  }
}

/**
 * Déclenche manuellement la séquence de shutdown (utile pour les tests
 * ou un déclenchement programmatique). Anti-double-run : un second
 * appel (ex. SIGTERM après SIGINT) est ignoré sans warning bloquant.
 */
export async function triggerShutdown(
  client: Client,
  signal: string = "manual",
): Promise<void> {
  if (registration.triggered) {
    logger.warn(
      `[gracefulShutdown] Shutdown déjà déclenché — ignoré ${signal}`,
    );
    return;
  }
  registration.triggered = true;
  logger.info(`[gracefulShutdown] Signal ${signal} reçu — début shutdown`);

  await runAllJobs(registration.jobs);
  await disconnectClient(client);
  logger.info(`[gracefulShutdown] Shutdown terminé (signal=${signal})`);
}

/**
 * Inspection utile pour tests : retourne une copie immutable des jobs.
 */
export function getRegisteredJobs(): readonly ShutdownJob[] {
  return registration.jobs.slice();
}

/** Reset complet — à n'utiliser QUE dans les tests. */
export function _resetForTests(): void {
  registration.jobs = [];
  registration.triggered = false;
  registration.listenersAttached = false;
}

// ─── Helpers ──────────────────────────────────────────────────────

async function runAllJobs(jobs: ShutdownJob[]): Promise<void> {
  if (jobs.length === 0) {
    logger.info("[gracefulShutdown] Aucun job à exécuter");
    return;
  }
  logger.info(
    `[gracefulShutdown] Exécution parallèle de ${jobs.length} job(s)…`,
  );
  await Promise.allSettled(jobs.map((job) => runOneJob(job)));
}

async function runOneJob(job: ShutdownJob): Promise<void> {
  const start = Date.now();
  try {
    await withTimeout(job.cleanup(), JOB_TIMEOUT_MS, job.name);
    logger.info(
      `[gracefulShutdown] ✓ ${job.name} terminé en ${Date.now() - start}ms`,
    );
  } catch (error) {
    logger.warn(
      `[gracefulShutdown] ✗ ${job.name} en erreur après ${Date.now() - start}ms: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Encapsule une promesse avec un timeout strict. Si la promesse ne
 * résout pas avant `ms`, on rejette avec une `ShutdownTimeoutError`
 * typée — le caller (runOneJob) la catch et log simplement.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  jobName: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new ShutdownTimeoutError(`${jobName} a dépassé ${ms}ms`));
    }, ms);
    // unref pour ne PAS maintenir la loop event vivante si tout le reste a fini
    timer.unref();
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

class ShutdownTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShutdownTimeoutError";
  }
}

async function disconnectClient(client: Client): Promise<void> {
  try {
    if (client.isReady()) {
      logger.info("[gracefulShutdown] Déconnexion du client Discord…");
      await client.destroy();
      logger.info("[gracefulShutdown] Client Discord déconnecté");
    } else {
      logger.info("[gracefulShutdown] Client déjà déconnecté — skip");
    }
  } catch (error) {
    logger.warn(
      `[gracefulShutdown] Échec déconnexion client: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
