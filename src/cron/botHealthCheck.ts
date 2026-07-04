/**
 * botHealthCheck.ts — Monitoring automatique du bot (toutes les 5 min)
 *
 * CRON-22: Vérifie memory, CPU, latence API, erreurs récentes
 * Envoie une alerte dans le salon de log si un seuil est dépassé.
 */

import { Client, TextChannel, EmbedBuilder } from "discord.js";
import { safeInterval } from "../utils/safe-interval.js";
import logger from "../utils/logger.js";
import { config } from "../config.js";
import { MEMORY_CONFIG, getMemoryLevel, formatMemoryReport } from "../utils/memoryConfig.js";

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const LATENCY_THRESHOLD_MS = 500; // alerte si > 500ms
const MEMORY_ALERT_THRESHOLD_MB = 300; // alerte si RSS > 300MB

let intervalId: NodeJS.Timeout | null = null;
let lastAlertTime = 0;
const ALERT_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2h entre alertes

export function startBotHealthCheck(client: Client): void {
  if (intervalId) {
    logger.warn("[BotHealth] Déjà actif — ignoré");
    return;
  }

  logger.info("[BotHealth] Monitoring automatique activé (toutes les 5 min)");

  intervalId = safeInterval(
    "BotHealth",
    async () => {
      try {
        const memUsage = process.memoryUsage();
        const heapMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        const rssMB = Math.round(memUsage.rss / 1024 / 1024);
        const ping = client.ws.ping;
        const uptime = process.uptime();
        const guildCount = client.guilds.cache.size;

        const issues: string[] = [];
        const memLevel = getMemoryLevel(rssMB);
        if (rssMB >= MEMORY_ALERT_THRESHOLD_MB)
          issues.push(
            `⚠️ Memory: ${heapMB}MB heap / ${rssMB}MB RSS (seuil alerte: ${MEMORY_ALERT_THRESHOLD_MB}MB, niveau: ${memLevel})`,
          );
        if (ping > LATENCY_THRESHOLD_MS)
          issues.push(`⚠️ Latence: ${ping}ms (seuil: ${LATENCY_THRESHOLD_MS}ms)`);
        if (uptime < 60) issues.push("⚠️ Bot redémarré récemment (< 1 min)");

        if (issues.length > 0 && Date.now() - lastAlertTime > ALERT_COOLDOWN_MS) {
          lastAlertTime = Date.now();
          const logChannelId = config.logChannel;
          if (logChannelId) {
            const channel = await client.channels.fetch(logChannelId);
            if (channel?.isTextBased()) {
              const embed = new EmbedBuilder()
                .setTitle("🩺 Bot Health Check — Alerte")
                .setColor(rssMB >= MEMORY_ALERT_THRESHOLD_MB ? 0xff3344 : 0xff9900)
                .setDescription(issues.join("\n"))
                .addFields(
                  {
                    name: "Memory",
                    value: `${heapMB}MB heap / ${rssMB}MB RSS (seuil: ${MEMORY_ALERT_THRESHOLD_MB}MB)`,
                    inline: true,
                  },
                  { name: "Latence", value: `${ping}ms`, inline: true },
                  { name: "Uptime", value: `${Math.round(uptime / 60)}min`, inline: true },
                  { name: "Serveurs", value: `${guildCount}`, inline: true },
                )
                .setTimestamp()
                .setFooter({ text: "Monitoring automatique — alerte seule" });
              await (channel as TextChannel).send({ embeds: [embed] });
            }
          }
          logger.warn(`[BotHealth] Alerte: ${issues.join(", ")}`);
        } else {
          // Tout va bien — log local uniquement, pas de spam Discord
          logger.info(
            `[BotHealth] OK — ${heapMB}MB heap / ${rssMB}MB RSS, ${ping}ms, ${guildCount} guilds, ${Math.round(uptime / 60)}min uptime. No alert sent.`,
          );
        }
      } catch (error) {
        logger.error("[BotHealth] Erreur:", error);
      }
    },
    CHECK_INTERVAL_MS,
  );
}

export function stopBotHealthCheck(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info("[BotHealth] Monitoring arrêté");
  }
}
