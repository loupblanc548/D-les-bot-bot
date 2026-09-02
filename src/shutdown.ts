/**
 * shutdown.ts — Gestionnaire d'arrêt gracieux
 *
 * Extrait de index.ts pour réduire sa complexité.
 * Évite la duplication entre SIGINT et SIGTERM.
 */

import * as Sentry from "@sentry/node";
import prisma from "./prisma.js";
import logger from "./utils/logger.js";

// Fonctions d'arrêt importées
import { stopMonitoring } from "./services/monitor.js";
import { stopTwitchMonitoring } from "./services/twitch.js";
import { stopPatchNotesService } from "./services/patchNotes.js";
import { stopInstantGamingCheck } from "./services/instantgaming.js";
import { stopInstantGamingNewsCheck } from "./services/instantgaming-news.js";
import { stopSteamNewsMonitoring } from "./cron/steamNewsCron.js";
import { stopFreeGamesMonitoring } from "./cron/freeGamesCron.js";
import { stopDealsMonitoring } from "./cron/dealsCron.js";
import { stopGlobalPatchNotesMonitoring } from "./cron/globalPatchNotesCron.js";
import { stopMonthlyMaintenance } from "./cron/monthlyMaintenance.js";
import { stopTwitterMonitoring } from "./cron/twitterCron.js";
import { stopMapCleanup } from "./events/messages.js";
import { closeBrowser } from "./managers/ScraperManager.js";
import { closeExternalApisBrowser } from "./services/externalApis.js";
import { disconnectRedis } from "./utils/redis.js";
import { stopAutoCleanup } from "./services/auto-cleanup.js";
import { stopLogRetention } from "./cron/logRetention.js";
import { stopLogChannelCleanup } from "./cron/logChannelCleanup.js";
import { stopAgentBrain } from "./services/agentBrain.js";
import { stopPersonalityEngine } from "./services/personalityEngine.js";
import { stopMediaWorker } from "./infrastructure/processIsolator.js";
import { shutdownLogQueue } from "./queues/logQueue.js";
import { stopControlServer } from "./control-server.js";
import { stopBridgeServer } from "./infrastructure/bridge/bridgeServer.js";
import { stopInfraWatchdog } from "./services/infraWatchdog.js";
import { stopConfigCache } from "./services/configCache.js";
import { stopDmCleanup } from "./services/dmCleanup.js";
import { shutdownOpenTelemetry } from "./utils/otel-setup.js";
import type {} from "discord.js";

export type ClientDestroyFn = () => void;

/**
 * Délai maximum accordé aux fermetures asynchrones. Passé ce délai on sort
 * quand même, pour qu'un connecteur bloqué n'empêche pas l'arrêt (et ne
 * finisse pas tué par SIGKILL sans le moindre log).
 */
const SHUTDOWN_TIMEOUT_MS = 15_000;

// Stocke la référence au client.destroy pour le shutdown
let destroyClient: ClientDestroyFn | null = null;
const intervalsToClear: (NodeJS.Timeout | null)[] = [];

export function registerDestroyClient(fn: ClientDestroyFn): void {
  destroyClient = fn;
}

export function registerInterval(interval: NodeJS.Timeout | null): void {
  if (interval) intervalsToClear.push(interval);
}

async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`\n[Shutdown] Signal ${signal} reçu. Arrêt du bot...`);

  // Enregistrer l'heure d'arrêt pour que le startup sache si c'est un vrai arrêt ou un restart
  try {
    const { writeFile } = await import("node:fs/promises");
    await writeFile("/opt/bot/.last_shutdown", String(Date.now()), { mode: 0o600 });
  } catch (err) {
    logger.warn(`[Shutdown] Impossible d'écrire .last_shutdown: ${err}`);
  }

  // Arrêter tous les services monitoring
  const stopFns = [
    stopMonitoring,
    stopTwitchMonitoring,
    stopPatchNotesService,
    stopInstantGamingCheck,
    stopInstantGamingNewsCheck,
    stopSteamNewsMonitoring,
    stopFreeGamesMonitoring,
    stopDealsMonitoring,
    stopGlobalPatchNotesMonitoring,
    stopMonthlyMaintenance,
    stopTwitterMonitoring,
    stopMapCleanup,
    stopAutoCleanup,
    stopLogRetention,
    stopLogChannelCleanup,
    stopAgentBrain,
    stopPersonalityEngine,
    stopMediaWorker,
    stopInfraWatchdog,
    stopConfigCache,
    stopDmCleanup,
  ];

  for (const fn of stopFns) {
    try {
      fn();
    } catch (err) {
      logger.error(`[Shutdown] Erreur arrêt: ${err}`);
    }
  }

  // Nettoyer les intervalles
  for (const interval of intervalsToClear) {
    if (interval) clearInterval(interval);
  }

  // Couper la réception d'évènements Discord avant de fermer les dépendances,
  // pour ne pas traiter une commande dont la DB vient d'être déconnectée.
  try {
    if (destroyClient) destroyClient();
  } catch (err) {
    logger.error(`[Shutdown] Erreur destroy client: ${err}`);
  }

  // Fermetures asynchrones — attendues, pour que les batchs en vol
  // (log queue, spans OTel, réponses HTTP) soient réellement vidés avant exit.
  await withTimeout("serveurs et files", [
    ["control-server", stopControlServer],
    ["bridge-server", stopBridgeServer],
    ["log-queue", shutdownLogQueue],
    ["opentelemetry", shutdownOpenTelemetry],
    ["scraper-browser", closeBrowser],
    ["screenshot-browser", closeExternalApisBrowser],
  ]);

  await withTimeout("connexions", [
    ["prisma", () => prisma.$disconnect()],
    ["redis", disconnectRedis],
  ]);

  // Sentry en dernier, pour qu'il ait pu recevoir les erreurs ci-dessus.
  await withTimeout("sentry", [["sentry", () => Sentry.close(2000)]]);

  logger.info("[Shutdown] Bot arrêté.");
  process.exit(0);
}

type AsyncCloser = [name: string, close: () => unknown];

/**
 * Exécute un groupe de fermetures en parallèle, en journalisant les échecs et
 * sans jamais dépasser SHUTDOWN_TIMEOUT_MS.
 */
async function withTimeout(label: string, closers: AsyncCloser[]): Promise<void> {
  let timer: NodeJS.Timeout | undefined;

  const all = Promise.allSettled(
    closers.map(async ([name, close]) => {
      try {
        await close();
      } catch (err) {
        logger.error(`[Shutdown] Échec fermeture ${name}: ${err}`);
      }
    }),
  );

  const guard = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      logger.error(`[Shutdown] Timeout (${SHUTDOWN_TIMEOUT_MS}ms) sur: ${label}`);
      resolve();
    }, SHUTDOWN_TIMEOUT_MS);
  });

  try {
    await Promise.race([all, guard]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function attachShutdownHandlers(): void {
  // Un second signal pendant l'arrêt ne doit pas lancer un shutdown concurrent.
  let shuttingDown = false;

  const onSignal = (signal: string): Promise<void> => {
    if (shuttingDown) {
      logger.warn(`[Shutdown] ${signal} ignoré: arrêt déjà en cours.`);
      return Promise.resolve();
    }
    shuttingDown = true;
    return gracefulShutdown(signal);
  };

  process.on("SIGINT", () => onSignal("SIGINT"));
  process.on("SIGTERM", () => onSignal("SIGTERM"));
}
