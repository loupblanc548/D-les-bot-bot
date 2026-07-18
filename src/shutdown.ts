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
import { disconnectRedis } from "./utils/redis.js";
import { stopAutoCleanup } from "./services/auto-cleanup.js";
import { stopLogRetention } from "./cron/logRetention.js";
import { stopLogChannelCleanup } from "./cron/logChannelCleanup.js";
import { stopAgentBrain } from "./services/agentBrain.js";
import { stopPersonalityEngine } from "./services/personalityEngine.js";
import { stopMediaWorker } from "./infrastructure/processIsolator.js";
import { shutdownLogQueue } from "./queues/logQueue.js";
import type {} from "discord.js";

export type ClientDestroyFn = () => void;

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
    () => {
      void shutdownLogQueue();
    },
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

  // Déconnexions
  try {
    await prisma.$disconnect();
  } catch {
    /* silent */
  }
  try {
    await disconnectRedis();
  } catch {
    /* silent */
  }
  try {
    if (destroyClient) destroyClient();
  } catch {
    /* silent */
  }
  try {
    await closeBrowser();
  } catch {
    /* silent */
  }
  try {
    await Sentry.close(2000);
  } catch {
    /* silent */
  }

  logger.info("[Shutdown] Bot arrêté.");
  process.exit(0);
}

export function attachShutdownHandlers(): void {
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
}
