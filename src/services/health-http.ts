import http from "http";
import logger from "../utils/logger.js";
import prisma from "../prisma.js";
import { runHealthCheck } from "./healthcheck.js";

let server: http.Server | null = null;
const _startTime = Date.now();

interface HealthResponse {
  status: "ok" | "degraded" | "unhealthy";
  uptime: number;
  memory: NodeJS.MemoryUsage;
  timestamp: string;
  version?: string;
  error?: string;
  checks?: {
    database: boolean;
    discord: boolean;
    services: boolean;
  };
  details?: {
    totalChecks: number;
    passed: number;
    failed: number;
  };
}

/**
 * Démarre un serveur HTTP amélioré pour le health check.
 * Utilisé par Docker, Kubernetes, ou monitoring externe.
 *
 * Endpoints:
 * - GET /health - Basic health check (database only)
 * - GET /health/ready - Readiness probe (all critical services)
 * - GET /health/live - Liveness probe (process is running)
 * - GET /health/detailed - Full health check with all modules
 */
export function startHealthServer(port = 3000): void {
  if (server) return;

  server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const path = url.pathname;

    try {
      // CORS headers
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      if (path === "/health" || path === "/") {
        await handleBasicHealth(res);
      } else if (path === "/health/ready") {
        await handleReadinessProbe(res);
      } else if (path === "/health/live") {
        await handleLivenessProbe(res);
      } else if (path === "/health/detailed") {
        await handleDetailedHealth(res);
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not Found" }));
      }
    } catch (err) {
      logger.error(`[HealthServer] Error handling ${path}:`, err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "error", error: "Internal server error" }));
    }
  });

  server.listen(port, () => {
    logger.info(`Health server listening on port ${port}`);
    logger.info(`  - GET /health - Basic health check`);
    logger.info(`  - GET /health/ready - Readiness probe`);
    logger.info(`  - GET /health/live - Liveness probe`);
    logger.info(`  - GET /health/detailed - Full health check`);
  });
}

/**
 * Basic health check - database connectivity only
 */
async function handleBasicHealth(res: http.ServerResponse): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;

    const response: HealthResponse = {
      status: "ok",
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
      checks: {
        database: true,
        discord: true,
        services: true,
      },
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response));
  } catch (_err) {
    const response: HealthResponse = {
      status: "degraded",
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
      error: "database unreachable",
      checks: {
        database: false,
        discord: true,
        services: true,
      },
    };

    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response));
  }
}

/**
 * Readiness probe - all critical services must be available
 */
async function handleReadinessProbe(res: http.ServerResponse): Promise<void> {
  try {
    // Check database
    await prisma.$queryRaw`SELECT 1`;

    // Check critical environment variables
    const hasToken = !!(process.env.DISCORD_TOKEN && process.env.DISCORD_TOKEN.length > 50);
    const hasClientId = !!(
      process.env.DISCORD_CLIENT_ID && /^\d{17,20}$/.test(process.env.DISCORD_CLIENT_ID)
    );
    const hasDatabase = !!(process.env.DATABASE_URL && process.env.DATABASE_URL.length > 0);

    const isReady = hasToken && hasClientId && hasDatabase;

    const response: HealthResponse = {
      status: isReady ? "ok" : "degraded",
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
      checks: {
        database: hasDatabase,
        discord: hasToken && hasClientId,
        services: true,
      },
    };

    res.writeHead(isReady ? 200 : 503, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response));
  } catch (_err) {
    const response: HealthResponse = {
      status: "unhealthy",
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
      checks: {
        database: false,
        discord: false,
        services: false,
      },
    };

    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response));
  }
}

/**
 * Liveness probe - process is running
 */
async function handleLivenessProbe(res: http.ServerResponse): Promise<void> {
  const response: HealthResponse = {
    status: "ok",
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
  };

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(response));
}

/**
 * Detailed health check - runs all health check modules
 */
async function handleDetailedHealth(res: http.ServerResponse): Promise<void> {
  try {
    const results = await runHealthCheck();
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    const status = failed === 0 ? "ok" : failed < 3 ? "degraded" : "unhealthy";

    const response: HealthResponse = {
      status,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "unknown",
      details: {
        totalChecks: results.length,
        passed,
        failed,
      },
      checks: {
        database: results.some(
          (r) => r.module === "BASE DE DONNEES" && r.name === "Connexion DB" && r.passed,
        ),
        discord: results.some((r) => r.module === "BASE" && r.name === "DISCORD_TOKEN" && r.passed),
        services: results.filter((r) => r.module === "SERVICES" && r.passed).length > 0,
      },
    };

    // Add detailed results as a separate field
    (response as any).modules = results;

    res.writeHead(status === "ok" ? 200 : 503, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response));
  } catch (err) {
    const response: HealthResponse = {
      status: "unhealthy",
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
      error: err instanceof Error ? "Internal error" : "Unknown error",
    };

    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response));
  }
}

export function stopHealthServer(): void {
  if (server) {
    server.close();
    server = null;
  }
}
