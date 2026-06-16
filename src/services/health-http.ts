import http from "http";
import logger from "../utils/logger";
import prisma from "../prisma";

let server: http.Server | null = null;

/**
 * Démarre un serveur HTTP minimal pour le health check.
 * Utilisé par Docker, Kubernetes, ou monitoring externe.
 */
export function startHealthServer(port = 3000): void {
  if (server) return;

  server = http.createServer(async (_req, res) => {
    try {
      // Vérifie la connexion DB
      await prisma.$queryRaw`SELECT 1`;

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          uptime: process.uptime(),
          memory: process.memoryUsage().rss,
          timestamp: new Date().toISOString(),
        })
      );
    } catch (err) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "degraded", error: "database unreachable" }));
    }
  });

  server.listen(port, () => {
    logger.info(`Health server listening on port ${port}`);
  });
}

export function stopHealthServer(): void {
  if (server) {
    server.close();
    server = null;
  }
}
