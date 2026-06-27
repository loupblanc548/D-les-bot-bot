/**
 * emailReport.ts — Envoi de rapports de santé par email via SMTP2GO.
 *
 * Plan gratuit: 1000 emails/mois (suffisant pour un rapport hebdomadaire).
 *
 * Config:
 *   SMTP2GO_API_KEY dans .env
 *   REPORT_EMAIL_TO dans .env (email du proprietaire)
 *   REPORT_EMAIL_FROM dans .env (email expediteur)
 *
 * Si non configure, no-op.
 */

import logger from "./logger.js";

const API_KEY = process.env.SMTP2GO_API_KEY || "";
const EMAIL_TO = process.env.REPORT_EMAIL_TO || "";
const EMAIL_FROM = process.env.REPORT_EMAIL_FROM || "bot@localhost";
const BASE_URL = "https://api.smtp2go.com/v3/email/send";

interface EmailReport {
  uptime: number;
  memoryUsage: string;
  totalCommands: number;
  totalErrors: number;
  activeCrons: number;
  failedCrons: string[];
}

/**
 * Envoie un rapport de santé par email.
 * No-op si SMTP2GO n'est pas configure.
 */
export async function sendHealthReport(report: EmailReport): Promise<void> {
  if (!API_KEY || !EMAIL_TO) return;

  const uptimeHours = Math.floor(report.uptime / 3600);
  const uptimeMins = Math.floor((report.uptime % 3600) / 60);

  const html = `
    <h2>📊 Rapport de santé du bot</h2>
    <table style="border-collapse:collapse;">
      <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Uptime</strong></td><td style="padding:8px;border:1px solid #ddd;">${uptimeHours}h ${uptimeMins}m</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Mémoire</strong></td><td style="padding:8px;border:1px solid #ddd;">${report.memoryUsage}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Commandes traitées</strong></td><td style="padding:8px;border:1px solid #ddd;">${report.totalCommands}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Erreurs</strong></td><td style="padding:8px;border:1px solid #ddd;">${report.totalErrors}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Crons actifs</strong></td><td style="padding:8px;border:1px solid #ddd;">${report.activeCrons}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Crons en échec</strong></td><td style="padding:8px;border:1px solid #ddd;">${report.failedCrons.length > 0 ? report.failedCrons.join(", ") : "Aucun ✅"}</td></tr>
    </table>
    <p style="color:#666;font-size:12px;">Généré automatiquement — Discord Surveillance Bot</p>
  `;

  try {
    const res = await fetch(BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: API_KEY,
        to: [EMAIL_TO],
        sender: EMAIL_FROM,
        subject: "📊 Rapport de santé du bot",
        html_body: html,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      logger.warn(`[SMTP2GO] HTTP ${res.status}`);
      return;
    }

    logger.info("[SMTP2GO] Rapport de santé envoyé par email ✅");
  } catch (err) {
    logger.error(
      `[SMTP2GO] Erreur envoi email: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
