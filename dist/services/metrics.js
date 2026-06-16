"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startMetricsServer = startMetricsServer;
exports.stopMetricsServer = stopMetricsServer;
const http_1 = __importDefault(require("http"));
const logger_1 = __importDefault(require("../utils/logger"));
const prisma_1 = __importDefault(require("../prisma"));
let metricsServer = null;
/**
 * Endpoint Prometheus minimal exposant des métriques du bot.
 * Accessible sur /metrics (port 3001 par défaut).
 */
function startMetricsServer(port = 3001) {
    if (metricsServer)
        return;
    metricsServer = http_1.default.createServer(async (_req, res) => {
        if (_req.url !== "/metrics") {
            res.writeHead(404);
            return res.end();
        }
        try {
            const uptime = process.uptime();
            const memory = process.memoryUsage();
            const [sourceCount, guildCount, alertCount] = await Promise.allSettled([
                prisma_1.default.source.count(),
                prisma_1.default.guildConfig.count(),
                prisma_1.default.alert.count({ where: { status: "PENDING" } }),
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
        }
        catch (err) {
            res.writeHead(500);
            res.end("Internal Server Error");
        }
    });
    metricsServer.listen(port, () => {
        logger_1.default.info(`Metrics server listening on port ${port}`);
    });
}
function stopMetricsServer() {
    if (metricsServer) {
        metricsServer.close();
        metricsServer = null;
    }
}
//# sourceMappingURL=metrics.js.map