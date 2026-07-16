import http from "http";
import logger from "../utils/logger.js";
import prisma from "../prisma.js";
import { runHealthCheck } from "./healthcheck.js";
import { handleWebhookRequest } from "./webhookTriggers.js";
import { getMetrics as getPrometheusMetrics, updateDiscordMetrics } from "./prometheusExporter.js";
import { getModelRotationStatus } from "./modelRotation.js";
import { getCacheStats } from "./aiCache.js";
import { getReleasesPage, getReleasesJson } from "./gameReleaseCountdownWeb.js";
import type { Client } from "discord.js";

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
let discordClient: Client | null = null;

export function setDiscordClient(client: Client): void {
  discordClient = client;
}

export function startHealthServer(port = 3000): void {
  if (server) return;

  server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const path = url.pathname;

    try {
      // CORS headers — restrict to configured origin
      const allowedOrigin = process.env.CORS_ORIGIN || "http://localhost:3721";
      res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
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
      } else if (path === "/health/models") {
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(getModelRotationStatus());
        return;
      } else if (path === "/health/cache") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(getCacheStats(), null, 2));
        return;
      } else if (path === "/metrics") {
        if (discordClient) {
          updateDiscordMetrics(discordClient);
        }
        const metrics = await getPrometheusMetrics();
        res.writeHead(200, { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" });
        res.end(metrics);
        return;
      } else if (path.startsWith("/webhook/")) {
        if (!discordClient) {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Discord client not ready" }));
          return;
        }
        await handleWebhookRequest(req, res, discordClient);
        return;
      } else if (path === "/releases") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(getReleasesPage());
        return;
      } else if (path === "/releases/data") {
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(getReleasesJson());
        return;
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
    logger.info(`  - GET /health/models - Model rotation status`);
    logger.info(`  - GET /health/cache - AI cache stats`);
    logger.info(`  - GET /metrics - Prometheus metrics`);
    logger.info(`  - POST /webhook/<secret> - External webhook triggers`);
    logger.info(`  - GET /releases - Game release countdown (partage d'écran)`);
    logger.info(`  - GET /releases/data - Game release JSON data`);
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
