/**
 * webhookSetup.ts — Auto-register webhook triggers for all notification channels.
 *
 * Called at bot startup to register GitHub/CI/CD webhook endpoints.
 * Each channel gets a unique secret URL: POST /webhook/<secret>
 */

import { registerTrigger } from "./webhookTriggers.js";
import logger from "../utils/logger.js";

interface ChannelWebhookSetup {
  name: string;
  channelId: string;
  provider: "github" | "gitlab" | "generic";
  secret: string;
  events: string[];
}

// Static secrets — deterministic so they survive restarts.
// Format: wh_<channel>_<random>
const WEBHOOK_SETUP: ChannelWebhookSetup[] = [
  {
    name: "Fortnite",
    channelId: "1273878796260479026",
    provider: "github",
    secret: "wh_fortnite_4f8a2c1e9b",
    events: ["push", "pull_request", "release", "workflow_run", "issues"],
  },
  {
    name: "PlayStation",
    channelId: "1504932450894221393",
    provider: "github",
    secret: "wh_playstation_7d3e5a1c8f",
    events: ["push", "pull_request", "release", "workflow_run", "issues"],
  },
  {
    name: "Xbox",
    channelId: "1504932534444757166",
    provider: "github",
    secret: "wh_xbox_2b9f6e4d1a",
    events: ["push", "pull_request", "release", "workflow_run", "issues"],
  },
  {
    name: "Nintendo",
    channelId: "1504932786040213626",
    provider: "github",
    secret: "wh_nintendo_8c1d3f7b2e",
    events: ["push", "pull_request", "release", "workflow_run", "issues"],
  },
  {
    name: "Steam/Epic",
    channelId: "1504932229795549385",
    provider: "github",
    secret: "wh_steam_epic_5a9b3c7d1e",
    events: ["push", "pull_request", "release", "workflow_run", "issues"],
  },
  {
    name: "Instant Gaming",
    channelId: "1508790088543502336",
    provider: "github",
    secret: "wh_instant_gaming_6e2f8a4c3b",
    events: ["push", "pull_request", "release", "workflow_run", "issues"],
  },
  {
    name: "Créateurs",
    channelId: "1524219631047540826",
    provider: "github",
    secret: "wh_createurs_1d7a9e3f5c",
    events: ["push", "pull_request", "release", "workflow_run", "issues", "star", "fork"],
  },
  {
    name: "Boutique",
    channelId: "1373300746379858003",
    provider: "github",
    secret: "wh_boutique_3f1c8b6e2d",
    events: ["push", "pull_request", "release", "workflow_run"],
  },
  {
    name: "Log",
    channelId: "1504526701282197544",
    provider: "generic",
    secret: "wh_log_9e4d2a7c5b",
    events: ["*"],
  },
];

export function setupAllWebhooks(): void {
  const baseUrl = process.env.WEBHOOK_BASE_URL || `http://localhost:${process.env.HEALTH_PORT || 3000}`;

  logger.info("[WebhookSetup] Registering webhook triggers for all notification channels...");

  for (const setup of WEBHOOK_SETUP) {
    registerTrigger({
      guildId: process.env.GUILD_ID || "",
      channelId: setup.channelId,
      provider: setup.provider,
      secret: setup.secret,
      events: setup.events,
    });

    const url = `${baseUrl}/webhook/${setup.secret}`;
    logger.info(`  → ${setup.name.padEnd(16)} ${url}`);
  }

  logger.info(`[WebhookSetup] ${WEBHOOK_SETUP.length} webhook triggers registered.`);
  logger.info("[WebhookSetup] Configure these URLs in GitHub Settings → Webhooks (or CI/CD).");
}

export function getWebhookUrls(): { name: string; url: string; provider: string; events: string[] }[] {
  const baseUrl = process.env.WEBHOOK_BASE_URL || `http://localhost:${process.env.HEALTH_PORT || 3000}`;
  return WEBHOOK_SETUP.map((s) => ({
    name: s.name,
    url: `${baseUrl}/webhook/${s.secret}`,
    provider: s.provider,
    events: s.events,
  }));
}
