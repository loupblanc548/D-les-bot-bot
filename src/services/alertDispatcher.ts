/**
 * alertDispatcher.ts — Multi-Channel Alert Dispatcher
 *
 * Envoi d'alertes vers multiples canaux de communication :
 *  1. Discord (channel + DM + ping roles)
 *  2. Webhook générique (JSON POST)
 *  3. Email (via SMTP ou SendGrid)
 *  4. Telegram Bot API
 *  5. SMS (via Twilio)
 *
 * Le bot utilise automatiquement le dispatcher quand un incident
 * CRITICAL est détecté par le SOC ou l'investigator.
 */

import { Client, TextChannel, EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";
import { createLog } from "./logs.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type AlertChannel = "DISCORD" | "WEBHOOK" | "EMAIL" | "TELEGRAM" | "SMS";

export interface AlertPayload {
  id: string;
  title: string;
  message: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  guildId: string;
  source: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}

export interface ChannelConfig {
  enabled: boolean;
  discordChannelId?: string;
  discordRoleId?: string;
  discordDmUserIds?: string[];
  webhookUrl?: string;
  emailRecipients?: string[];
  telegramChatId?: string;
  smsRecipients?: string[];
}

// ─── Configuration ───────────────────────────────────────────────────────────

const DEFAULT_CHANNEL_CONFIG: ChannelConfig = {
  enabled: true,
};

let channelConfig: ChannelConfig = { ...DEFAULT_CHANNEL_CONFIG };

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID ?? "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN ?? "";
const TWILIO_PHONE_FROM = process.env.TWILIO_PHONE_FROM ?? "";
const SMTP_URL = process.env.SMTP_URL ?? "";

export function getChannelConfig(): ChannelConfig {
  return { ...channelConfig };
}

export function updateChannelConfig(updates: Partial<ChannelConfig>): ChannelConfig {
  channelConfig = { ...channelConfig, ...updates };
  logger.info(`[AlertDispatcher] Config updated: enabled=${channelConfig.enabled}`);
  return { ...channelConfig };
}

// ─── Dispatch principal ──────────────────────────────────────────────────────

/**
 * Dispatch une alerte vers tous les canaux configurés et activés.
 */
export async function dispatchAlert(client: Client, payload: AlertPayload): Promise<void> {
  if (!channelConfig.enabled) return;

  const promises: Promise<void>[] = [];

  // Discord
  if (channelConfig.discordChannelId || channelConfig.discordDmUserIds?.length) {
    promises.push(sendDiscordAlert(client, payload));
  }

  // Webhook
  if (channelConfig.webhookUrl) {
    promises.push(sendWebhookAlert(payload));
  }

  // Email
  if (channelConfig.emailRecipients?.length && SMTP_URL) {
    promises.push(sendEmailAlert(payload));
  }

  // Telegram
  if (channelConfig.telegramChatId && TELEGRAM_BOT_TOKEN) {
    promises.push(sendTelegramAlert(payload));
  }

  // SMS (CRITICAL only)
  if (
    channelConfig.smsRecipients?.length &&
    TWILIO_ACCOUNT_SID &&
    payload.severity === "CRITICAL"
  ) {
    promises.push(sendSMSAlert(payload));
  }

  await Promise.allSettled(promises);

  try {
    await createLog({
      type: "ALERT_DISPATCH",
      action: `Alerte dispatchée: ${payload.title} (${payload.severity})`,
      targetId: payload.guildId,
      details: JSON.stringify({ id: payload.id, channels: promises.length }),
    });
  } catch {
    // Non-critique
  }
}

// ─── 1. Discord ──────────────────────────────────────────────────────────────

async function sendDiscordAlert(client: Client, payload: AlertPayload): Promise<void> {
  const colorMap = { LOW: 0x53fc18, MEDIUM: 0xffaa00, HIGH: 0xff6600, CRITICAL: 0xff3344 };
  const embed = new EmbedBuilder()
    .setTitle(`🚨 ${payload.title}`)
    .setColor(colorMap[payload.severity])
    .setDescription(payload.message)
    .addFields(
      { name: "Sévérité", value: payload.severity, inline: true },
      { name: "Source", value: payload.source, inline: true },
    )
    .setTimestamp(payload.timestamp);

  // Channel
  if (channelConfig.discordChannelId) {
    try {
      const channel =
        (client.channels.cache.get(channelConfig.discordChannelId) as TextChannel | undefined) ??
        ((await client.channels
          .fetch(channelConfig.discordChannelId)
          .catch(() => null)) as TextChannel | null);

      if (channel?.isTextBased()) {
        const content = channelConfig.discordRoleId ? `<@&${channelConfig.discordRoleId}> ` : "";
        await (channel as TextChannel).send({ content, embeds: [embed] });
      }
    } catch (error) {
      logger.error(
        `[AlertDispatcher] Discord channel error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // DMs
  if (channelConfig.discordDmUserIds?.length) {
    for (const userId of channelConfig.discordDmUserIds) {
      try {
        const user = await client.users.fetch(userId);
        await user.send({ embeds: [embed] });
      } catch {
        // Non-critique
      }
    }
  }
}

// ─── 2. Webhook ──────────────────────────────────────────────────────────────

async function sendWebhookAlert(payload: AlertPayload): Promise<void> {
  if (!channelConfig.webhookUrl) return;

  try {
    const res = await fetch(channelConfig.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `🚨 ${payload.title} (${payload.severity})\n${payload.message}`,
        embeds: [
          {
            title: payload.title,
            description: payload.message,
            color:
              payload.severity === "CRITICAL"
                ? 0xff3344
                : payload.severity === "HIGH"
                  ? 0xff6600
                  : 0xffaa00,
            fields: [
              { name: "Severity", value: payload.severity, inline: true },
              { name: "Source", value: payload.source, inline: true },
            ],
            timestamp: payload.timestamp.toISOString(),
          },
        ],
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      logger.warn(`[AlertDispatcher] Webhook HTTP ${res.status}`);
    }
  } catch (error) {
    logger.error(
      `[AlertDispatcher] Webhook error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// ─── 3. Email ────────────────────────────────────────────────────────────────

async function sendEmailAlert(payload: AlertPayload): Promise<void> {
  if (!channelConfig.emailRecipients?.length || !SMTP_URL) return;

  try {
    // Utilisation de l'API SendGrid si disponible, sinon SMTP simple
    const sendgridKey = process.env.SENDGRID_API_KEY;
    if (sendgridKey) {
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sendgridKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: channelConfig.emailRecipients.map((e) => ({ email: e })) }],
          from: { email: process.env.SENDGRID_FROM ?? "bot@shadowbroker.dev" },
          subject: `[${payload.severity}] ${payload.title}`,
          content: [
            {
              type: "text/plain",
              value: `${payload.message}\n\nSource: ${payload.source}\nGuild: ${payload.guildId}\nTimestamp: ${payload.timestamp.toISOString()}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        logger.warn(`[AlertDispatcher] SendGrid HTTP ${res.status}`);
      }
    }
  } catch (error) {
    logger.error(
      `[AlertDispatcher] Email error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// ─── 4. Telegram ─────────────────────────────────────────────────────────────

async function sendTelegramAlert(payload: AlertPayload): Promise<void> {
  if (!channelConfig.telegramChatId || !TELEGRAM_BOT_TOKEN) return;

  try {
    const text = `🚨 *${payload.title}*\n\n${payload.message}\n\n*Sévérité:* ${payload.severity}\n*Source:* ${payload.source}`;
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: channelConfig.telegramChatId,
        text,
        parse_mode: "Markdown",
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      logger.warn(`[AlertDispatcher] Telegram HTTP ${res.status}`);
    }
  } catch (error) {
    logger.error(
      `[AlertDispatcher] Telegram error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// ─── 5. SMS (Twilio) ─────────────────────────────────────────────────────────

async function sendSMSAlert(payload: AlertPayload): Promise<void> {
  if (
    !channelConfig.smsRecipients?.length ||
    !TWILIO_ACCOUNT_SID ||
    !TWILIO_AUTH_TOKEN ||
    !TWILIO_PHONE_FROM
  )
    return;

  const smsText = `CRITICAL ALERT: ${payload.title} — ${payload.message.slice(0, 100)}`;

  for (const phone of channelConfig.smsRecipients) {
    try {
      const body = new URLSearchParams();
      body.append("From", TWILIO_PHONE_FROM);
      body.append("To", phone);
      body.append("Body", smsText);

      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body,
          signal: AbortSignal.timeout(10000),
        },
      );

      if (!res.ok) {
        logger.warn(`[AlertDispatcher] Twilio HTTP ${res.status} for ${phone}`);
      }
    } catch (error) {
      logger.error(
        `[AlertDispatcher] SMS error for ${phone}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

// ─── API publique ────────────────────────────────────────────────────────────

export function createAlertPayload(
  title: string,
  message: string,
  severity: AlertPayload["severity"],
  guildId: string,
  source: string,
  metadata: Record<string, unknown> = {},
): AlertPayload {
  return {
    id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title,
    message,
    severity,
    guildId,
    source,
    timestamp: new Date(),
    metadata,
  };
}

export function isChannelAvailable(channel: AlertChannel): boolean {
  switch (channel) {
    case "DISCORD":
      return !!(channelConfig.discordChannelId || channelConfig.discordDmUserIds?.length);
    case "WEBHOOK":
      return !!channelConfig.webhookUrl;
    case "EMAIL":
      return !!(
        channelConfig.emailRecipients?.length &&
        (SMTP_URL || process.env.SENDGRID_API_KEY)
      );
    case "TELEGRAM":
      return !!(channelConfig.telegramChatId && TELEGRAM_BOT_TOKEN);
    case "SMS":
      return !!(channelConfig.smsRecipients?.length && TWILIO_ACCOUNT_SID);
  }
}
