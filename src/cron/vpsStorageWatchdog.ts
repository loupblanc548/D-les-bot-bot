/**
 * vpsStorageWatchdog.ts — Layer 10.2: Disk Storage Watchdog Cron
 *
 * Checks disk utilization every 30 minutes (150GB SSD VPS).
 *  - >80% (~120 GB): Yellow alert — low-priority logging
 *  - >92% (~138 GB): Critical alert → freeze non-essential crons,
 *    Layer 4 SOAR Validation Gate DM with remediation buttons
 *
 * Also runs a heartbeat check every 5 minutes via the maintenance module.
 */

import { schedule, ScheduledTask } from "node-cron";
import logger from "../utils/logger.js";
import {
  checkVpsStorage,
  startUptimeHeartbeat,
  logRecoveryState,
} from "../services/vpsMaintenance.js";

let storageCron: ScheduledTask | null = null;

/**
 * Start the VPS storage watchdog cron (every 30 min).
 */
export function startVpsStorageWatchdog(): void {
  if (storageCron) {
    logger.warn("[VPS-STORAGE-WATCHDOG] Already running — ignored");
    return;
  }

  logger.info(`\x1b[36m[VPS-STORAGE-WATCHDOG] Cron started — disk check every 30 min\x1b[0m`);

  // Initial check on startup
  void checkVpsStorage().catch((err) => {
    logger.debug(
      `[VPS-STORAGE-WATCHDOG] Initial check failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  });

  // Schedule recurring disk check (every 30 min)
  storageCron = schedule("*/30 * * * *", () => {
    void checkVpsStorage().catch((err) => {
      logger.debug(
        `[VPS-STORAGE-WATCHDOG] Check failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  });

  // Start uptime heartbeat (every 5 min)
  startUptimeHeartbeat();

  // Log recovery state on startup
  void logRecoveryState().catch(() => {});
}
