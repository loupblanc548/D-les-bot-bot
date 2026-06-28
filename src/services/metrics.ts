import http from "http";
import logger from "../utils/logger.js";
import prisma from "../prisma.js";
import { register, Counter, Gauge, Histogram } from "prom-client";

let metricsServer: http.Server | null = null;

// ─── Prometheus Metrics Registry ─────────────────────────────────────

// Process metrics
const uptimeGauge = new Gauge({
  name: "bot_uptime_seconds",
  help: "Bot uptime in seconds",
  registers: [register],
});

const memoryRssGauge = new Gauge({
  name: "bot_memory_rss_bytes",
  help: "Process RSS memory in bytes",
  registers: [register],
});

const memoryHeapUsedGauge = new Gauge({
  name: "bot_memory_heap_used_bytes",
  help: "Process heap used memory",
  registers: [register],
});

const memoryHeapTotalGauge = new Gauge({
  name: "bot_memory_heap_total_bytes",
  help: "Process heap total memory",
  registers: [register],
});

// Database metrics
const sourcesGauge = new Gauge({
  name: "bot_sources_total",
  help: "Total monitored sources",
  registers: [register],
});

const guildsGauge = new Gauge({
  name: "bot_guilds_total",
  help: "Total guilds",
  registers: [register],
});

const alertsPendingGauge = new Gauge({
  name: "bot_alerts_pending",
  help: "Pending alerts",
  registers: [register],
});

// Discord interaction metrics
const commandCounter = new Counter({
  name: "bot_commands_total",
  help: "Total number of slash commands executed",
  labelNames: ["command", "guild_id"],
  registers: [register],
});

const messageCounter = new Counter({
  name: "bot_messages_total",
  help: "Total number of messages processed",
  labelNames: ["guild_id", "channel_id"],
  registers: [register],
});

const interactionHistogram = new Histogram({
  name: "bot_interaction_duration_seconds",
  help: "Duration of Discord interactions in seconds",
  labelNames: ["type"],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

// API request metrics
const apiRequestCounter = new Counter({
  name: "bot_api_requests_total",
  help: "Total number of external API requests",
  labelNames: ["service", "method", "status"],
  registers: [register],
});

const apiRequestDuration = new Histogram({
  name: "bot_api_request_duration_seconds",
  help: "Duration of external API requests in seconds",
  labelNames: ["service"],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

// Error metrics
const errorCounter = new Counter({
  name: "bot_errors_total",
  help: "Total number of errors",
  labelNames: ["type", "module"],
  registers: [register],
});

// Rate limiting metrics
const rateLimitCounter = new Counter({
  name: "bot_rate_limits_total",
  help: "Total number of rate limit hits",
  labelNames: ["guild_id", "type"],
  registers: [register],
});

// Update process metrics periodically
function updateProcessMetrics(): void {
  uptimeGauge.set(process.uptime());
  const memory = process.memoryUsage();
  memoryRssGauge.set(memory.rss);
  memoryHeapUsedGauge.set(memory.heapUsed);
  memoryHeapTotalGauge.set(memory.heapTotal);
}

// Update database metrics periodically
async function updateDatabaseMetrics(): Promise<void> {
  try {
    const [sourceCount, guildCount, alertCount] = await Promise.allSettled([
      prisma.source.count(),
      prisma.guildConfig.count(),
      prisma.alert.count({ where: { status: "PENDING" } }),
    ]);

    sourcesGauge.set(sourceCount.status === "fulfilled" ? sourceCount.value : -1);
    guildsGauge.set(guildCount.status === "fulfilled" ? guildCount.value : -1);
    alertsPendingGauge.set(alertCount.status === "fulfilled" ? alertCount.value : -1);
  } catch (err) {
    logger.debug("[Metrics] Failed to update database metrics:", err);
  }
}

// Exported metric functions for use in other modules
export const metrics = {
  incrementCommand: (command: string, guildId?: string) => {
    commandCounter.inc({ command, guild_id: guildId || "unknown" });
  },
  incrementMessage: (guildId?: string, channelId?: string) => {
    messageCounter.inc({ guild_id: guildId || "unknown", channel_id: channelId || "unknown" });
  },
  recordInteraction: (type: string, duration: number) => {
    interactionHistogram.observe({ type }, duration);
  },
  incrementApiRequest: (service: string, method: string, status: string) => {
    apiRequestCounter.inc({ service, method, status });
  },
  recordApiRequest: (service: string, duration: number) => {
    apiRequestDuration.observe({ service }, duration);
  },
  incrementError: (type: string, module: string) => {
    errorCounter.inc({ type, module });
  },
  incrementRateLimit: (guildId?: string, type?: string) => {
    rateLimitCounter.inc({ guild_id: guildId || "unknown", type: type || "general" });
  },
};

/**
 * Endpoint Prometheus amélioré exposant des métriques du bot.
 * Accessible sur /metrics (port 3005 par défaut).
 */
export function startMetricsServer(port = parseInt(process.env.METRICS_PORT || "3005")): void {
  if (metricsServer) return;

  metricsServer = http.createServer(async (req, res) => {
    if (req.url !== "/metrics") {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not Found - use /metrics");
    }

    try {
      // Update metrics before serving
      updateProcessMetrics();
      await updateDatabaseMetrics();

      res.writeHead(200, { "Content-Type": register.contentType });
      res.end(await register.metrics());
    } catch (err) {
      logger.error("[Metrics] Error serving metrics:", err);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error");
    }
  });

  metricsServer.listen(port, () => {
    logger.info(`Metrics server listening on port ${port}`);
    logger.info(`  - GET /metrics - Prometheus metrics`);
  });

  // Update metrics every 30 seconds
  const _metricsInterval = setInterval(() => {
    updateProcessMetrics();
    updateDatabaseMetrics();
  }, 30000);
  if (_metricsInterval.unref) _metricsInterval.unref();
}

export function stopMetricsServer(): void {
  if (metricsServer) {
    metricsServer.close();
    metricsServer = null;
  }
}

// Export the register for external use if needed
export { register };
