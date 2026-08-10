/**
 * control-server.ts — Serveur de contrôle HTTP pour le dashboard desktop
 *
 * Endpoints:
 *  GET  /api/status          — Statut du bot
 *  GET  /api/platforms       — Liste des flux RSS
 *  POST /api/flux/pause      — Pause d'un flux
 *  POST /api/flux/resume     — Reprendre un flux
 *  POST /api/flux/test       — Tester un flux
 *  GET  /api/logs            — Logs récents
 *  DELETE /api/logs          — Vider les logs
 *  GET  /api/servers         — Serveurs Discord
 *  GET  /api/fortnite        — Données Fortnite
 *  POST /api/fortnite/test   — Test détection Fortnite
 *  POST /api/dm/send         — Envoyer un DM
 *  GET  /api/dm/history      — Historique DMs
 *  GET  /api/metrics         — Métriques
 *  POST /api/restart         — Redémarrer le bot
 *  GET  /api/health          — Health check
 *  GET  /live                 — Liveness probe (process alive)
 *  GET  /ready                — Readiness probe (Discord + DB connected)
 *  GET  /internal/health      — Detailed health (memory, discord, warnings)
 *  GET  /metrics              — Prometheus metrics
 */

import http from "http";
import crypto from "crypto";
import { Client } from "discord.js";
import { WebSocketServer, WebSocket } from "ws";
import zlib from "zlib";
import { promisify } from "util";
import logger from "./utils/logger.js";
import prisma from "./prisma.js";
import { config } from "./config.js";
import { getFortniteState } from "./services/fortnite-broadcast.js";
import { handleWebhookRequest } from "./services/webhookTriggers.js";
import { handleWebhook as handleSecureWebhook } from "./services/webhookReceiver.js";

const gzip = promisify(zlib.gzip);

let server: http.Server | null = null;
let wss: WebSocketServer | null = null;
const wsClients = new Set<WebSocket>();
const logBuffer: { timestamp: number; level: string; message: string }[] = [];
const dmHistory: { timestamp: number; userId: string; message: string; success: boolean }[] = [];
const MAX_LOGS = 500;

// Simple TTL cache
type CacheEntry = { value: any; expiresAt: number };
const cache = new Map<string, CacheEntry>();
function setCache(key: string, value: any, ttlMs = 3000) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}
function getCache<T = any>(key: string): T | null {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) { cache.delete(key); return null; }
  return e.value as T;
}

// Dynamic stats updated periodically to avoid heavy work per request
let dynamicStats = {
  totalGuilds: 0,
  totalMembers: 0,
  commandsCount: 0,
  ping: 0,
  memoryMb: 0,
  updatedAt: Date.now(),
};

function refreshDynamicStats(client: Client) {
  try {
    dynamicStats.totalGuilds = client.guilds.cache.size;
    dynamicStats.totalMembers = client.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0);
    dynamicStats.commandsCount = client.application?.commands?.cache?.size || 0;
    dynamicStats.ping = client.ws?.ping || 0;
    dynamicStats.memoryMb = +(process.memoryUsage().rss / 1048576).toFixed(1);
    dynamicStats.updatedAt = Date.now();
  } catch (err) {
    logger.warn("[ControlServer] refreshDynamicStats error:", err);
  }
}

// Background DB metrics updated periodically (caches counts)
let cachedDbMetrics: {
  totalGuilds?: number;
  totalLogs?: number;
  totalSanctions?: number;
  totalTweets?: number;
  totalWishlistItems?: number;
  updatedAt?: number;
} = { updatedAt: 0 };

async function refreshDbMetrics() {
  try {
    const [totalGuilds, totalLogs, totalSanctions, totalTweets, totalWishlistItems] = await Promise.all([
      prisma.guildConfig.count().catch(() => 0),
      prisma.log.count().catch(() => 0),
      prisma.sanction.count().catch(() => 0),
      prisma.processedTweets.count().catch(() => 0),
      prisma.wishlist.count().catch(() => 0),
    ]);
    cachedDbMetrics = { totalGuilds, totalLogs, totalSanctions, totalTweets, totalWishlistItems, updatedAt: Date.now() };
  } catch (err) {
    logger.warn("[ControlServer] refreshDbMetrics failed:", err);
  }
}

// Throttled WS broadcast: aggregate small bursts and send once per interval
let wsBroadcastScheduled = false;
let wsPendingPayloads: string[] = [];
function scheduleBroadcast(payload: string) {
  wsPendingPayloads.push(payload);
  if (wsBroadcastScheduled) return;
  wsBroadcastScheduled = true;
  setTimeout(() => {
    const batch = wsPendingPayloads.join("\n");
    wsPendingPayloads = [];
    wsBroadcastScheduled = false;
    for (const ws of wsClients) {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(batch, (err) => { if (err) { try { ws.close(); } catch {} } }); } catch { try { ws.close(); } catch {} }
      }
    }
  }, 150);
}

function withTimeout<T>(p: Promise<T>, ms = 3000, fallback?: T): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const t = setTimeout(() => { if (!settled) { settled = true; resolve(fallback as T); } }, ms);
    p.then((v) => { if (!settled) { settled = true; clearTimeout(t); resolve(v); } }).catch(() => { if (!settled) { settled = true; clearTimeout(t); resolve(fallback as T); } });
  });
}

const originalLog = console.log.bind(console);
const originalError = console.error.bind(console);
const originalWarn = console.warn.bind(console);

