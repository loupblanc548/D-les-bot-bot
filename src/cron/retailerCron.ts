/**
 * retailerCron.ts — Cron job pour la surveillance automatique des revendeurs
 *
 * Démarré automatiquement au lancement du bot.
 * Surveille les produits trackés + récupère les deals périodiquement.
 */

import type { Client } from "discord.js";
import logger from "../utils/logger.js";
import { startRetailerMonitoring, stopRetailerMonitoring } from "../services/retailerAlerts.js";

let started = false;

export function initRetailerCron(client: Client): void {
  if (started) {
    logger.warn("[RetailerCron] Déjà démarré");
    return;
  }

  const enabled = process.env.RETAILER_ALERTS_ENABLED !== "false";
  if (!enabled) {
    logger.info(
      "[RetailerCron] Surveillance revendeurs désactivée (RETAILER_ALERTS_ENABLED=false)",
    );
    return;
  }

  logger.info("[RetailerCron] Initialisation de la surveillance revendeurs...");
  startRetailerMonitoring(client);
  started = true;
}

export function shutdownRetailerCron(): void {
  if (!started) return;
  stopRetailerMonitoring();
  started = false;
  logger.info("[RetailerCron] Surveillance revendeurs arrêtée");
}
