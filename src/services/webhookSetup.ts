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
  discordWebhookUrl: string;
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
    discordWebhookUrl: "https://discord.com/api/webhooks/1524241124242489406/9hY5j7JwfI-3TmS9arR1Q0lUAvh-icO6kU5WdOApCU9FsWriPFzpBtN4YZFKv2PhGFP0",
    provider: "github",
    secret: "wh_fortnite_4f8a2c1e9b",
    events: ["push", "pull_request", "release", "workflow_run", "issues"],
  },
  {
    name: "PlayStation",
    channelId: "1504932450894221393",
    discordWebhookUrl: "https://discord.com/api/webhooks/1524240020570112110/HwCA5O1oerGtivp4JV0DAPEf-lRuPK9PifDmcRBn9w_kAuos1UIMr0kyVylCjLaf4pcZ",
    provider: "github",
    secret: "wh_playstation_7d3e5a1c8f",
    events: ["push", "pull_request", "release", "workflow_run", "issues"],
  },
  {
    name: "Xbox",
    channelId: "1504932534444757166",
    discordWebhookUrl: "https://discord.com/api/webhooks/1524239753732559039/imSEdRTq6t-QsGzMFQ93sJId2TYaewMCuVhZTWKvz8bJMV2WHDlLvdNZjvcwM7nczKuw",
    provider: "github",
    secret: "wh_xbox_2b9f6e4d1a",
    events: ["push", "pull_request", "release", "workflow_run", "issues"],
  },
  {
    name: "Nintendo",
    channelId: "1504932786040213626",
    discordWebhookUrl: "https://discord.com/api/webhooks/1524239503512830163/-A7piEVNI_RGC5zzBvqJxBEy4McnxDYd3jB4z-SqzCvdoNikUJyH60pSt2pSQdVfk9Zg",
    provider: "github",
    secret: "wh_nintendo_8c1d3f7b2e",
    events: ["push", "pull_request", "release", "workflow_run", "issues"],
  },
  {
    name: "Steam/Epic",
    channelId: "1504932229795549385",
    discordWebhookUrl: "https://discord.com/api/webhooks/1524233298954420306/SFq4bKMh7s9I94e8y2LUv_sEh7xW3CA8VQNUpkkFBBoYDOeA-H6qRrYOwoIuTVmDKBYI",
    provider: "github",
    secret: "wh_steam_epic_5a9b3c7d1e",
    events: ["push", "pull_request", "release", "workflow_run", "issues"],
  },
  {
    name: "Instant Gaming",
    channelId: "1508790088543502336",
    discordWebhookUrl: "https://discord.com/api/webhooks/1524238391817015417/gaETr4yOqC08SFwSp9tetqiriz5iJuN9UNUaaK80fmCU5B3kxFFvIMLcJqotp0YMwgYm",
    provider: "github",
    secret: "wh_instant_gaming_6e2f8a4c3b",
    events: ["push", "pull_request", "release", "workflow_run", "issues"],
  },
  {
    name: "Créateurs",
    channelId: "1524219631047540826",
    discordWebhookUrl: "https://discord.com/api/webhooks/1524238048580075600/RHMLGtUivFXQTSPWpp4YL5QVtWbKGnCRXRG9_diK0g1ZiLS3m1gXVfVWnbAJ8v3t1HHE",
    provider: "github",
    secret: "wh_createurs_1d7a9e3f5c",
    events: ["push", "pull_request", "release", "workflow_run", "issues", "star", "fork"],
  },
  {
    name: "Boutique Fortnite",
    channelId: "1373300746379858003",
    discordWebhookUrl: "https://discord.com/api/webhooks/1524241625042259988/jwfkFAMIrt2dwjA5G-65iJRpZuo2wt1Hn3pxDle2OO9Z-Lj771K64UlitktnMYR5M_ha",
    provider: "github",
    secret: "wh_boutique_3f1c8b6e2d",
    events: ["push", "pull_request", "release", "workflow_run"],
  },
  {
    name: "Log",
    channelId: process.env.LOG_CHANNEL_ID || "",
    discordWebhookUrl: "https://discord.com/api/webhooks/1524239753732559039/imSEdRTq6t-QsGzMFQ93sJId2TYaewMCuVhZTWKvz8bJMV2WHDlLvdNZjvcwM7nczKuw",
    provider: "generic",
    secret: "wh_log_9e4d2a7c5b",
    events: ["*"],
  },
];

export function setupAllWebhooks(): void {
  const baseUrl = process.env.WEBHOOK_BASE_URL || `http://localhost:${process.env.HEALTH_PORT || 3000}`;

  try {
    logger.info("[WebhookSetup] Registering webhook triggers for all notification channels...");

    for (const setup of WEBHOOK_SETUP) {
      try {
        registerTrigger({
          name: setup.name,
          guildId: process.env.GUILD_ID || "",
          channelId: setup.channelId,
          discordWebhookUrl: setup.discordWebhookUrl,
          provider: setup.provider,
          secret: setup.secret,
          events: setup.events,
        });

        const url = `${baseUrl}/webhook/${setup.secret}`;
        logger.info(`  → ${setup.name.padEnd(16)} ${url}`);
      } catch (err) {
        logger.error(`[WebhookSetup] Failed to register "${setup.name}": ${String(err)}`);
      }
    }

    logger.info(`[WebhookSetup] ${WEBHOOK_SETUP.length} webhook triggers registered.`);
    logger.info("[WebhookSetup] Configure these URLs in GitHub Settings → Webhooks (or CI/CD).");
  } catch (err) {
    logger.error(`[WebhookSetup] Fatal error during setup: ${String(err)}`);
  }
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