function pushLog(level: string, args: unknown[]) {
  const message = args.map((a) => {
    if (typeof a === "string") return a;
    try { return JSON.stringify(a); } catch { return String(a); }
  }).join(" ");
  const entry = { timestamp: Date.now(), level, message };
  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOGS) logBuffer.shift();
  try { scheduleBroadcast(JSON.stringify({ type: "log", ...entry })); } catch {}
}

console.log = (...args: unknown[]) => { pushLog("info", args); originalLog(...args); };
console.error = (...args: unknown[]) => { pushLog("error", args); originalError(...args); };
console.warn = (...args: unknown[]) => { pushLog("warn", args); originalWarn(...args); };

function authCheck(req: http.IncomingMessage): boolean {
  const token = config.controlToken;
  if (!token) {
    if (process.env.NODE_ENV === "production") {
      logger.error("[ControlServer] CONTROL_TOKEN non défini — accès refusé en production");
      return false;
    }
    logger.warn(
      "[ControlServer] CONTROL_TOKEN non défini — accès ouvert (développement uniquement)",
    );
    return true;
  }
  const auth = req.headers.authorization?.replace("Bearer ", "");
  if (!auth) return false;
  if (auth.length !== token.length) return false;
  return crypto.timingSafeEqual(Buffer.from(auth), Buffer.from(token));
}

const ctrlRateLimitMap = new Map<string, { count: number; resetAt: number }>();
const CTRL_RATE_LIMIT_WINDOW = 60_000;
const CTRL_RATE_LIMIT_MAX = 30;

function ctrlRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ctrlRateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    ctrlRateLimitMap.set(ip, { count: 1, resetAt: now + CTRL_RATE_LIMIT_WINDOW });
    return true;
  }
  entry.count++;
  return entry.count <= CTRL_RATE_LIMIT_MAX;
}

function getClientIp(req: http.IncomingMessage): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}

function getAllowedOrigin(): string {
  const origins = process.env.CONTROL_CORS_ORIGINS || process.env.CORS_ORIGIN || "";
  if (origins && origins !== "*") return origins.split(",")[0].trim();
  if (process.env.NODE_ENV === "production") return "";
  return "*";
}

async function sendJson(res: http.ServerResponse, code: number, data: unknown) {
  try {
    const json = JSON.stringify(data);
    const accept = (res.req?.headers?.["accept-encoding"] as string) || "";
    const useGzip = accept.includes("gzip") && json.length > 1024;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-XSS-Protection": "1; mode=block",
      "Referrer-Policy": "no-referrer",
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    };
    const allowedOrigin = getAllowedOrigin();
    if (allowedOrigin) headers["Access-Control-Allow-Origin"] = allowedOrigin;
    if (useGzip) {
      headers["Content-Encoding"] = "gzip";
      res.writeHead(code, headers);
      const gz = await gzip(Buffer.from(json));
      res.end(gz);
    } else {
      res.writeHead(code, headers);
      res.end(json);
    }
  } catch {
    try { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); } catch {}
  }
}

async function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const contentLength = Number(req.headers["content-length"] || "0");
    if (contentLength > 2_000_000) { resolve({}); return; }
    const chunks: Buffer[] = [];
    let received = 0;
    req.on("data", (chunk: Buffer) => {
      received += chunk.length;
      if (received > 1_000_000) { chunks.length = 0; return; }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (chunks.length === 0) { resolve({}); return; }
      try { const buf = Buffer.concat(chunks); resolve(JSON.parse(buf.toString()) as Record<string, unknown>); } catch { resolve({}); }
    });
    req.on("error", () => resolve({}));
  });
}

