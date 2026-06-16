"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startHealthServer = startHealthServer;
exports.stopHealthServer = stopHealthServer;
const http_1 = __importDefault(require("http"));
const logger_1 = __importDefault(require("../utils/logger"));
const prisma_1 = __importDefault(require("../prisma"));
let server = null;
/**
 * Démarre un serveur HTTP minimal pour le health check.
 * Utilisé par Docker, Kubernetes, ou monitoring externe.
 */
function startHealthServer(port = 3000) {
    if (server)
        return;
    server = http_1.default.createServer(async (_req, res) => {
        try {
            // Vérifie la connexion DB
            await prisma_1.default.$queryRaw `SELECT 1`;
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
                status: "ok",
                uptime: process.uptime(),
                memory: process.memoryUsage().rss,
                timestamp: new Date().toISOString(),
            }));
        }
        catch (err) {
            res.writeHead(503, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ status: "degraded", error: "database unreachable" }));
        }
    });
    server.listen(port, () => {
        logger_1.default.info(`Health server listening on port ${port}`);
    });
}
function stopHealthServer() {
    if (server) {
        server.close();
        server = null;
    }
}
//# sourceMappingURL=health-http.js.map