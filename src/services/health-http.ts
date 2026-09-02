import http from "http";
import logger from "../utils/logger.js";
import prisma from "../prisma.js";
import { runHealthCheck } from "./healthcheck.js";
import { handleWebhookRequest } from "./webhookTriggers.js";
import { getMetrics as getPrometheusMetrics, updateDiscordMetrics } from "./prometheusExporter.js";
import { getModelRotationStatus } from "./modelRotation.js";
import { getCacheStats } from "./aiCache.js";
import { collectLearnStats, formatBytes } from "./learnStatsCollector.js";
import {
  getReleasesPage,
  getReleasesJson,
  getReleasesStatsPage,
  getGamePreviewPage,
  getShowcasePage,
} from "./gameReleaseCountdownWeb.js";
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

// ─── Rate limiting (simple in-memory, 60 req/min per IP) ─────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

export function startHealthServer(port = 3000): void {
  if (server) return;

  server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const path = url.pathname;
    const clientIp =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
      req.socket.remoteAddress ||
      "unknown";

    // Rate limiting
    if (!checkRateLimit(clientIp)) {
      res.writeHead(429, { "Content-Type": "application/json", "Retry-After": "60" });
      res.end(JSON.stringify({ error: "Too Many Requests", retryAfter: 60 }));
      return;
    }

    try {
      // CORS headers — restrict to configured origin, deny by default
      const allowedOrigin = process.env.CORS_ORIGIN || "";
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
        const releasesOrigin = process.env.CORS_ORIGIN || "";
        const releasesHeaders: Record<string, string> = {
          "Content-Type": "application/json; charset=utf-8",
        };
        if (releasesOrigin) {
          releasesHeaders["Access-Control-Allow-Origin"] = releasesOrigin;
        }
        res.writeHead(200, releasesHeaders);
        res.end(getReleasesJson());
        return;
      } else if (path === "/releases/stats") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(getReleasesStatsPage());
        return;
      } else if (path === "/releases/preview") {
        const gameName = url.searchParams.get("game") || "";
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(getGamePreviewPage(gameName));
        return;
      } else if (path === "/releases/showcase") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(getShowcasePage());
        return;
      } else if (path === "/api/releases") {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(getReleasesJson());
        return;
      } else if (path === "/api/health") {
        await handleBasicHealth(res);
        return;
      } else if (path === "/api/stats") {
        const stats = {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          timestamp: new Date().toISOString(),
          releases: JSON.parse(getReleasesJson()),
        };
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(stats, null, 2));
        return;
      } else if (path === "/api/models") {
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(getModelRotationStatus());
        return;
      } else if (path === "/learn") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(buildLearnStatsPage());
        return;
      } else if (path === "/learn/data") {
        const data = collectLearnStats();
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(data));
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
    logger.info(`  - GET /learn - Self-learner live dashboard`);
    logger.info(`  - POST /webhook/<secret> - External webhook triggers`);
    logger.info(`  - GET /releases - Game release countdown (partage d'écran)`);
    logger.info(`  - GET /releases/data - Game release JSON data`);
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      logger.warn(`[HealthServer] Port ${port} déjà utilisé — serveur health désactivé`);
      server = null;
    } else {
      logger.error(`[HealthServer] Erreur: ${err.message}`);
    }
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

// ─── Self-Learner Live Dashboard ─────────────────────────────────────────────

