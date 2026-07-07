import axios from "axios";
import logger from "../utils/logger.js";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || "";
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || "";

export function isTelegramConfigured(): boolean { return TELEGRAM_BOT_TOKEN.length > 0 && TELEGRAM_CHAT_ID.length > 0; }
export function isSlackConfigured(): boolean { return SLACK_WEBHOOK_URL.length > 0; }
export function isDiscordWebhookConfigured(): boolean { return DISCORD_WEBHOOK_URL.length > 0; }

export async function sendTelegramMessage(text: string): Promise<boolean> {
  if (!isTelegramConfigured()) return false;
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID, text: text.slice(0, 4096), parse_mode: "Markdown",
    }, { timeout: 10000 });
    return true;
  } catch (err) { logger.error(`[Notify] Telegram: ${err instanceof Error ? err.message : String(err)}`); return false; }
}

export async function sendSlackMessage(text: string, blocks?: unknown[]): Promise<boolean> {
  if (!isSlackConfigured()) return false;
  try {
    await axios.post(SLACK_WEBHOOK_URL, { text: text.slice(0, 3000), blocks }, { timeout: 10000 });
    return true;
  } catch (err) { logger.error(`[Notify] Slack: ${err instanceof Error ? err.message : String(err)}`); return false; }
}

export async function sendDiscordWebhook(message: { content?: string; embeds?: unknown[] }): Promise<boolean> {
  if (!isDiscordWebhookConfigured()) return false;
  try {
    await axios.post(DISCORD_WEBHOOK_URL, message, { timeout: 10000 });
    return true;
  } catch (err) { logger.error(`[Notify] Discord webhook: ${err instanceof Error ? err.message : String(err)}`); return false; }
}

export async function broadcastNotification(text: string): Promise<{ telegram: boolean; slack: boolean; discord: boolean }> {
  const [tg, slack, dc] = await Promise.all([
    sendTelegramMessage(text),
    sendSlackMessage(text),
    sendDiscordWebhook({ content: text.slice(0, 2000) }),
  ]);
  return { telegram: tg, slack: slack, discord: dc };
}
