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
import { fetchTextChannel } from "../utils/discordChannel.js";
import { getMemoryLevel, MEMORY_CONFIG, type MemoryLevel } from "../utils/memoryConfig.js";

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes — check interne
export const LATENCY_THRESHOLD_MS = 500;

let intervalId: NodeJS.Timeout | null = null;
let lastAlertTime = 0;
const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6h entre alertes (était 2h)

export type HealthSnapshot = {
  heapMB: number;
  rssMB: number;
  ping: number;
};

/** Discord seulement si ça casse vraiment — OK et SURVEILLANCE restent dans les logs. */
export function shouldAlertMemory(level: MemoryLevel): boolean {
  return level === "WARNING" || level === "CRITICAL";
}

export function collectBotHealthIssues(snap: HealthSnapshot): string[] {
  const issues: string[] = [];
  const memLevel = getMemoryLevel(snap.rssMB);
  if (shouldAlertMemory(memLevel)) {
    const threshold = MEMORY_CONFIG.LEVELS[memLevel];
    issues.push(
      `⚠️ Memory: ${snap.heapMB}MB heap / ${snap.rssMB}MB RSS (seuil ${memLevel}: ${threshold}MB, niveau: ${memLevel})`,
    );
  }
  if (snap.ping > LATENCY_THRESHOLD_MS) {
    issues.push(`⚠️ Latence: ${snap.ping}ms (seuil: ${LATENCY_THRESHOLD_MS}ms)`);
  }
  return issues;
}

function alertColor(rssMB: number, ping: number): number {
  const memLevel = getMemoryLevel(rssMB);
  if (memLevel === "CRITICAL") return 0xff3344;
  if (memLevel === "WARNING" || ping > LATENCY_THRESHOLD_MS) return 0xff9900;
  return 0xff9900;
}

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
        const memLevel = getMemoryLevel(rssMB);
        const issues = collectBotHealthIssues({ heapMB, rssMB, ping });

        if (issues.length > 0 && Date.now() - lastAlertTime > ALERT_COOLDOWN_MS) {
          lastAlertTime = Date.now();
          const logChannelId = config.logChannel;
          if (logChannelId) {
            const channel = await fetchTextChannel(client, logChannelId);
            if (channel) {
              const embed = new EmbedBuilder()
                .setTitle("🩺 Bot Health Check — Alerte")
                .setColor(alertColor(rssMB, ping))
                .setDescription(issues.join("\n"))
                .addFields(
                  {
                    name: "Memory",
                    value: `${heapMB}MB heap / ${rssMB}MB RSS (${memLevel}, alerte ≥ ${MEMORY_CONFIG.LEVELS.WARNING}MB)`,
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
          logger.info(
            `[BotHealth] ${memLevel} — ${heapMB}MB heap / ${rssMB}MB RSS, ${ping}ms, ${guildCount} guilds, ${Math.round(uptime / 60)}min uptime. No alert sent.`,
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
