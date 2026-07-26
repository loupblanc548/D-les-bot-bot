/**
 * webhookSetup.ts — Auto-register webhook triggers for all notification channels.
 *
 * Called at bot startup to register GitHub/CI/CD webhook endpoints.
 * Each channel gets a unique secret URL: POST /webhook/<secret>
 *
 * SECURITY: All webhook URLs and secrets are loaded from environment variables.
 * No hardcoded secrets in this file.
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

// Build webhook setup from environment variables
function buildWebhookSetup(): ChannelWebhookSetup[] {
  const channels: Array<{
    name: string;
    webhookEnv: string;
    channelEnv: string;
    secretEnv: string;
    provider: "github" | "gitlab" | "generic";
    events: string[];
  }> = [
    {
      name: "Fortnite",
      webhookEnv: "WEBHOOK_FORTNITE_URL",
      channelEnv: "FORTNITE_CHANNEL_ID",
      secretEnv: "WEBHOOK_FORTNITE_SECRET",
      provider: "github",
      events: ["push", "pull_request", "release", "workflow_run", "issues"],
    },
    {
      name: "PlayStation",
      webhookEnv: "WEBHOOK_PLAYSTATION_URL",
      channelEnv: "PLAYSTATION_CHANNEL_ID",
      secretEnv: "WEBHOOK_PLAYSTATION_SECRET",
      provider: "github",
      events: ["push", "pull_request", "release", "workflow_run", "issues"],
    },
    {
      name: "Xbox",
      webhookEnv: "WEBHOOK_XBOX_URL",
      channelEnv: "XBOX_CHANNEL_ID",
      secretEnv: "WEBHOOK_XBOX_SECRET",
      provider: "github",
      events: ["push", "pull_request", "release", "workflow_run", "issues"],
    },
    {
      name: "Nintendo",
      webhookEnv: "WEBHOOK_NINTENDO_URL",
      channelEnv: "NINTENDO_CHANNEL_ID",
      secretEnv: "WEBHOOK_NINTENDO_SECRET",
      provider: "github",
      events: ["push", "pull_request", "release", "workflow_run", "issues"],
    },
    {
      name: "Steam/Epic",
      webhookEnv: "WEBHOOK_STEAM_EPIC_URL",
      channelEnv: "STEAM_EPIC_CHANNEL_ID",
      secretEnv: "WEBHOOK_STEAM_EPIC_SECRET",
      provider: "github",
      events: ["push", "pull_request", "release", "workflow_run", "issues"],
    },
    {
      name: "Instant Gaming",
      webhookEnv: "WEBHOOK_INSTANT_GAMING_URL",
      channelEnv: "INSTANT_GAMING_CHANNEL_ID",
      secretEnv: "WEBHOOK_INSTANT_GAMING_SECRET",
      provider: "github",
      events: ["push", "pull_request", "release", "workflow_run", "issues"],
    },
    {
      name: "Créateurs",
      webhookEnv: "WEBHOOK_CREATEURS_URL",
      channelEnv: "CREATEURS_CHANNEL_ID",
      secretEnv: "WEBHOOK_CREATEURS_SECRET",
      provider: "github",
      events: ["push", "pull_request", "release", "workflow_run", "issues", "star", "fork"],
    },
    {
      name: "Boutique Fortnite",
      webhookEnv: "WEBHOOK_BOUTIQUE_URL",
      channelEnv: "BOUTIQUE_CHANNEL_ID",
      secretEnv: "WEBHOOK_BOUTIQUE_SECRET",
      provider: "github",
      events: ["push", "pull_request", "release", "workflow_run"],
    },
    {
      name: "Log",
      webhookEnv: "WEBHOOK_LOG_URL",
      channelEnv: "LOG_CHANNEL_ID",
      secretEnv: "WEBHOOK_LOG_SECRET",
      provider: "generic",
      events: ["*"],
    },
  ];

  const setups: ChannelWebhookSetup[] = [];
  for (const ch of channels) {
    const url = process.env[ch.webhookEnv];
    const channelId = process.env[ch.channelEnv] || "";
    const secret = process.env[ch.secretEnv];

    if (url && secret) {
      setups.push({
        name: ch.name,
        channelId,
        discordWebhookUrl: url,
        provider: ch.provider,
        secret,
        events: ch.events,
      });
    } else {
      logger.warn(`[WebhookSetup] ${ch.name} skipped — missing ${ch.webhookEnv} or ${ch.secretEnv}`);
    }
  }

  return setups;
}

// Cache the setup at module load
const WEBHOOK_SETUP = buildWebhookSetup();

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
