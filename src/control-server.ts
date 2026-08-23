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
 */

import http from "http";
import crypto from "crypto";
import { Client } from "discord.js";
import { WebSocketServer, WebSocket } from "ws";
import logger from "./utils/logger.js";
import prisma from "./prisma.js";
import { config } from "./config.js";
import { getFortniteState } from "./services/fortnite-broadcast.js";
import { handleWebhookRequest } from "./services/webhookTriggers.js";
import { handleWebhook as handleSecureWebhook } from "./services/webhookReceiver.js";
import { analyzeImage } from "./services/googleCloudServices.js";
import { isLowRisk, getRiskLevel } from "./services/toolRiskRegistry.js";

let server: http.Server | null = null;
let wss: WebSocketServer | null = null;
const wsClients = new Set<WebSocket>();
const logBuffer: { timestamp: number; level: string; message: string }[] = [];
const dmHistory: { timestamp: number; userId: string; message: string; success: boolean }[] = [];
const MAX_LOGS = 500;

const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

function pushLog(level: string, args: any[]) {
  const message = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  logBuffer.push({ timestamp: Date.now(), level, message });
  if (logBuffer.length > MAX_LOGS) logBuffer.shift();
  broadcastWs({ type: "log", timestamp: Date.now(), level, message });
}

function broadcastWs(data: any) {
  const payload = JSON.stringify(data);
  for (const ws of wsClients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

console.log = (...args: any[]) => {
  pushLog("info", args);
  originalLog(...args);
};
console.error = (...args: any[]) => {
  pushLog("error", args);
  originalError(...args);
};
console.warn = (...args: any[]) => {
  pushLog("warn", args);
  originalWarn(...args);
};

function authCheck(req: http.IncomingMessage): boolean {
  const token = config.controlToken;
  // Fail closed in every environment. A control API without a token is an
  // unauthenticated administrative API, even when bound to localhost.
  if (!token) {
    logger.error("[ControlServer] CONTROL_TOKEN non défini — accès refusé");
    return false;
  }
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return false;
  const presented = auth.slice("Bearer ".length);
  const presentedBuf = Buffer.from(presented);
  const expectedBuf = Buffer.from(token);
  if (presentedBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(presentedBuf, expectedBuf);
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

function sendJson(res: http.ServerResponse, code: number, data: any) {
  const allowedOrigin = getAllowedOrigin();
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
  if (allowedOrigin) {
    headers["Access-Control-Allow-Origin"] = allowedOrigin;
  }
  res.writeHead(code, headers);
  res.end(JSON.stringify(data));
}

async function readBody(req: http.IncomingMessage): Promise<Record<string, any>> {
  return new Promise((resolve) => {
    let body = "";
    let tooLarge = false;
    req.on("data", (chunk: Buffer) => {
      if (body.length > 1_000_000) {
        tooLarge = true;
        return;
      }
      body += chunk.toString();
    });
    req.on("end", () => {
      if (tooLarge) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body) as Record<string, any>);
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

export async function startControlServer(port: number, client: Client): Promise<void> {
  if (server) return;

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
        const guilds = client.guilds.cache;
        sendJson(res, 200, {
          online: client.isReady(),
          uptime: process.uptime(),
          ping: client.ws.ping,
          guilds: guilds.size,
          members: guilds.reduce((acc, g) => acc + g.memberCount, 0),
          memoryMb: (process.memoryUsage().rss / 1048576).toFixed(1),
          cpuPercent: process.cpuUsage().user / 1000000,
          commands: client.application?.commands.cache.size || 0,
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
          const sources = await prisma.source.findMany();
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
          } catch { logger.error("[Silent catch]"); }
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
          const user = await client.users.fetch(userId);
          await user.send(message);
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
          const tweetCount = await prisma.processedTweets.count().catch(() => 0);

          // Compter les comptes suivis
          const accountsRaw = process.env.TWITTER_ACCOUNTS_FORTNITE_ACCOUNTS || "";
          const accounts = accountsRaw
            .split(",")
            .map((a) => a.trim())
            .filter(Boolean);

          // Compter les cosmétiques trackés dans la wishlist
          const cosmeticsTracked = await prisma.wishlist.count().catch(() => 0);

          // Récupérer les détections récentes
          const recentPosts = await prisma.processedTweets
            .findMany({
              orderBy: { id: "desc" },
              take: 15,
            })
            .catch((): any[] => []);

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
          const body = await readBody(req);
          const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : undefined;
          const imageBase64 =
            typeof body.imageBase64 === "string" ? body.imageBase64.trim() : undefined;
          if (!imageUrl && !imageBase64) {
            sendJson(res, 400, { error: "imageUrl ou imageBase64 requis" });
            return;
          }
          const result = await analyzeImage(imageUrl, imageBase64);
          sendJson(res, 200, {
            text: result.text,
            labels: result.labels,
            faces: result.faces.length,
            logos: result.logos,
            safeSearch: result.safeSearch,
            isUnsafe: result.isUnsafe,
            colors: [],
          });
        } catch (error) {
          sendJson(res, 502, {
            error: "Analyse Vision indisponible",
            details: error instanceof Error ? error.message : String(error),
          });
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
        const [totalGuilds, totalLogs, totalSanctions, totalTweets, totalWishlistItems] =
          await Promise.all([
            prisma.guildConfig.count().catch(() => 0),
            prisma.log.count().catch(() => 0),
            prisma.sanction.count().catch(() => 0),
            prisma.processedTweets.count().catch(() => 0),
            prisma.wishlist.count().catch(() => 0),
          ]);
        sendJson(res, 200, {
          totalGuilds,
          totalLogs,
          totalSanctions,
          totalTweets,
          totalWishlistItems,
          uptime: process.uptime(),
          memoryMb: (process.memoryUsage().rss / 1048576).toFixed(1),
          logCount: logBuffer.length,
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
            .catch((): any[] => []),
          prisma.log
            .findMany({
              where: { type: "tempban" },
              orderBy: { createdAt: "desc" },
              take: 10,
            })
            .catch((): any[] => []),
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
            .catch((): any[] => []),
          prisma.log.count({ where: { type: "shadowban" } }).catch(() => 0),
          prisma.log
            .findMany({
              where: { type: "osint" },
              orderBy: { createdAt: "desc" },
              take: 10,
            })
            .catch((): any[] => []),
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
          const queues: any[] = [];
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
            (acc: number, q: any) => acc + ((q as { songs?: any[] }).songs?.length || 0),
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
                send: async (opts: any) => ({ content: typeof opts === "string" ? opts : "" }),
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
          const args = (body.args as Record<string, any>) || {};

          if (!toolName) {
            sendJson(res, 400, { error: "Paramètre 'tool' requis" });
            return;
          }

          const { ALL_AGENT_TOOLS, executeTool } = await import("./services/agentTools.js");
          const knownTool = ALL_AGENT_TOOLS.some((tool: any) => tool.function?.name === toolName);
          const risk = getRiskLevel(toolName);
          if (!knownTool || !risk || !isLowRisk(toolName)) {
            sendJson(res, 403, {
              error: "Tool refusé",
              details: !knownTool
                ? "Tool inconnu"
                : `Tool ${toolName} nécessite une validation et ne peut pas être exécuté directement par cette API`,
            });
            return;
          }
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
          const result = amazonPriceAlertCreate(
            asin,
            targetPrice,
            body.channelId as string | undefined,
          );
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
    if (
      !expectedToken ||
      token.length !== expectedToken.length ||
      !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expectedToken))
    ) {
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
    ws.send(JSON.stringify({ type: "connected", timestamp: Date.now() }));
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
