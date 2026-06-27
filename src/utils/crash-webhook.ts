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

let lastCrashAlert = 0;
const CRASH_ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes entre alertes

/**
 * Envoie un message d'alerte critique via Webhook Discord.
 * Cooldown de 1 minute pour éviter le spam en cas de crash loop.
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

  const now = Date.now();
  if (now - lastCrashAlert < CRASH_ALERT_COOLDOWN_MS) {
    logger.debug(`[CrashWebhook] Alert "${title}" skipped (cooldown)`);
    return;
  }
  lastCrashAlert = now;

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
 * DÉSACTIVÉ — les messages de redémarrage spamment les salons logs.
 * Le bot logge simplement le redémarrage dans les logs internes.
 */
export async function sendRestartAlert(): Promise<void> {
  logger.info(
    "[CrashWebhook] Redémarrage du bot — notification Discord désactivée (log interne uniquement)",
  );
}
