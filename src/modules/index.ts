import { Client } from "discord.js";
import { startReminderWorker } from "./reminders/worker.js";
import { handleAIChat } from "./ai/handler.js";
import { startRSSAggregator } from "./rss/aggregator.js";
import { command as remindmeCommand } from "./reminders/command.js";

export function initializeModules(client: Client): void {
  startReminderWorker(client);
  startRSSAggregator(client);
  console.log("[Modules] All modules initialized");
}

export { remindmeCommand };
export { handleAIChat };
