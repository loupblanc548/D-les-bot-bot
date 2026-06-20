import { Client } from "discord.js";
import { startReminderWorker } from "./reminders/worker.js";
import { handleAIChat } from "./ai/handler.js";
import { startRSSAggregator } from "./rss/aggregator.js";
import { startSystemDiagnostic } from "./diagnostic/systemDiagnostic.js";
import { startEpicGamesAggregator } from "./epic/epicGames.js";
import { command as remindmeCommand } from "./reminders/command.js";

export function initializeModules(client: Client): void {
  startReminderWorker(client);
  startRSSAggregator(client);
  startSystemDiagnostic(client);
  startEpicGamesAggregator(client);
  console.log("[Modules] All modules initialized");
}

export { remindmeCommand };
export { handleAIChat };