function buildLearnStatsPage(): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>🧠 Self-Learner Dashboard</title>
<style>
:root {
  --bg: #0d1117;
  --card: #161b22;
  --border: #30363d;
  --text: #c9d1d9;
  --accent: #00d4aa;
  --accent2: #58a6ff;
  --warn: #f0883e;
  --dim: #8b949e;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  min-height: 100vh;
  padding: 20px;
}
.container { max-width: 1100px; margin: 0 auto; }
h1 {
  font-size: 1.8rem;
  background: linear-gradient(135deg, var(--accent), var(--accent2));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin-bottom: 4px;
}
.subtitle { color: var(--dim); font-size: 0.9rem; margin-bottom: 24px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
  transition: border-color 0.2s;
}
.card:hover { border-color: var(--accent); }
.card .label { color: var(--dim); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
.card .value { font-size: 2rem; font-weight: 700; color: var(--accent); }
.card .unit { font-size: 0.9rem; color: var(--dim); margin-left: 4px; }
.status-badge {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: 600;
}
.status-active { background: rgba(0,212,170,0.15); color: var(--accent); }
.status-inactive { background: rgba(240,136,62,0.15); color: var(--warn); }
.status-dot { width: 8px; height: 8px; border-radius: 50%; }
.status-active .status-dot { background: var(--accent); animation: pulse 2s infinite; }
.status-inactive .status-dot { background: var(--warn); }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
.section-title { font-size: 1.1rem; font-weight: 600; margin-bottom: 12px; color: var(--text); }
.bars { display: flex; flex-direction: column; gap: 8px; }
.bar-row { display: flex; align-items: center; gap: 12px; }
.bar-label { width: 120px; font-size: 0.85rem; color: var(--dim); text-align: right; flex-shrink: 0; }
.bar-track { flex: 1; height: 24px; background: var(--bg); border-radius: 6px; overflow: hidden; position: relative; }
.bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent2));
  border-radius: 6px;
  transition: width 0.8s ease;
  display: flex; align-items: center; justify-content: flex-end;
  padding-right: 8px; font-size: 0.75rem; font-weight: 600; color: #fff;
}
.recent-list { list-style: none; display: flex; flex-direction: column; gap: 6px; }
.recent-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 12px; background: var(--bg); border-radius: 8px; font-size: 0.85rem;
  border-left: 3px solid var(--accent);
}
.recent-time { color: var(--dim); font-size: 0.75rem; }
.footer { text-align: center; color: var(--dim); font-size: 0.8rem; margin-top: 24px; }
.refresh-info { color: var(--dim); font-size: 0.8rem; }
.live-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); animation: pulse 2s infinite; margin-right: 6px; }
</style>
</head>
<body>
<div class="container">
  <h1>🧠 Self-Learner Dashboard</h1>
  <p class="subtitle"><span class="live-dot"></span>Auto-apprentissage en temps réel — <span id="lastUpdate">chargement...</span></p>

  <div class="grid" id="statsGrid"></div>

  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;" id="twoCol">
    <div class="card">
      <div class="section-title">📂 Répartition par catégorie</div>
      <div class="bars" id="categoryBars"></div>
    </div>
    <div class="card">
      <div class="section-title">🕐 Derniers sujets appris</div>
      <ul class="recent-list" id="recentList"></ul>
    </div>
  </div>

  <div class="footer">Auto-refresh toutes les 10 secondes — <a href="/learn/data" style="color:var(--accent2)">API JSON</a></div>
</div>

<script>
async function refresh() {
  try {
    const res = await fetch('/learn/data');
    const data = await res.json();

    document.getElementById('lastUpdate').textContent = new Date(data.timestamp).toLocaleTimeString('fr-FR');

    const status = data.status;
    const metrics = data.metrics;
    const hitPct = (metrics.hitRate * 100).toFixed(1);
    const costSaved = metrics.estimatedCostSavedUsd.toFixed(4);
    const vaultSize = formatBytes(data.vaultSizeBytes);
    const statusBadge = status.active
      ? '<span class="status-badge status-active"><span class="status-dot"></span>Actif</span>'
      : '<span class="status-badge status-inactive"><span class="status-dot"></span>Inactif</span>';
    const webBadge = status.webScanActive
      ? '<span class="status-badge status-active"><span class="status-dot"></span>Scan Web</span>'
      : '<span class="status-badge status-inactive"><span class="status-dot"></span>Web Off</span>';

    document.getElementById('statsGrid').innerHTML = \`
      <div class="card"><div class="label">📚 Total Q&A</div><div class="value">\${data.totalQA}</div></div>
      <div class="card"><div class="label">💾 Taille vault</div><div class="value">\${vaultSize}</div></div>
      <div class="card"><div class="label">🎯 Hit rate</div><div class="value">\${hitPct}<span class="unit">%</span></div></div>
      <div class="card"><div class="label">💰 API évitée</div><div class="value">$\${costSaved}</div></div>
      <div class="card"><div class="label">🔒 Sujets dédupliqués</div><div class="value">\${data.dedupCount}</div></div>
      <div class="card"><div class="label">⚡ Cadence</div><div class="value">\${data.cadence.batchSize}<span class="unit">/\${data.cadence.intervalSeconds}s</span></div></div>
      <div class="card"><div class="label">🔄 Statut</div><div style="margin-top:8px">\${statusBadge}<br><span style="display:block;margin-top:8px">\${webBadge}</span></div></div>
    \`;

    const maxCount = Math.max(...data.categories.map(c => c[1]), 1);
    document.getElementById('categoryBars').innerHTML = data.categories.map(([cat, count]) => {
      const pct = (count / maxCount * 100).toFixed(1);
      return \`<div class="bar-row"><div class="bar-label">\${cat}</div><div class="bar-track"><div class="bar-fill" style="width:\${pct}%">\${count}</div></div></div>\`;
    }).join('');

    document.getElementById('recentList').innerHTML = data.recentSubjects.map(s => {
      const time = new Date(s.time).toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'});
      return \`<li class="recent-item"><span>\${s.name}</span><span class="recent-time">\${time}</span></li>\`;
    }).join('') || '<li class="recent-item">Aucun sujet récent</li>';

  } catch (e) {
    document.getElementById('lastUpdate').textContent = 'Erreur de chargement';
  }
}
refresh();
setInterval(refresh, 10000);
</script>
</body>
</html>`;
}
