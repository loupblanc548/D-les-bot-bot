/**
 * sslWatch.ts — Alerte certificat bientôt périmé (hôtes listés en env).
 */

import { Client } from "discord.js";
import cron, { type ScheduledTask } from "node-cron";
import logger from "../utils/logger.js";
import { config } from "../config.js";
import { inspectHostCertificate, sslWatchHosts } from "../services/sslInspect.js";
import { buildFicheEmbeds, postFichesViaRest } from "../services/discordFiche.js";

const EXPIRY_WARN_DAYS = 21;
let cronJob: ScheduledTask | null = null;

export async function runSslWatch(client: Client): Promise<void> {
  const hosts = sslWatchHosts();
  if (hosts.length === 0) {
    logger.debug("[SslWatch] SSL_WATCH_HOSTS vide — skip");
    return;
  }
  const channelId = config.logChannel;
  if (!channelId) return;

  for (const host of hosts) {
    const info = await inspectHostCertificate(host);
    if (info.error || info.daysUntilExpiry == null) {
      logger.warn(`[SslWatch] ${host}: ${info.error || "expiry inconnue"}`);
      continue;
    }
    if (info.daysUntilExpiry > EXPIRY_WARN_DAYS) continue;
    const embeds = buildFicheEmbeds({
      title: "SSL bientôt périmé",
      description: `Le certificat de **${info.domain}** expire dans ${info.daysUntilExpiry} jour(s).`,
      footer: "SSL · alerte ops",
      color: info.daysUntilExpiry <= 0 ? 0xe74c3c : 0xf1c40f,
      cards: [
        {
          title: info.domain,
          fields: [
            { name: "Émetteur", value: info.issuer, inline: true },
            { name: "Jours restants", value: `${info.daysUntilExpiry}`, inline: true },
            { name: "Expire", value: info.validTo?.slice(0, 10) || "—", inline: true },
            { name: "Parade", value: "Renouveler, HTTPS partout, admin hors HTTP." },
          ],
        },
      ],
    });
    await postFichesViaRest(client, channelId, embeds);
    logger.info(`[SslWatch] alerte ${host} (${info.daysUntilExpiry} j)`);
  }
}

export function startSslWatch(client: Client): void {
  if (cronJob) {
    logger.warn("[SslWatch] Déjà actif — ignoré");
    return;
  }
  cronJob = cron.schedule("0 8 * * *", () => {
    runSslWatch(client).catch((err) => logger.error("[SslWatch] Erreur cron:", err));
  });
  logger.info("[SslWatch] Planifié (tous les jours 08:00) — SSL_WATCH_HOSTS");
}

export function stopSslWatch(): void {
  cronJob?.stop();
  cronJob = null;
}
