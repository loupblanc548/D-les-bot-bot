import http from "http";
import logger from "../utils/logger";
import prisma from "../prisma";

let metricsServer: http.Server | null = null;

/**
 * Endpoint Prometheus minimal exposant des métriques du bot.
 * Accessible sur /metrics (port 3001 par défaut).
 */
export function startMetricsServer(port = parseInt(process.env.METRICS_PORT || "3005")): void {
  if (metricsServer) return;

  metricsServer = http.createServer(async (_req, res) => {
    if (_req.url !== "/metrics") {
      res.writeHead(404);
      return res.end();
    }

    try {
      const uptime = process.uptime();
      const memory = process.memoryUsage();

      const [sourceCount, guildCount, alertCount] = await Promise.allSettled([
        prisma.source.count(),
        prisma.guildConfig.count(),
        prisma.alert.count({ where: { status: "PENDING" } }),
      ]);

      const metrics = [
        "# HELP bot_uptime_seconds Bot uptime in seconds",
        "# TYPE bot_uptime_seconds gauge",
        `bot_uptime_seconds ${uptime}`,
        "",
        "# HELP bot_memory_rss_bytes Process RSS memory in bytes",
        "# TYPE bot_memory_rss_bytes gauge",
        `bot_memory_rss_bytes ${memory.rss}`,
        "",
        "# HELP bot_memory_heap_used_bytes Process heap used memory",
        "# TYPE bot_memory_heap_used_bytes gauge",
        `bot_memory_heap_used_bytes ${memory.heapUsed}`,
        "",
        "# HELP bot_sources_total Total monitored sources",
        "# TYPE bot_sources_total gauge",
        `bot_sources_total ${sourceCount.status === "fulfilled" ? sourceCount.value : -1}`,
        "",
        "# HELP bot_guilds_total Total guilds",
        "# TYPE bot_guilds_total gauge",
        `bot_guilds_total ${guildCount.status === "fulfilled" ? guildCount.value : -1}`,
        "",
        "# HELP bot_alerts_pending Pending alerts",
        "# TYPE bot_alerts_pending gauge",
        `bot_alerts_pending ${alertCount.status === "fulfilled" ? alertCount.value : -1}`,
        "",
      ].join("\n");

      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(metrics);
    } catch (err) {
      res.writeHead(500);
      res.end("Internal Server Error");
    }
  });

  metricsServer.listen(port, () => {
    logger.info(`Metrics server listening on port ${port}`);
  });
}

export function stopMetricsServer(): void {
  if (metricsServer) {
    metricsServer.close();
    metricsServer = null;
  }
}
