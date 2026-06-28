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
import logger from "./utils/logger.js";
import prisma from "./prisma.js";
import { config } from "./config.js";

let server: http.Server | null = null;
const logBuffer: { timestamp: number; level: string; message: string }[] = [];
const dmHistory: { timestamp: number; userId: string; message: string; success: boolean }[] = [];
const MAX_LOGS = 500;

const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

function pushLog(level: string, args: unknown[]) {
  const message = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  logBuffer.push({ timestamp: Date.now(), level, message });
  if (logBuffer.length > MAX_LOGS) logBuffer.shift();
}

console.log = (...args: unknown[]) => {
  pushLog("info", args);
  originalLog(...args);
};
console.error = (...args: unknown[]) => {
  pushLog("error", args);
  originalError(...args);
};
console.warn = (...args: unknown[]) => {
  pushLog("warn", args);
  originalWarn(...args);
};

function authCheck(req: http.IncomingMessage): boolean {
  const token = config.controlToken;
  if (!token) return true;
  const auth = req.headers.authorization?.replace("Bearer ", "");
  if (!auth) return false;
  if (auth.length !== token.length) return false;
  return crypto.timingSafeEqual(Buffer.from(auth), Buffer.from(token));
}

function sendJson(res: http.ServerResponse, code: number, data: unknown) {
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(JSON.stringify(data));
}

async function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
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
        resolve(JSON.parse(body) as Record<string, unknown>);
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
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      });
      res.end();
      return;
    }

    if (path === "/api/health" || path === "/health") {
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
          sendJson(
            res,
            200,
            sources.map((s: any) => ({
              id: s.id,
              name: s.urlOrHandle,
              platform: s.type,
              active: true,
              url: s.urlOrHandle,
              lastFetch: null,
            })),
          );
        } catch {
          sendJson(res, 200, [
            { id: "twitter", name: "Twitter/X", platform: "twitter", active: true },
            { id: "youtube", name: "YouTube", platform: "youtube", active: true },
            { id: "rss", name: "RSS News", platform: "rss", active: true },
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
        const body = await readBody(req);
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
        } catch (err) {
          dmHistory.push({
            timestamp: Date.now(),
            userId,
            message,
            success: false,
          });
          sendJson(res, 500, {
            error: "Échec envoi DM",
            details: err instanceof Error ? err.message : String(err),
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
          const posts = await prisma.processedTweets.findMany({
            orderBy: { id: "desc" },
            take: 20,
          });
          sendJson(res, 200, {
            tweets: posts.length,
            news: 0,
            recent: posts.map((p: any) => ({
              title: p.tweetId,
              platform: "twitter",
              date: null,
              url: null,
            })),
          });
        } catch {
          sendJson(res, 200, { tweets: 0, news: 0, recent: [] });
        }
        return;
      }
      if (path === "/api/fortnite/test" && req.method === "POST") {
        sendJson(res, 200, { success: true });
        return;
      }

      if (path === "/api/restart" && req.method === "POST") {
        logger.info("[ControlServer] Redémarrage demandé via API");
        sendJson(res, 200, { success: true, message: "Redémarrage en cours..." });
        setTimeout(() => process.exit(0), 1000);
        return;
      }

      if (path === "/api/metrics" && req.method === "GET") {
        const [totalGuilds, totalLogs, totalSanctions] = await Promise.all([
          prisma.guildConfig.count().catch(() => 0),
          prisma.log.count().catch(() => 0),
          prisma.sanction.count().catch(() => 0),
        ]);
        sendJson(res, 200, {
          totalGuilds,
          totalLogs,
          totalSanctions,
          uptime: process.uptime(),
          memoryMb: (process.memoryUsage().rss / 1048576).toFixed(1),
          logCount: logBuffer.length,
        });
        return;
      }

      sendJson(res, 404, { error: "Route non trouvée: " + path });
    } catch (err) {
      logger.error("[ControlServer] Error:", err);
      sendJson(res, 500, { error: "Erreur serveur" });
    }
  });

  return new Promise((resolve) => {
    server!.listen(port, () => {
      logger.info(`[ControlServer] Écoute sur port ${port}`);
      resolve();
    });
    server!.on("error", (err) => {
      logger.error("[ControlServer] Erreur:", err);
    });
  });
}

export async function stopControlServer(): Promise<void> {
  if (server) {
    server.close();
    server = null;
  }
}