export async function startControlServer(port: number, client: Client): Promise<void> {
  if (server) return;

  // Start background stat refreshers
  refreshDynamicStats(client);
  setInterval(() => refreshDynamicStats(client), 3000);
  await refreshDbMetrics();
  setInterval(() => refreshDbMetrics(), 30_000);

  server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const path = url.pathname;

    if (req.method === "OPTIONS") {
      const allowedOrigin = getAllowedOrigin();
      const headers: Record<string, string> = {
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      };
      if (allowedOrigin) {
        headers["Access-Control-Allow-Origin"] = allowedOrigin;
      }
      res.writeHead(204, headers);
      res.end();
      return;
    }

    if (path === "/api/health" || path === "/health" || path === "/healthz") {
      sendJson(res, 200, { status: "ok", uptime: process.uptime(), timestamp: Date.now() });
      return;
    }

    // Liveness probe — process is alive
    if (path === "/live" || path === "/liveness") {
      sendJson(res, 200, { status: "alive", pid: process.pid, uptime: process.uptime() });
      return;
    }

    // Readiness probe — process is ready to serve traffic
    if (path === "/ready" || path === "/readiness") {
      const ready = client.ws?.status === 1; // 1 = READY in discord.js
      const dbOk = !!prisma;
      const readyStatus = ready && dbOk;
      sendJson(res, readyStatus ? 200 : 503, {
        status: readyStatus ? "ready" : "not_ready",
        discord: ready ? "connected" : "disconnected",
        database: dbOk ? "connected" : "disconnected",
        uptime: process.uptime(),
      });
      return;
    }

    // Internal health — detailed checks
    if (path === "/internal/health") {
      const memUsage = process.memoryUsage();
      const health = {
        status: "ok",
        uptime: process.uptime(),
        timestamp: Date.now(),
        discord: { connected: client.ws?.status === 1, ping: client.ws?.ping ?? -1 },
        memory: {
          rss: Math.round(memUsage.rss / 1024 / 1024),
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
          external: Math.round(memUsage.external / 1024 / 1024),
        },
        guilds: client.guilds.cache.size,
        warnings: [] as string[],
      };
      if (memUsage.rss > 1024 * 1024 * 1024) {
        health.status = "warning";
        health.warnings.push("RSS > 1GB");
      }
      if (client.ws?.status !== 1) {
        health.status = "degraded";
        health.warnings.push("Discord not connected");
      }
      sendJson(res, health.status === "ok" ? 200 : 503, health);
      return;
    }

    if (path === "/metrics") {
      try {
        const { register } = await import("./services/metrics.js");
        res.writeHead(200, { "Content-Type": register.contentType });
        res.end(await register.metrics());
      } catch {
        res.writeHead(503, { "Content-Type": "text/plain" });
        res.end("Metrics unavailable");
      }
      return;
    }

    if (path.startsWith("/webhook/")) {
      logger.info(`[ControlServer] Webhook route matched: ${path}`);
      await handleWebhookRequest(req, res, client);
      return;
    }

    if (path.startsWith("/webhook-secure/")) {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", async () => {
        const body = Buffer.concat(chunks);
        const handled = await handleSecureWebhook(req, res, body);
        if (!handled) {
          sendJson(res, 404, { error: "Webhook route not found" });
        }
      });
      return;
    }

    // Debug: log unmatched paths that look like webhook
    if (path.includes("webhook")) {
      logger.warn(
        `[ControlServer] Path contains 'webhook' but not matched: "${path}" (startsWith check: ${path.startsWith("/webhook/")})`,
      );
    }

    const clientIp = getClientIp(req);
    if (!ctrlRateLimit(clientIp)) {
      sendJson(res, 429, { error: "Too many requests" });
      return;
    }

    if (!authCheck(req)) {
      sendJson(res, 401, { error: "Non autorisé" });
      return;
    }

    try {
      if (path === "/api/status" && req.method === "GET") {
        sendJson(res, 200, {
          online: client.isReady(),
          uptime: process.uptime(),
          ping: dynamicStats.ping,
          guilds: dynamicStats.totalGuilds,
          members: dynamicStats.totalMembers,
          memoryMb: dynamicStats.memoryMb,
          cpuPercent: process.cpuUsage().user / 1000000,
          commands: dynamicStats.commandsCount,
        });
        return;
      }

      if (path === "/api/servers" && req.method === "GET") {
        const guilds = client.guilds.cache.map((g) => ({
          id: g.id,
          name: g.name,
          memberCount: g.memberCount,
          ownerName: g.members.cache.get(g.ownerId)?.user.username || "—",
          iconURL: g.iconURL({ size: 128 }) || null,
          joinedAt: g.joinedAt?.toISOString() || null,
        }));
        sendJson(res, 200, guilds);
        return;
      }

      if (path === "/api/platforms" && req.method === "GET") {
        try {
          const cacheKey = "platformListCache";
          const cached = getCache(cacheKey);
          if (cached) { sendJson(res, 200, cached); return; }
          const sources = await withTimeout(prisma.source.findMany(), 3000, []);
          // Enrichir avec les infos de config .env
          const platformList = [
            {
              id: "twitter-fortnite",
              name: "Twitter Fortnite",
              platform: "twitter",
              active: !!process.env.TWITTER_ACCOUNTS_FORTNITE_ACCOUNTS,
              lastFetch: new Date().toISOString(),
            },
            {
              id: "twitter-playstation",
              name: "Twitter PlayStation",
              platform: "twitter",
              active: !!process.env.TWITTER_ACCOUNTS_PLAYSTATION_ACCOUNTS,
              lastFetch: new Date().toISOString(),
            },
            {
              id: "twitter-xbox",
              name: "Twitter Xbox",
              platform: "twitter",
              active: !!process.env.TWITTER_ACCOUNTS_XBOX_ACCOUNTS,
              lastFetch: new Date().toISOString(),
            },
            {
              id: "twitter-nintendo",
              name: "Twitter Nintendo",
              platform: "twitter",
              active: !!process.env.TWITTER_ACCOUNTS_NINTENDO_ACCOUNTS,
              lastFetch: new Date().toISOString(),
            },
            {
              id: "twitter-instant",
              name: "Twitter Instant Gaming",
              platform: "twitter",
              active: !!process.env.TWITTER_ACCOUNTS_INSTANT_GAMING_ACCOUNTS,
              lastFetch: new Date().toISOString(),
            },
            {
              id: "youtube-fortnite",
              name: "YouTube Fortnite",
              platform: "youtube",
              active: !!process.env.YOUTUBE_FORTNITE_CHANNELS,
              lastFetch: new Date().toISOString(),
            },
            {
              id: "youtube-playstation",
              name: "YouTube PlayStation",
              platform: "youtube",
              active: !!process.env.YOUTUBE_PLAYSTATION_CHANNELS,
              lastFetch: new Date().toISOString(),
            },
            {
              id: "youtube-xbox",
              name: "YouTube Xbox",
              platform: "youtube",
              active: !!process.env.YOUTUBE_XBOX_CHANNELS,
              lastFetch: new Date().toISOString(),
            },
            {
              id: "rss-fortnite",
              name: "RSS Fortnite",
              platform: "rss",
              active: !!process.env.PATCH_FORTNITE_RSS,
              lastFetch: new Date().toISOString(),
            },
            {
              id: "rss-playstation",
              name: "RSS PlayStation",
              platform: "rss",
              active: !!process.env.PATCH_PLAYSTATION_RSS,
              lastFetch: new Date().toISOString(),
            },
            {
              id: "rss-xbox",
              name: "RSS Xbox",
              platform: "rss",
              active: !!process.env.PATCH_XBOX_RSS,
              lastFetch: new Date().toISOString(),
            },
            {
              id: "rss-nintendo",
              name: "RSS Nintendo",
              platform: "rss",
              active: !!process.env.PATCH_NINTENDO_RSS,
              lastFetch: new Date().toISOString(),
            },
            {
              id: "rss-steam",
              name: "RSS Steam/Epic",
              platform: "rss",
              active: !!process.env.PATCH_STEAM_EPIC_RSS,
              lastFetch: new Date().toISOString(),
            },
            {
              id: "rss-instant",
              name: "RSS Instant Gaming",
              platform: "rss",
              active: !!process.env.PATCH_INSTANT_GAMING_RSS,
              lastFetch: new Date().toISOString(),
            },
          ];
          // Ajouter les sources Prisma si elles existent
          if (sources.length > 0) {
            for (const s of sources) {
              platformList.push({
                id: String(s.id),
                name: s.urlOrHandle,
                platform: s.type,
                active: true,
                lastFetch: new Date().toISOString(),
              });
            }
          }
          setCache(cacheKey, platformList, 15_000);
          sendJson(res, 200, platformList);
        } catch {
          sendJson(res, 200, [
            {
              id: "twitter-fortnite",
              name: "Twitter Fortnite",
              platform: "twitter",
              active: !!process.env.TWITTER_ACCOUNTS_FORTNITE_ACCOUNTS,
              lastFetch: new Date().toISOString(),
            },
            {
              id: "youtube-fortnite",
              name: "YouTube Fortnite",
              platform: "youtube",
              active: !!process.env.YOUTUBE_FORTNITE_CHANNELS,
              lastFetch: new Date().toISOString(),
            },
            {
              id: "rss-fortnite",
              name: "RSS Fortnite",
              platform: "rss",
              active: !!process.env.PATCH_FORTNITE_RSS,
              lastFetch: new Date().toISOString(),
            },
          ]);
        }
        return;
      }

      if (path === "/api/flux/pause" && req.method === "POST") {
        const body = await readBody(req);
        const platformId = body.platformId as string;
        if (platformId && platformId !== "all") {
          try {
            await prisma.source.delete({ where: { id: Number(platformId) } });
          } catch {}
        }
        sendJson(res, 200, { success: true });
        return;
      }
      if (path === "/api/flux/resume" && req.method === "POST") {
        await readBody(req);
        sendJson(res, 200, { success: true });
        return;
      }
      if (path === "/api/flux/test" && req.method === "POST") {
        sendJson(res, 200, { success: true });
        return;
      }

      if (path === "/api/logs" && req.method === "GET") {
        const limit = parseInt(url.searchParams.get("limit") || "100", 10);
        const level = url.searchParams.get("level");
        let logs = [...logBuffer].reverse();
        if (level) logs = logs.filter((l) => l.level === level);
        sendJson(res, 200, logs.slice(0, limit));
        return;
      }
      if (path === "/api/logs" && req.method === "DELETE") {
        logBuffer.length = 0;
        sendJson(res, 200, { success: true });
        return;
      }

      if (path === "/api/dm/send" && req.method === "POST") {
        const body = await readBody(req);
        const userId = body.userId as string;
        const message = body.message as string;
        if (!userId || !message) {
          sendJson(res, 400, { error: "userId et message requis" });
          return;
        }
        try {
          const user = await withTimeout(client.users.fetch(userId), 5000, null as any);
          if (!user) throw new Error("User fetch timeout");
          await withTimeout(user.send(message), 8000, undefined);
          dmHistory.push({
            timestamp: Date.now(),
            userId,
            message,
            success: true,
          });
          sendJson(res, 200, { success: true });
        } catch (_err) {
          dmHistory.push({
            timestamp: Date.now(),
            userId,
            message,
            success: false,
          });
          sendJson(res, 500, {
            error: "Échec envoi DM",
            details: "Internal error",
          });
        }
        return;
      }
      if (path === "/api/dm/history" && req.method === "GET") {
        sendJson(res, 200, dmHistory.slice(-50).reverse());
        return;
      }

      if (path === "/api/fortnite" && req.method === "GET") {
        try {
          // Récupérer l'état Fortnite enrichi depuis le module broadcast
          const fnState = getFortniteState();

          // Compter les tweets traités en base
          const tweetCount = cachedDbMetrics.totalTweets ?? (await withTimeout(prisma.processedTweets.count(), 3000, 0));

          // Compter les comptes suivis
          const accountsRaw = process.env.TWITTER_ACCOUNTS_FORTNITE_ACCOUNTS || "";
          const accounts = accountsRaw
            .split(",")
            .map((a) => a.trim())
            .filter(Boolean);

          // Compter les cosmétiques trackés dans la wishlist
          const cosmeticsTracked = cachedDbMetrics.totalWishlistItems ?? (await withTimeout(prisma.wishlist.count(), 3000, 0));

          // Récupérer les détections récentes
          const recentPosts = await withTimeout(prisma.processedTweets
            .findMany({
              orderBy: { id: "desc" },
              take: 15,
            }).catch(() => []), 4000, []);

          // Mapper les détections
          const detections = [
            ...(fnState.detections || []),
            ...recentPosts.map((p: any) => ({
              type: "tweets",
              time: p.createdAt?.toISOString?.() || new Date().toISOString(),
              message: `Tweet traité: ${p.tweetId}`,
            })),
          ].slice(0, 15);

          sendJson(res, 200, {
            tweets: fnState.tweets || tweetCount,
            news: fnState.news || 0,
            skins: fnState.skins || 0,
            accounts,
            shop: fnState.shop || [],
            shopItemsTotal: (fnState.shop || []).length,
            cosmeticsTracked,
            detections,
          });
        } catch (err) {
          logger.warn("[ControlServer] Fortnite endpoint error:", err);
          sendJson(res, 200, {
            tweets: 0,
            news: 0,
            skins: 0,
            accounts: [],
            shop: [],
            shopItemsTotal: 0,
            cosmeticsTracked: 0,
            detections: [],
          });
        }
        return;
      }
      if (path === "/api/fortnite/test" && req.method === "POST") {
        sendJson(res, 200, { success: true });
        return;
      }

      // ─── Fortnite Party Bot ────────────────────────────────────────
      if (path === "/api/fortnite/status" && req.method === "GET") {
        try {
          const { isFortniteBotReady, getBotDisplayName } =
            await import("./services/fortnitePartyBot.js");
          const connected = isFortniteBotReady();
          const displayName = getBotDisplayName();
          sendJson(res, 200, { connected, displayName });
        } catch {
          sendJson(res, 200, { connected: false, displayName: null });
        }
        return;
      }

      if (path === "/api/fortnite/login" && req.method === "POST") {
        try {
          const body = await readBody(req);
          const authCode = (body.authCode as string)?.trim();
          if (!authCode || authCode.length < 10) {
            sendJson(res, 400, { error: "Code d'autorisation invalide" });
            return;
          }
          const { connectFortniteBot } = await import("./services/fortnitePartyBot.js");
          await connectFortniteBot(authCode);
          logger.info("[ControlServer] Fortnite bot login via dashboard");
          sendJson(res, 200, { success: true, message: "Connexion en cours..." });
        } catch (err) {
          sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
        }
        return;
      }

      if (path === "/api/fortnite/logout" && req.method === "POST") {
        try {
          const { disconnectFortniteBot } = await import("./services/fortnitePartyBot.js");
          await disconnectFortniteBot();
          sendJson(res, 200, { success: true });
        } catch (err) {
          sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
        }
        return;
      }

      if (path === "/api/studio/analyze" && req.method === "POST") {
        try {
          await readBody(req);
          // Placeholder — would integrate Google Vision API
          sendJson(res, 200, {
            text: "",
            labels: [],
            faces: 0,
            colors: [],
            note: "Studio analyze endpoint — connect Google Vision API for full features",
          });
        } catch {
          sendJson(res, 200, { text: "", labels: [], faces: 0, colors: [] });
        }
        return;
      }

      if (path === "/api/studio/prompt-expand" && req.method === "POST") {
        try {
          const body = await readBody(req);
          const prompt = (body.prompt as string) || "";
          const qualityKeywords = [
            "ultra-detailed",
            "hyperrealistic",
            "photorealistic",
            "8K resolution",
          ];
          const styleKeywords = [
            "cinematic lighting",
            "dramatic composition",
            "depth of field",
            "bokeh",
            "trending on artstation",
          ];
          const expanded =
            prompt + ", " + qualityKeywords.join(", ") + ", " + styleKeywords.join(", ");
          const tags = ["high-quality", "professional", "detailed", "cinematic"];
          sendJson(res, 200, { expanded, tags });
        } catch {
          sendJson(res, 200, { expanded: "", tags: [] });
        }
        return;
      }

      if (path === "/api/restart" && req.method === "POST") {
        logger.info("[ControlServer] Redémarrage demandé via API");
        sendJson(res, 200, { success: true, message: "Redémarrage en cours..." });
        setTimeout(() => process.exit(0), 1000);
        return;
      }

      if (path === "/api/metrics" && req.method === "GET") {
        const dbm = cachedDbMetrics;
        sendJson(res, 200, {
          totalGuilds: dbm.totalGuilds ?? 0,
          totalLogs: dbm.totalLogs ?? 0,
          totalSanctions: dbm.totalSanctions ?? 0,
          totalTweets: dbm.totalTweets ?? 0,
          totalWishlistItems: dbm.totalWishlistItems ?? 0,
          uptime: process.uptime(),
          memoryMb: dynamicStats.memoryMb,
          logCount: logBuffer.length,
          dbMetricsUpdatedAt: dbm.updatedAt || null,
        });
        return;
      }

      // ─── Moderation ─────────────────────────────────────────────────
      if (path === "/api/moderation" && req.method === "GET") {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const [warns, mutes, bans, automod, recentSanctions, tempbans] = await Promise.all([
          prisma.sanction
            .count({ where: { type: "WARN", createdAt: { gte: since } } })
            .catch(() => 0),
          prisma.sanction
            .count({ where: { type: "MUTE", createdAt: { gte: since } } })
            .catch(() => 0),
          prisma.sanction
            .count({ where: { type: "BAN", createdAt: { gte: since } } })
            .catch(() => 0),
          prisma.log
            .count({ where: { type: "automod", createdAt: { gte: since } } })
            .catch(() => 0),
          prisma.sanction
            .findMany({
              where: { createdAt: { gte: since } },
              orderBy: { createdAt: "desc" },
              take: 20,
            })
            .catch(() => []),
          prisma.log
            .findMany({
              where: { type: "tempban" },
              orderBy: { createdAt: "desc" },
              take: 10,
            })
            .catch(() => []),
        ]);
        const automodFeed = logBuffer
          .filter((l) => l.message?.includes("[AutoMod]") || l.message?.includes("automod"))
          .slice(-15)
          .reverse();
        sendJson(res, 200, {
          stats: { warns, mutes, bans, automod },
          recentSanctions: recentSanctions.map((s) => ({
            id: s.id,
            type: s.type,
            userId: s.userId,
            reason: s.reason,
            moderatorId: s.moderatorId,
            createdAt: s.createdAt,
          })),
          tempbans: tempbans.map((t) => ({
            id: t.id,
            userId: t.userId,
            action: t.action,
            createdAt: t.createdAt,
          })),
          automodFeed: automodFeed.map((l) => ({
            timestamp: l.timestamp,
            level: l.level,
            message: l.message,
          })),
        });
        return;
      }

      // ─── Security ───────────────────────────────────────────────────
      if (path === "/api/security" && req.method === "GET") {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const [securityEvents, riskyUsers, shadowBans, osintLogs] = await Promise.all([
          prisma.log
            .count({ where: { type: "security", createdAt: { gte: since } } })
            .catch(() => 0),
          prisma.log
            .findMany({
              where: { type: "security", createdAt: { gte: since } },
              orderBy: { createdAt: "desc" },
              take: 15,
              distinct: ["userId"],
            })
            .catch(() => []),
          prisma.log.count({ where: { type: "shadowban" } }).catch(() => 0),
          prisma.log
            .findMany({
              where: { type: "osint" },
              orderBy: { createdAt: "desc" },
              take: 10,
            })
            .catch(() => []),
        ]);
        const eventsFeed = logBuffer
          .filter(
            (l) =>
              l.message?.includes("[Security]") ||
              l.message?.includes("[Risk]") ||
              l.message?.includes("[Alt]"),
          )
          .slice(-15)
          .reverse();
        sendJson(res, 200, {
          stats: {
            riskAvg: 0,
            altsCount: riskyUsers.length,
            eventsCount: securityEvents,
            shadowCount: shadowBans,
          },
          riskyUsers: riskyUsers.map((u) => ({
            id: u.id,
            userId: u.userId,
            action: u.action,
            details: u.details,
            createdAt: u.createdAt,
          })),
          eventsFeed: eventsFeed.map((l) => ({
            timestamp: l.timestamp,
            level: l.level,
            message: l.message,
          })),
          osintResults: osintLogs.map((o) => ({
            id: o.id,
            userId: o.userId,
            action: o.action,
            details: o.details,
            createdAt: o.createdAt,
          })),
        });
        return;
      }

      // ─── Music ──────────────────────────────────────────────────────
      if (path === "/api/music" && req.method === "GET") {
        try {
          const { getDisTube } = await import("./services/musicService.js");
          const dt = getDisTube();
          if (!dt) {
            sendJson(res, 200, {
              stats: { voiceCount: 0, queueCount: 0 },
              nowPlaying: null,
              queues: [],
            });
            return;
          }
          const client = (globalThis as any).__client as any;
          const guilds: { id: string; name: string }[] =
            client?.guilds?.cache?.map((g: any) => ({ id: g.id, name: g.name })) || [];
          const queues: unknown[] = [];
          let voiceCount = 0;
          let nowPlaying: { title: string; url: string; duration: string; guild: string } | null =
            null;
          for (const g of guilds) {
            const queue = dt.getQueue(g.id);
            if (queue) {
              voiceCount++;
              const songs = queue.songs || [];
              if (songs[0] && !nowPlaying) {
                nowPlaying = {
                  title: songs[0].name || songs[0].url || "Unknown",
                  url: songs[0].url || "",
                  duration: songs[0].formattedDuration || "",
                  guild: g.name,
                };
              }
              queues.push({
                guild: g.name,
                songs: songs
                  .slice(0, 10)
                  .map((s: { name?: string; url?: string; formattedDuration?: string }) => ({
                    title: s.name || s.url || "Unknown",
                    url: s.url || "",
                    duration: s.formattedDuration || "",
                  })),
                volume: queue.volume || 50,
                loop: queue.repeatMode,
                playing: queue.playing,
              });
            }
          }
          const totalQueue = queues.reduce(
            (acc: number, q: unknown) => acc + ((q as { songs?: unknown[] }).songs?.length || 0),
            0,
          );
          sendJson(res, 200, {
            stats: { voiceCount, queueCount: totalQueue },
            nowPlaying,
            queues,
          });
        } catch {
          sendJson(res, 200, {
            stats: { voiceCount: 0, queueCount: 0 },
            nowPlaying: null,
            queues: [],
          });
        }
        return;
      }

      if (path === "/api/music/control" && req.method === "POST") {
        try {
          const body = await readBody(req);
          const action = (body.action as string) || "";
          const guildId = (body.guildId as string) || "";
          const { getDisTube } = await import("./services/musicService.js");
          const dt = getDisTube();
          if (!dt || !guildId) {
            sendJson(res, 200, { success: false, error: "No music system or guild" });
            return;
          }
          const queue = dt.getQueue(guildId);
          switch (action) {
            case "pause":
              if (queue) {
                queue.pause();
              }
              break;
            case "resume":
              if (queue) {
                queue.resume();
              }
              break;
            case "skip":
              if (queue) {
                await dt.skip(guildId);
              }
              break;
            case "stop":
              if (queue) {
                await dt.stop(guildId);
              }
              break;
            case "shuffle":
              if (queue) {
                queue.shuffle();
              }
              break;
            default:
              sendJson(res, 200, { success: false, error: "Unknown action" });
              return;
          }
          sendJson(res, 200, { success: true });
        } catch (err) {
          sendJson(res, 200, { success: false, error: String(err) });
        }
        return;
      }

      // ─── Universal AI Chat API ──────────────────────────────────────
      // Accessible from any platform: curl, web app, mobile, Telegram, etc.
      if (path === "/api/chat" && req.method === "POST") {
        try {
          const body = await readBody(req);
          const message = (body.message as string)?.trim();
          const sessionId = (body.sessionId as string) || "api-default";
          const username = (body.username as string) || "API User";
          const useTools = body.tools !== false; // default true
          const _stream = body.stream === true;

          if (!message || message.length > 4000) {
            sendJson(res, 400, { error: "Paramètre 'message' requis (max 4000 caractères)" });
            return;
          }

          // Route 1: Full agent loop with tools (like ChatGPT with tools)
          if (useTools) {
            const { runAgentLoop } = await import("./services/agentLoop.js");
            const { ALL_AGENT_TOOLS } = await import("./services/agentTools.js");

            // Build a fake message-like object for the agent loop
            const fakeMessage = {
              author: { id: `api_${sessionId}`, username },
              channel: {
                messages: {
                  fetch: async () => new Map(),
                },
                isTextBased: () => true,
                send: async (opts: unknown) => ({ content: typeof opts === "string" ? opts : "" }),
              },
              channelId: `api_${sessionId}`,
              guildId: "",
              client: client,
            } as any;

            const response = await runAgentLoop(fakeMessage, message);
            sendJson(res, 200, {
              response,
              sessionId,
              toolsAvailable: ALL_AGENT_TOOLS.length,
              model: config.openRouterModel,
              timestamp: Date.now(),
            });
            return;
          }

          // Route 2: Simple chat (faster, no tools — like simple ChatGPT)
          const { chatWithAI } = await import("./services/ai.js");
          const response = await chatWithAI(message, username);
          sendJson(res, 200, {
            response,
            sessionId,
            model: config.openRouterModel,
            timestamp: Date.now(),
          });
        } catch (err) {
          logger.error("[ControlServer] /api/chat error:", err);
          sendJson(res, 500, {
            error: "Erreur IA",
            details: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      // ─── List available tools ────────────────────────────────────────
      if (path === "/api/tools" && req.method === "GET") {
        try {
          const { ALL_AGENT_TOOLS } = await import("./services/agentTools.js");
          const { EXTENDED_TOOLS } = await import("./services/agentToolsExtended.js");
          const tools = [
            ...ALL_AGENT_TOOLS.map((t: any) => ({
              name: t.function?.name,
              description: t.function?.description,
              type: "core",
            })),
            ...EXTENDED_TOOLS.map((t: any) => ({
              name: t.function?.name,
              description: t.function?.description,
              type: "extended",
            })),
          ];
          sendJson(res, 200, { count: tools.length, tools });
        } catch (_err) {
          sendJson(res, 500, { error: "Erreur listing tools" });
        }
        return;
      }

      // ─── Execute a specific tool directly ────────────────────────────
      if (path === "/api/tools/execute" && req.method === "POST") {
        try {
          const body = await readBody(req);
          const toolName = (body.tool as string)?.trim();
          const args = (body.args as Record<string, unknown>) || {};

          if (!toolName) {
            sendJson(res, 400, { error: "Paramètre 'tool' requis" });
            return;
          }

          const { executeTool } = await import("./services/agentTools.js");
          const sessionId = (body.sessionId as string) || "api-default";
          const ctx = {
            client: client,
            message: null as any,
            userId: `api_${sessionId}`,
            guildId: "",
            channelId: `api_${sessionId}`,
          } as any;

          const result = await executeTool(toolName, args, ctx);
          sendJson(res, 200, { tool: toolName, success: result.success, data: result.data });
        } catch (err) {
          logger.error("[ControlServer] /api/tools/execute error:", err);
          sendJson(res, 500, {
            error: "Erreur exécution tool",
            details: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      // ─── Bot capabilities summary ────────────────────────────────────
      if (path === "/api/capabilities" && req.method === "GET") {
        sendJson(res, 200, {
          ai: {
            agentLoop: true,
            tools: true,
            memory: true,
            multiModel: true,
            fallbacks: ["OpenRouter", "Groq", "Gemini", "HuggingFace"],
          },
          services: 65,
          tools: 52,
          githubRepos: 27,
          platforms: {
            discord: true,
            api: true,
            telegram: !!process.env.TELEGRAM_BOT_TOKEN,
            webhooks: true,
          },
          endpoints: [
            "POST /api/chat — Chat avec IA (tools optionnels)",
            "GET /api/tools — Liste tous les outils disponibles",
            "POST /api/tools/execute — Exécute un outil directement",
            "GET /api/capabilities — Capacités du bot",
            "GET /api/status — Statut du bot",
            "GET /api/metrics — Métriques",
            "GET /api/health — Health check",
            "GET /api/logs — Logs récents",
            "GET /api/servers — Serveurs Discord",
            "POST /api/restart — Redémarrer le bot",
          ],
        });
        return;
      }

      // ─── Amazon Monitoring ──────────────────────────────────────────
      if (path === "/api/amazon" && req.method === "GET") {
        try {
          const { amazonPriceAlertCheck } = await import("./utils/amazonToolkit.js");
          const alertResult = await amazonPriceAlertCheck();
          const alerts = JSON.parse(alertResult);
          sendJson(res, 200, {
            keepaEnabled: !!process.env.KEEPA_API_KEY,
            activeAlerts: alerts.totalAlerts || 0,
            triggeredAlerts: alerts.results?.filter((r: any) => r.triggered).length || 0,
            lastCheck: alerts.checkedAt || null,
            alertResults: alerts.results || [],
          });
        } catch {
          sendJson(res, 200, {
            keepaEnabled: !!process.env.KEEPA_API_KEY,
            activeAlerts: 0,
            triggeredAlerts: 0,
            alertResults: [],
          });
        }
        return;
      }

      if (path === "/api/amazon/track" && req.method === "POST") {
        try {
          const body = await readBody(req);
          const asin = (body.asin as string)?.trim();
          const domain = (body.domain as string) || "com";
          if (!asin) {
            sendJson(res, 400, { error: "ASIN requis" });
            return;
          }
          const { amazonPriceTrack } = await import("./utils/amazonToolkit.js");
          const result = await amazonPriceTrack(asin, domain);
          sendJson(res, 200, JSON.parse(result));
        } catch (err) {
          sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
        }
        return;
      }

      if (path === "/api/amazon/wishlist" && req.method === "POST") {
        try {
          const body = await readBody(req);
          const wishlistUrl = (body.wishlistUrl as string)?.trim();
          const domain = (body.domain as string) || "com";
          if (!wishlistUrl) {
            sendJson(res, 400, { error: "wishlistUrl requis" });
            return;
          }
          const { amazonWishlistScrape } = await import("./utils/amazonToolkit.js");
          const result = await amazonWishlistScrape(wishlistUrl, domain);
          sendJson(res, 200, JSON.parse(result));
        } catch (err) {
          sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
        }
        return;
      }

      if (path === "/api/amazon/alert" && req.method === "POST") {
        try {
          const body = await readBody(req);
          const asin = (body.asin as string)?.trim();
          const targetPrice = Number(body.targetPrice);
          if (!asin || !targetPrice) {
            sendJson(res, 400, { error: "asin et targetPrice requis" });
            return;
          }
          const { amazonPriceAlertCreate } = await import("./utils/amazonToolkit.js");
          const result = amazonPriceAlertCreate(asin, targetPrice, body.channelId as string | undefined);
          sendJson(res, 200, JSON.parse(result));
        } catch (err) {
          sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
        }
        return;
      }

      if (path === "/api/amazon/deals" && req.method === "GET") {
        try {
          const url = new URL(req.url || "/", `http://${req.headers.host}`);
          const domain = url.searchParams.get("domain") || "com";
          const category = url.searchParams.get("category") || "";
          const { amazonDealSearch } = await import("./utils/amazonToolkit.js");
          const result = await amazonDealSearch(domain, category);
          sendJson(res, 200, JSON.parse(result));
        } catch (err) {
          sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
        }
        return;
      }

      sendJson(res, 404, { error: "Route non trouvée: " + path });
    } catch (err) {
      logger.error("[ControlServer] Error:", err);
      sendJson(res, 500, { error: "Erreur serveur" });
    }
  });

  // WebSocket server for real-time updates to desktop app
  wss = new WebSocketServer({ noServer: true });
  server!.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }
    const token = url.searchParams.get("token") || "";
    const expectedToken = config.controlToken;
    if (expectedToken && (token.length !== expectedToken.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expectedToken)))) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    wss!.handleUpgrade(req, socket, head, (ws) => {
      wss!.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws) => {
    wsClients.add(ws);
    logger.info(`[ControlServer] WS client connected (${wsClients.size} total)`);
    ws.on("close", () => {
      wsClients.delete(ws);
      logger.info(`[ControlServer] WS client disconnected (${wsClients.size} remaining)`);
    });
    ws.on("error", () => {
      wsClients.delete(ws);
    });
    // Send initial snapshot
    try { ws.send(JSON.stringify({ type: "connected", timestamp: Date.now() }), () => {}); } catch {}
  });

  return new Promise((resolve) => {
    const bindAddress = process.env.CONTROL_BIND_ADDRESS || "127.0.0.1";
    server!.listen(port, bindAddress, () => {
      logger.info(`[ControlServer] Écoute sur ${bindAddress}:${port} (HTTP + WS)`);
      resolve();
    });
    server!.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        logger.warn(`[ControlServer] Port ${port} déjà utilisé — control server désactivé`);
        server = null;
        resolve();
      } else {
        logger.error("[ControlServer] Erreur:", err);
      }
    });
  });
}

export async function stopControlServer(): Promise<void> {
  if (wss) {
    for (const ws of wsClients) {
      ws.close();
    }
    wsClients.clear();
    wss.close();
    wss = null;
  }
  if (server) {
    server.close();
    server = null;
  }
}
