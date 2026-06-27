/**
 * ntfy.ts — Integration ntfy.sh pour les notifications push gratuites.
 *
 * Permet d'envoyer des alertes sur telephone sans inscription.
 * L'utilisateur installe l'app ntfy et s'abonne a un topic.
 *
 * Config: NTFY_TOPIC dans .env (ex: "mon-bot-alerts")
 * Si non configure, les notifications sont no-ops.
 *
 * Usage:
 *   await sendNotification("Bot down", "Erreur critique detectee");
 *   await sendNotification("Backup OK", "Backup de 42MB complete");
 */

import logger from "./logger.js";

const NTFY_TOPIC = process.env.NTFY_TOPIC || "";
const NTFY_SERVER = process.env.NTFY_SERVER || "https://ntfy.sh";

type Priority = "default" | "high" | "urgent";

/**
 * Envoie une notification push via ntfy.sh.
 * No-op si NTFY_TOPIC n'est pas configure.
 */
export async function sendNotification(
  title: string,
  message: string,
  priority: Priority = "default",
): Promise<void> {
  if (!NTFY_TOPIC) return;

  try {
    await fetch(`${NTFY_SERVER}/${NTFY_TOPIC}`, {
      method: "POST",
      headers: {
        Title: title.slice(0, 100),
        Priority: priority,
        Tags: "robot,warning",
      },
      body: message.slice(0, 500),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    logger.debug(
      `[ntfy] Erreur envoi notification: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Envoie une alerte urgente (high priority + vibration).
 */
export async function sendUrgentAlert(title: string, message: string): Promise<void> {
  await sendNotification(`🚨 ${title}`, message, "urgent");
}

/**
 * Envoie une alerte de cron (3 echecs consecutifs).
 */
export async function sendCronAlert(cronName: string, error: string): Promise<void> {
  await sendUrgentAlert(
    `Cron ${cronName} en panne`,
    `Le cron "${cronName}" a echoue 3 fois de suite.\nErreur: ${error}`,
  );
}
