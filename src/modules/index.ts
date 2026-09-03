import { Client } from "discord.js";
import logger from "../utils/logger.js";
import { startReminderWorker } from "./reminders/worker.js";
import { startRSSAggregator } from "./rss/aggregator.js";
import { startSystemDiagnostic } from "./diagnostic/systemDiagnostic.js";

/**
 * Background modules that are not started elsewhere in bot.ts / startup.ts.
 *
 * Intentionally NOT started here (would double-run with existing services):
 *  - Epic free games → services/feeds.ts + epicgames.ts
 *  - DB backup → startBackupService / startAutoBackup / vpsBackup cron
 *  - AI chat / media responder → events/messages.ts (would double-reply)
 */
export function initializeModules(client: Client): void {
  startReminderWorker(client);
  startRSSAggregator(client);
  startSystemDiagnostic(client);
  logger.info("[Modules] Reminder worker, RSS aggregator, weekly diagnostic started");
}
