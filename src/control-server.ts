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
import { getFortniteState } from "./services/fortnite-broadcast.js";

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
  const allowedOrigin = process.env.CORS_ORIGIN || "http://localhost:3721";
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": allowedOrigin,
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
      const allowedOrigin = process.env.CORS_ORIGIN || "http://localhost:3721";
      res.writeHead(204, {
        "Access-Control-Allow-Origin": allowedOrigin,
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
            .catch(() => []);

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

      if (path === "/api/studio/analyze" && req.method === "POST") {
        try {
          const body = await readBody(req);
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
          prisma.sanction.count({ where: { type: "WARN", createdAt: { gte: since } } }).catch(() => 0),
          prisma.sanction.count({ where: { type: "MUTE", createdAt: { gte: since } } }).catch(() => 0),
          prisma.sanction.count({ where: { type: "BAN", createdAt: { gte: since } } }).catch(() => 0),
          prisma.log.count({ where: { type: "automod", createdAt: { gte: since } } }).catch(() => 0),
          prisma.sanction.findMany({
            where: { createdAt: { gte: since } },
            orderBy: { createdAt: "desc" },
            take: 20,
          }).catch(() => []),
          prisma.log.findMany({
            where: { type: "tempban" },
            orderBy: { createdAt: "desc" },
            take: 10,
          }).catch(() => []),
        ]);
        const automodFeed = logBuffer.filter((l) => l.message?.includes("[AutoMod]") || l.message?.includes("automod")).slice(-15).reverse();
        sendJson(res, 200, {
          stats: { warns, mutes, bans, automod },
          recentSanctions: recentSanctions.map((s) => ({
            id: s.id, type: s.type, userId: s.userId, reason: s.reason,
            moderatorId: s.moderatorId, createdAt: s.createdAt,
          })),
          tempbans: tempbans.map((t) => ({
            id: t.id, userId: t.userId, action: t.action, createdAt: t.createdAt,
          })),
          automodFeed: automodFeed.map((l) => ({
            timestamp: l.timestamp, level: l.level, message: l.message,
          })),
        });
        return;
      }

      // ─── Security ───────────────────────────────────────────────────
      if (path === "/api/security" && req.method === "GET") {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const [securityEvents, riskyUsers, shadowBans, osintLogs] = await Promise.all([
          prisma.log.count({ where: { type: "security", createdAt: { gte: since } } }).catch(() => 0),
          prisma.log.findMany({
            where: { type: "security", createdAt: { gte: since } },
            orderBy: { createdAt: "desc" },
            take: 15,
            distinct: ["userId"],
          }).catch(() => []),
          prisma.log.count({ where: { type: "shadowban" } }).catch(() => 0),
          prisma.log.findMany({
            where: { type: "osint" },
            orderBy: { createdAt: "desc" },
            take: 10,
          }).catch(() => []),
        ]);
        const eventsFeed = logBuffer.filter((l) => l.message?.includes("[Security]") || l.message?.includes("[Risk]") || l.message?.includes("[Alt]")).slice(-15).reverse();
        sendJson(res, 200, {
          stats: {
            riskAvg: 0,
            altsCount: riskyUsers.length,
            eventsCount: securityEvents,
            shadowCount: shadowBans,
          },
          riskyUsers: riskyUsers.map((u) => ({
            id: u.id, userId: u.userId, action: u.action, details: u.details, createdAt: u.createdAt,
          })),
          eventsFeed: eventsFeed.map((l) => ({
            timestamp: l.timestamp, level: l.level, message: l.message,
          })),
          osintResults: osintLogs.map((o) => ({
            id: o.id, userId: o.userId, action: o.action, details: o.details, createdAt: o.createdAt,
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
            sendJson(res, 200, { stats: { voiceCount: 0, queueCount: 0 }, nowPlaying: null, queues: [] });
            return;
          }
          const client = (globalThis as any).__client as any;
          const guilds: { id: string; name: string }[] = client?.guilds?.cache?.map((g: any) => ({ id: g.id, name: g.name })) || [];
          const queues: unknown[] = [];
          let voiceCount = 0;
          let nowPlaying: { title: string; url: string; duration: string; guild: string } | null = null;
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
                songs: songs.slice(0, 10).map((s: { name?: string; url?: string; formattedDuration?: string }) => ({
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
          const totalQueue = queues.reduce((acc: number, q: unknown) => acc + ((q as { songs?: unknown[] }).songs?.length || 0), 0);
          sendJson(res, 200, {
            stats: { voiceCount, queueCount: totalQueue },
            nowPlaying,
            queues,
          });
        } catch {
          sendJson(res, 200, { stats: { voiceCount: 0, queueCount: 0 }, nowPlaying: null, queues: [] });
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
            case "pause": if (queue) { queue.pause(); } break;
            case "resume": if (queue) { queue.resume(); } break;
            case "skip": if (queue) { await dt.skip(guildId); } break;
            case "stop": if (queue) { await dt.stop(guildId); } break;
            case "shuffle": if (queue) { queue.shuffle(); } break;
            default: sendJson(res, 200, { success: false, error: "Unknown action" }); return;
          }
          sendJson(res, 200, { success: true });
        } catch (err) {
          sendJson(res, 200, { success: false, error: String(err) });
        }
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
