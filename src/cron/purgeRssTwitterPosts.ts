// src/cron/purgeRssTwitterPosts.ts
/**
 * Purge mensuelle de la table `rss_twitter_posts` via node-cron.
 *
 * - Planifie l'exécution par défaut le 1er de chaque mois à 03:00 UTC.
 * - Supprime les lignes dont `posted_at < NOW() - retention`.
 * - Variables d'environnement supportées :
 *      RSS_PURGE_CRON  (override du cron expression)
 *      RSS_PURGE_DAYS  (override de la rétention en jours)
 *      TZ              (fuseau horaire, défaut UTC)
 *
 * Cycle de vie aligné avec les autres crons du projet :
 *   - startPurgeRssTwitterPosts()  → à appeler depuis src/startup.ts
 *   - stopPurgeRssTwitterPosts()   → à appeler depuis src/shutdown.ts
 *   - runPurge()                   → exécution manuelle (tests, /admin)
 *
 * Propriété du pool : si aucun `pool` n'est passé, le module en crée un
 * et le ferme sur `stop()`. Si un pool externe est fourni, l'appelant
 * reste propriétaire (le module ne le fermera pas).
 */

import cron, { type ScheduledTask } from 'node-cron';
import pg, { type Pool } from 'pg';

const { Pool: PgPool } = pg;

const DEFAULT_CRON = '0 3 1 * *';
const DEFAULT_RETENTION_DAYS = 90;

export interface PurgeLogger {
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
}

export interface PurgeOptions {
  /** Cron expression (défaut via env RSS_PURGE_CRON puis "0 3 1 * *") */
  schedule?: string;
  /** Rétention en jours (défaut via env RSS_PURGE_DAYS puis 90) */
  retentionDays?: number;
  /** Pool pg pré-existant (sinon créé en interne). Le module ne le fermera PAS. */
  pool?: Pool;
  logger?: PurgeLogger;
  /** Fuseau horaire du cron (défaut via env TZ puis UTC) */
  timezone?: string;
}

let task: ScheduledTask | null = null;
let pool: Pool | undefined = undefined;
let ownsPool = false;
let logger: PurgeLogger | null = null;

/**
 * Démarre la purge planifiée. Idempotent : un deuxième appel est ignoré.
 */
export function startPurgeRssTwitterPosts(
  options: PurgeOptions = {},
): void {
  if (task) {
    options.logger?.warn?.('[purgeRssTwitterPosts] déjà démarré, ignoré.');
    return;
  }

  const schedule =
    options.schedule ?? process.env.RSS_PURGE_CRON ?? DEFAULT_CRON;
  const retentionDays =
    options.retentionDays ??
    Number(process.env.RSS_PURGE_DAYS ?? DEFAULT_RETENTION_DAYS);
  const timezone = options.timezone ?? process.env.TZ ?? 'UTC';
  const log: PurgeLogger = options.logger ?? console;
  logger = log;

  if (!cron.validate(schedule)) {
    log.error?.(
      `[purgeRssTwitterPosts] expression cron invalide : ${schedule}`,
    );
    return;
  }
  if (!Number.isFinite(retentionDays) || retentionDays < 1) {
    log.error?.(
      `[purgeRssTwitterPosts] retentionDays invalide : ${retentionDays}`,
    );
    return;
  }

  if (options.pool) {
    pool = options.pool;
    ownsPool = false;
  } else {
    pool = new PgPool({
      connectionString:
        process.env.DATABASE_URL ?? process.env.NEON_DATABASE_URL,
      ssl: detectSsl(),
      max: 2,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    ownsPool = true;
  }

  try {
    // node-cron v4 : le task est schedulé par défaut ; on stop via task.stop().
    task = cron.schedule(
      schedule,
      () => {
        const activePool = pool; // snapshot: évite la race si stop() coupe pendant un tick en vol
        void runPurge(retentionDays, activePool, log).catch((err: unknown) =>
          log.error?.(
            '[purgeRssTwitterPosts] erreur tick :',
            err instanceof Error ? err.message : err,
          ),
        );
      },
      { timezone },
    );
  } catch (err) {
    log.error?.(
      '[purgeRssTwitterPosts] cron.schedule a échoué :',
      err instanceof Error ? err.message : err,
    );
    if (ownsPool && pool) {
      void pool.end().catch(() => {});
    }
    task = null;
    pool = undefined;
    ownsPool = false;
    return;
  }

  log.info?.(
    `[purgeRssTwitterPosts] démarré — cron=${schedule}, rétention=${retentionDays}j, tz=${timezone}`,
  );
}

/**
 * Arrête le cron. Ferme le pool uniquement s'il appartient au module.
 */
export async function stopPurgeRssTwitterPosts(): Promise<void> {
  const log = logger ?? console;
  if (task) {
    task.stop();
    task = null;
  }
  if (pool && ownsPool) {
    await pool.end().catch(() => {});
  }
  pool = undefined;
  ownsPool = false;
  logger = null;
  log.info?.('[purgeRssTwitterPosts] arrêté.');
}

/**
 * Exécute la purge à la demande. Renvoie le nombre de lignes supprimées.
 * Postgres déclenche ensuite un autovacuum pour récupérer l'espace disque.
 */
export async function runPurge(
  retentionDays: number = DEFAULT_RETENTION_DAYS,
  poolArg?: Pool,
  log: PurgeLogger = console,
): Promise<number> {
  const retention = Math.max(1, Math.floor(retentionDays));

  const ownPool =
    poolArg ??
    new PgPool({
      connectionString:
        process.env.DATABASE_URL ?? process.env.NEON_DATABASE_URL,
      ssl: detectSsl(),
      max: 2,
    });

  try {
    const { rowCount } = await ownPool.query(
      `DELETE FROM rss_twitter_posts
         WHERE posted_at < NOW() - make_interval(days => $1::int)`,
      [retention],
    );
    const deleted = rowCount ?? 0;
    log.info?.(
      `[purgeRssTwitterPosts] ${deleted} ligne(s) purgée(s) (> ${retention} jours).`,
    );
    return deleted;
  } finally {
    if (!poolArg) {
      await ownPool.end().catch(() => {});
    }
  }
}

function detectSsl(): false | { rejectUnauthorized: false } {
  const url =
    process.env.DATABASE_URL ?? process.env.NEON_DATABASE_URL ?? '';
  return url.includes('sslmode=require') || url.includes('ssl=true')
    ? { rejectUnauthorized: false }
    : false;
}
