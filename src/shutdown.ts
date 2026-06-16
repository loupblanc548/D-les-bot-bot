/**
 * shutdown.ts — Gestionnaire d'arrêt gracieux
 *
 * Extrait de index.ts pour réduire sa complexité.
 * Évite la duplication entre SIGINT et SIGTERM.
 */

import * as Sentry from "@sentry/node";
import prisma from "./prisma";
import logger from "./utils/logger";

// Fonctions d'arrêt importées
import { stopMonitoring } from "./services/monitor";
import { stopTwitchMonitoring } from "./services/twitch";
import { stopPatchNotesService } from "./services/patchNotes";
import { stopInstantGamingCheck } from "./services/instantgaming";
import { stopInstantGamingNewsCheck } from "./services/instantgaming-news";
import { stopSteamNewsMonitoring } from "./cron/steamNewsCron";
import { stopFreeGamesMonitoring } from "./cron/freeGamesCron";
import { stopDealsMonitoring } from "./cron/dealsCron";
import { stopGlobalPatchNotesMonitoring } from "./cron/globalPatchNotesCron";
import { stopMonthlyMaintenance } from "./cron/monthlyMaintenance";
import { stopTwitterMonitoring } from "./cron/twitterCron";
import { stopMapCleanup } from "./events/messages";
import { closeBrowser } from "./managers/ScraperManager";

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
    stopMonitoring, stopTwitchMonitoring, stopPatchNotesService,
    stopInstantGamingCheck, stopInstantGamingNewsCheck,
    stopSteamNewsMonitoring, stopFreeGamesMonitoring,
    stopDealsMonitoring, stopGlobalPatchNotesMonitoring,
    stopMonthlyMaintenance, stopTwitterMonitoring, stopMapCleanup,
  ];

  for (const fn of stopFns) {
    try { fn(); } catch (err) { logger.error(`[Shutdown] Erreur arrêt: ${err}`); }
  }

  // Nettoyer les intervalles
  for (const interval of intervalsToClear) {
    if (interval) clearInterval(interval);
  }

  // Déconnexions
  try { await prisma.$disconnect(); } catch { /* silent */ }
  try { if (destroyClient) destroyClient(); } catch { /* silent */ }
  try { await closeBrowser(); } catch { /* silent */ }
  try { await Sentry.close(2000); } catch { /* silent */ }

  logger.info("[Shutdown] Bot arrêté.");
  process.exit(0);
}

export function attachShutdownHandlers(): void {
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
}
