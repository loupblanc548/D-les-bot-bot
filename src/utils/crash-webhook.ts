/**
 * crash-webhook.ts
 *
 * Envoie des alertes critiques via Webhook Discord indépendant du client.
 * Fonctionne même si le bot est down/crash.
 *
 * Usage :
 *   import { sendCrashAlert } from "./utils/crash-webhook.js";
 *   await sendCrashAlert("Bot crashed", error.stack);
 */

import logger from "./logger.js";

const CRASH_WEBHOOK_URL = process.env.CRASH_WEBHOOK_URL || "";

/**
 * Envoie un message d'alerte critique via Webhook Discord.
 * Ne dépend pas du client Discord — fonctionne même si le bot est down.
 */
export async function sendCrashAlert(
  title: string,
  description?: string,
  color: number = 0xff3344,
): Promise<void> {
  if (!CRASH_WEBHOOK_URL) {
    logger.debug("[CrashWebhook] CRASH_WEBHOOK_URL non configuré, alerte ignorée");
    return;
  }

  try {
    const payload = {
      embeds: [
        {
          title: `🚨 ${title}`,
          description: description ? description.slice(0, 4000) : undefined,
          color,
          timestamp: new Date().toISOString(),
          footer: { text: "Système d'alerte critique • John Helldiver" },
        },
      ],
    };

    const res = await fetch(CRASH_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      logger.error(`[CrashWebhook] Échec envoi webhook: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    logger.error(
      `[CrashWebhook] Erreur envoi webhook: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Envoie une alerte d'avertissement (orange) via Webhook.
 */
export async function sendWarningAlert(title: string, description?: string): Promise<void> {
  await sendCrashAlert(title, description, 0xffaa00);
}

/**
 * Envoie une notification de redémarrage via Webhook.
 */
export async function sendRestartAlert(): Promise<void> {
  await sendCrashAlert(
    "Bot redémarré",
    `Le bot a été redémarré le ${new Date().toLocaleString("fr-FR")}`,
    0x0099ff,
  );
}
