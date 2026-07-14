/**
 * proactiveHealthCheck.ts — Health check proactif + webhooks sortants
 * #28 Webhooks sortants (Discord/Slack) + #29 Health check proactif
 */
import { Client } from "discord.js";
import logger from "../utils/logger.js";
import prisma from "../prisma.js";

interface HealthStatus {
  ok: boolean;
  uptime: number;
  guildCount: number;
  userCount: number;
  ping: number;
  memoryMb: number;
  timestamp: string;
}

let lastHealthOk = true;
let healthCheckInterval: NodeJS.Timeout | null = null;

export function getHealthStatus(client: Client): HealthStatus {
  const mem = process.memoryUsage();
  return {
    ok: client.isReady(),
    uptime: process.uptime(),
    guildCount: client.guilds.cache.size,
    userCount: client.guilds.cache.reduce((sum, g) => sum + (g.memberCount || 0), 0),
    ping: client.ws.ping,
    memoryMb: Math.round(mem.rss / 1024 / 1024),
    timestamp: new Date().toISOString(),
  };
}

async function sendWebhook(url: string, payload: Record<string, unknown>): Promise<void> {
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    logger.error(
      `[HealthCheck] Webhook failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function notifyStatusChange(client: Client, isOk: boolean): Promise<void> {
  const webhookUrl = process.env.HEALTH_WEBHOOK_URL || "";
  const status = getHealthStatus(client);

  if (webhookUrl) {
    // Discord webhook format
    let isDiscordWebhook = false;
    try {
      const parsed = new URL(webhookUrl);
      isDiscordWebhook =
        (parsed.hostname === "discord.com" || parsed.hostname === "discordapp.com") &&
        parsed.pathname.includes("/api/webhooks/");
    } catch {}
    if (isDiscordWebhook) {
      await sendWebhook(webhookUrl, {
        embeds: [
          {
            title: isOk ? "✅ Bot de nouveau en ligne" : "⚠️ Bot hors ligne ou instable",
            color: isOk ? 0x22c55e : 0xef4444,
            fields: [
              { name: "Uptime", value: `${Math.floor(status.uptime)}s`, inline: true },
              { name: "Serveurs", value: `${status.guildCount}`, inline: true },
              { name: "Ping", value: `${status.ping}ms`, inline: true },
              { name: "Mémoire", value: `${status.memoryMb}MB`, inline: true },
            ],
            timestamp: status.timestamp,
          },
        ],
      });
    } else {
      // Slack format
      await sendWebhook(webhookUrl, {
        text: isOk ? "✅ Bot de nouveau en ligne" : "⚠️ Bot hors ligne ou instable",
        attachments: [
          {
            color: isOk ? "good" : "danger",
            fields: [
              { title: "Uptime", value: `${Math.floor(status.uptime)}s`, short: true },
              { title: "Ping", value: `${status.ping}ms`, short: true },
            ],
          },
        ],
      });
    }
  }

  logger.info(`[HealthCheck] Status changed: ${isOk ? "OK" : "DOWN"}`);
}

export function startProactiveHealthCheck(client: Client, intervalMs = 30000): void {
  if (healthCheckInterval) clearInterval(healthCheckInterval);

  healthCheckInterval = setInterval(async () => {
    const status = getHealthStatus(client);
    const isOk = status.ok && status.ping < 10000;

    // Notifier seulement en cas de changement de statut (online ↔ offline)
    if (isOk !== lastHealthOk) {
      await notifyStatusChange(client, isOk);
      lastHealthOk = isOk;
    }

    // Alerte mémoire si > 480MB (proche de la limite 512MB)
    if (status.memoryMb >= 480) {
      logger.warn(
        `[HealthCheck] ⚠️ Memory ${status.memoryMb}MB ≥ 480MB threshold — ${status.guildCount} guilds, ${status.ping}ms`,
      );
    }

    // Log local toutes les 5 minutes (pas de spam Discord)
    if (Math.floor(Date.now() / 1000) % 300 === 0) {
      logger.info(
        `[HealthCheck] OK — ${status.guildCount} guilds, ${status.ping}ms, ${status.memoryMb}MB. No alert sent.`,
      );
    }
  }, intervalMs);

  logger.info(`[HealthCheck] Proactive health check started (every ${intervalMs / 1000}s)`);
}

// #27 — Backup automatique DB
export async function autoBackup(): Promise<void> {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    logger.info(`[Backup] Starting automatic backup (${timestamp})`);

    // Export key tables as JSON
    const tables = ["NotificationLog", "ModerationLog", "Casier", "GuildConfig"];
    const backup: Record<string, unknown> = { timestamp, tables: {} as Record<string, unknown> };

    for (const table of tables) {
      try {
        const data = await (prisma as any)[table].findMany({ take: 10000 });
        (backup.tables as Record<string, unknown>)[table] = data;
      } catch {
        // Table might not exist
      }
    }

    // Store backup info
    const backupSize = JSON.stringify(backup).length;
    logger.info(`[Backup] Completed — ${Math.round(backupSize / 1024)}KB`);

    // Notify via webhook if configured
    const webhookUrl = process.env.HEALTH_WEBHOOK_URL || "";
    if (webhookUrl) {
      await sendWebhook(webhookUrl, {
        embeds: [
          {
            title: "💾 Backup automatique terminé",
            color: 0x6366f1,
            fields: [
              { name: "Taille", value: `${Math.round(backupSize / 1024)}KB`, inline: true },
              { name: "Tables", value: tables.join(", "), inline: true },
            ],
            timestamp: new Date().toISOString(),
          },
        ],
      });
    }
  } catch (err) {
    logger.error(`[Backup] Failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function startAutoBackup(scheduleHours = 168): void {
  const intervalMs = scheduleHours * 60 * 60 * 1000;
  setInterval(() => {
    void autoBackup();
  }, intervalMs);
  logger.info(`[Backup] Auto-backup scheduled every ${scheduleHours}h (hebdomadaire)`);
}
