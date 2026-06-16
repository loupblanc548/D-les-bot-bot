/**
 * control-server.ts — Micro-serveur de controle pour l'application Desktop
 *
 * Expose une API REST + WebSocket pour piloter le bot a distance
 * depuis l'application Electron (desktop-app/).
 * Securite : token Bearer (CONTROL_TOKEN dans .env)
 */

import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import os from "os";
import logger from "./utils/logger";
import { config } from "./config";
import { dedupCache } from "./utils/deduplicationCache";
import { addWsClient as addFortniteWsClient, removeWsClient as removeFortniteWsClient, clearWsClients as clearFortniteWsClients, getFortniteState, pushFortniteDetection, resetFortniteCounters, setFortniteAccounts } from "./services/fortnite-broadcast";
import { fetchShop } from "./services/fortnite-api";
import { getCosmeticsMap } from "./services/fortnite-cosmetics";
import {
  startFreeGamesMonitoring,
  stopFreeGamesMonitoring,
} from "./cron/freeGamesCron";
import {
  startTwitterMonitoring,
  stopTwitterMonitoring,
} from "./cron/twitterCron";
import {
  startDealsMonitoring,
  stopDealsMonitoring,
} from "./cron/dealsCron";
import {
  startSteamNewsMonitoring,
  stopSteamNewsMonitoring,
} from "./cron/steamNewsCron";
import {
  startGlobalPatchNotesMonitoring,
  stopGlobalPatchNotesMonitoring,
} from "./cron/globalPatchNotesCron";
import {
  startInstantGamingNewsCheck,
  stopInstantGamingNewsCheck,
} from "./services/instantgaming-news";
import {
  startInstantGamingCheck,
  stopInstantGamingCheck,
} from "./services/instantgaming";

// ─── Types ────────────────────────────────────────────────────────────────

type PlatformId =
  | "free-games"
  | "twitter"
  | "deals"
  | "steam-news"
  | "patch_notes"
  | "instantgaming-news"
  | "instantgaming-giveaway";

interface PlatformStatus {
  id: PlatformId;
  label: string;
  active: boolean;
  cacheCount: number;
}

// ─── État global ─────────────────────────────────────────────────────────

let server: http.Server | null = null;
let wss: WebSocketServer | null = null;
const wsClients = new Set<WebSocket>();
let clientRef: import("discord.js").Client | null = null;
const startTime = Date.now();

/**
 * Plateforme activee par defaut au demarrage. On initialise a true,
 * les start*() seront appeles par startup.ts et appelleront activatePlatform().
 * Les stop*() appelleront deactivatePlatform().
 */
const platformActive: Record<PlatformId, boolean> = {
  "free-games": true,
  "twitter": true,
  "deals": true,
  "steam-news": true,
  "patch_notes": true,
  "instantgaming-news": true,
  "instantgaming-giveaway": true,
};

const PLATFORM_LABELS: Record<PlatformId, string> = {
  "free-games": "Jeux gratuits (Epic/Steam/GOG...)",
  "twitter": "Twitter / X",
  "deals": "Bons plans (Dealabs/PPDG...)",
  "steam-news": "Actualites Steam",
  "patch_notes": "Patch notes globaux",
  "instantgaming-news": "Instant Gaming - News",
  "instantgaming-giveaway": "Instant Gaming - Giveaway",
};

// ─── Gestion de l'etat des plateformes ───────────────────────────────────

export function activatePlatform(id: PlatformId): void {
  platformActive[id] = true;
  broadcast({ type: "platform-update", platforms: getPlatformStatuses() });
}

export function deactivatePlatform(id: PlatformId): void {
  platformActive[id] = false;
  broadcast({ type: "platform-update", platforms: getPlatformStatuses() });
}

function getPlatformStatuses(): PlatformStatus[] {
  const stats = dedupCache.getStats();
  return (Object.keys(PLATFORM_LABELS) as PlatformId[]).map((id) => ({
    id,
    label: PLATFORM_LABELS[id],
    active: platformActive[id],
    cacheCount: stats[id] ?? 0,
  }));
}

// ─── WebSocket Broadcast ──────────────────────────────────────────────────

let broadcasting = false;

function broadcast(data: Record<string, unknown>): void {
  if (broadcasting) return;
  broadcasting = true;
  try {
    const payload = JSON.stringify(data);
    for (const client of wsClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  } catch {
    // silently ignore broadcast errors
  } finally {
    broadcasting = false;
  }
}

// ─── Middleware d'authentification ───────────────────────────────────────

function authCheck(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  if (!config.controlToken) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "CONTROL_TOKEN non configure dans .env" }));
    return false;
  }
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ") || auth.slice(7) !== config.controlToken) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Non autorise" }));
    return false;
  }
  return true;
}

// ─── Routes API ───────────────────────────────────────────────────────────

function handleStatus(_req: http.IncomingMessage, res: http.ServerResponse): void {
  const mem = process.memoryUsage();
  const cpus = os.cpus();
  const loadAvg = os.loadavg().map((v) => Math.round(v * 100) / 100);

  // CPU usage calculation
  let totalIdle = 0;
  let totalTick = 0;
  for (const cpu of cpus) {
    for (const type of Object.keys(cpu.times) as (keyof typeof cpu.times)[]) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  }
  const cpuUsage = Math.round(((1 - totalIdle / totalTick) * 100) * 100) / 100;

  const uptime = Math.floor((Date.now() - startTime) / 1000);
  const activePlatforms = Object.values(platformActive).filter(Boolean).length;

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    online: clientRef?.isReady() ?? false,
    uptime,
    memoryMB: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
    cpuPercent: cpuUsage,
    loadAvg,
    activePlatforms,
    totalPlatforms: Object.keys(PLATFORM_LABELS).length,
    cacheTotal: dedupCache.getTotalCount(),
    pid: process.pid,
  }));
}

function handlePlatforms(_req: http.IncomingMessage, res: http.ServerResponse): void {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(getPlatformStatuses()));
}

function handlePlatformToggle(req: http.IncomingMessage, res: http.ServerResponse): void {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    try {
      const { platformId, enable } = JSON.parse(body);
      if (!(platformId in PLATFORM_LABELS)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Plateforme inconnue: " + platformId }));
        return;
      }

      const client = clientRef;
      if (!client) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Client Discord non initialise" }));
        return;
      }

      const id = platformId as PlatformId;

      if (enable && !platformActive[id]) {
        startPlatform(id, client);
        platformActive[id] = true;
        logger.info(`[Control] Plateforme ${id} activee`);
      } else if (!enable && platformActive[id]) {
        stopPlatform(id);
        platformActive[id] = false;
        logger.info(`[Control] Plateforme ${id} desactivee`);
      }

      broadcast({ type: "platform-update", platforms: getPlatformStatuses() });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, platformId, active: platformActive[id] }));
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "JSON invalide" }));
    }
  });
}

// ─── Platform start/stop dispatchers ──────────────────────────────────────

function startPlatform(id: PlatformId, client: import("discord.js").Client): void {
  switch (id) {
    case "free-games": startFreeGamesMonitoring(client); break;
    case "twitter": startTwitterMonitoring(client); break;
    case "deals": startDealsMonitoring(client); break;
    case "steam-news": startSteamNewsMonitoring(client); break;
    case "patch_notes": startGlobalPatchNotesMonitoring(client); break;
    case "instantgaming-news": startInstantGamingNewsCheck(client); break;
    case "instantgaming-giveaway": startInstantGamingCheck(client); break;
  }
}

function stopPlatform(id: PlatformId): void {
  switch (id) {
    case "free-games": stopFreeGamesMonitoring(); break;
    case "twitter": stopTwitterMonitoring(); break;
    case "deals": stopDealsMonitoring(); break;
    case "steam-news": stopSteamNewsMonitoring(); break;
    case "patch_notes": stopGlobalPatchNotesMonitoring(); break;
    case "instantgaming-news": stopInstantGamingNewsCheck(); break;
    case "instantgaming-giveaway": stopInstantGamingCheck(); break;
  }
}

// ─── POST /api/cleanup ────────────────────────────────────────────────────

async function handleCleanup(_req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  try {
    const before = dedupCache.getTotalCount();
    await dedupCache.reloadFromDisk();

    broadcast({ type: "cache-update", stats: dedupCache.getStats(), total: dedupCache.getTotalCount() });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, before, after: dedupCache.getTotalCount(), stats: dedupCache.getStats() }));
  } catch {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Echec du nettoyage" }));
  }
}

// ─── GET /api/cache ───────────────────────────────────────────────────────

// ========== Daily Stats Aggregator ==========
// Compteurs journaliers pour le resume du dashboard
export const dailyStats = {
  messagesEnvoyes: 0,
  alertes: 0,
  erreurs: 0,
  detections: 0,
};

/** Reset les compteurs journaliers (appele a minuit). */
export function resetDailyStats(): void {
  dailyStats.messagesEnvoyes = 0;
  dailyStats.alertes = 0;
  dailyStats.erreurs = 0;
  dailyStats.detections = 0;
}

/** Renvoie les stats journalieres au format JSON. */
function handleStats(_req: http.IncomingMessage, res: http.ServerResponse): void {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    date: new Date().toISOString().split("T")[0],
    ...dailyStats,
  }));
}

function handleCache(_req: http.IncomingMessage, res: http.ServerResponse): void {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    total: dedupCache.getTotalCount(),
    stats: dedupCache.getStats(),
  }));
}

// ─── POST /api/bot/restart ────────────────────────────────────────────────

function handleRestart(_req: http.IncomingMessage, res: http.ServerResponse): void {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ success: true, message: "Redemarrage du bot..." }), () => {
    logger.info("[Control] Redemarrage du bot demande via l'API");
    broadcast({ type: "bot-status", online: false, message: "Redemarrage en cours..." });
    // Graceful restart via process.exit — PM2 ou le script de demarrage relancera
    setTimeout(() => process.exit(0), 100);
  });
}

// ─── Routeur HTTP ─────────────────────────────────────────────────────────

function requestHandler(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = req.url || "/";
  const method = req.method || "GET";

  // CORS headers for Electron app
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (!authCheck(req, res)) return;

  if (url === "/api/status" && method === "GET") return handleStatus(req, res);
  if (url === "/api/platforms" && method === "GET") return handlePlatforms(req, res);
  if (url === "/api/platforms/toggle" && method === "POST") return handlePlatformToggle(req, res);
  if (url === "/api/stats" && method === "GET") return handleStats(req, res);
  if (url === "/api/cleanup" && method === "POST") { handleCleanup(req, res); return; }
  if (url === "/api/cache" && method === "GET") return handleCache(req, res);
  if (url === "/api/bot/restart" && method === "POST") return handleRestart(req, res);
  if (url === "/api/fortnite" && method === "GET") { handleFortnite(req, res); return; }
  if (url === "/api/fortnite/test" && method === "POST") return handleFortniteTest(req, res);

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Route introuvable" }));
}


// ─── GET /api/fortnite ──────────────────────────────────────────────────────

async function handleFortnite(_req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  try {
    // 1. Base state from fortnite-broadcast (counters, detections, accounts from twitterCron)
    const state = getFortniteState();

    // 2. Fetch live shop data from fortnite-api + cross-reference with cosmetics
    let shop = state.shop;
    let cosmeticsCount = 0;
    let shopDate: string | null = null;
    try {
      const [shopData, cosmeticsMap] = await Promise.all([
        fetchShop(),
        getCosmeticsMap()
      ]);
      cosmeticsCount = cosmeticsMap.size;

      
    if (shopData) {
        shopDate = shopData.date || null;
        // Enrich shop items with cosmetics metadata
        const allItems = [
          ...shopData.featured,
          ...shopData.daily,
          ...shopData.specialFeatured,
          ...shopData.specialDaily,
        ];
        shop = allItems.slice(0, 50).map(item => {
          const cosmetic = cosmeticsMap.get(item.displayName.toLowerCase());
          return {
            name: item.displayName,
            rarity: item.rarity,
            price: item.price,
            icon: item.icon || undefined,
            type: item.type || undefined,
            featuredImage: item.featuredImage || undefined,
            description: item.description?.slice(0, 120) || undefined,
            introduction: cosmetic ? {
              chapter: cosmetic.introduction?.chapter,
              season: cosmetic.introduction?.season,
            } : undefined,
          };
        });
      }
    } catch (err) {
      logger.warn("[Fortnite] Échec de l'agrégation shop/cosmétiques:", String(err));
    }

    // 3. Fortnite feeds sources from feeds.ts (static config)
    const feedSources = [
      { platform: "twitter", handle: "FortniteFR" },
      { platform: "twitter", handle: "FortniteGame" },
      { platform: "youtube", handle: "Fortnite" },
      { platform: "twitter", handle: "HYPEX" },
      { platform: "twitter", handle: "ShiinaBR" },
      { platform: "youtube", handle: "ShiinaBR" },
    ];

    // 4. Assemble aggregated response
    const aggregated = {
      // Live counters + detections from fortnite-broadcast (fed by twitterCron)
      tweets: state.tweets,
      news: state.news,
      skins: state.skins,
      accounts: state.accounts,
      detections: state.detections?.slice(0, 30) || [],

      // Enriched shop from fortnite-api + fortnite-cosmetics
      shop,
      shopDate,
      shopItemsTotal: shop.length,
      cosmeticsTracked: cosmeticsCount,

      // Feeds configuration
      feeds: feedSources,

      // Status + timestamp
      aggregationError: false,
      aggregatedAt: new Date().toISOString(),
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(aggregated));
  } catch (err) {
    // Fallback: return basic state if aggregation fails
    try {
      const fallback = getFortniteState();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ...fallback, aggregatedAt: new Date().toISOString(), aggregationError: true }));
    } catch {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Erreur interne" }));
    }
  }
}

// ─── POST /api/fortnite/test ────────────────────────────────────────────────

function handleFortniteTest(_req: http.IncomingMessage, res: http.ServerResponse): void {
  const client = clientRef;
  if (!client) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Client Discord non initialisé" }));
    return;
  }

  // Déclencher un check de la boutique Fortnite (asynchrone, ne bloque pas la réponse)
  import("./services/fortnite-api").then(({ checkWishlistMatches }) => {
    return checkWishlistMatches(client).then((matchCount) => {
      if (matchCount > 0) {
        pushFortniteDetection('skins', matchCount + " skin(s) trouvé(s) en wishlist");
      }
    });
  }).catch((err) => {
    logger.warn("[Fortnite] Erreur check wishlist:", String(err));
  });
}
// ─── Streaming des logs console ───────────────────────────────────────────

let originalConsoleLog: typeof console.log;
let originalConsoleWarn: typeof console.warn;
let originalConsoleError: typeof console.error;
let logHooked = false;

function hookConsole(): void {
  if (logHooked) return;
  logHooked = true;

  originalConsoleLog = console.log.bind(console);
  originalConsoleWarn = console.warn.bind(console);
  originalConsoleError = console.error.bind(console);

  const sendLog = (level: string, args: unknown[]): void => {
    const message = args.map((a) => {
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    }).join(" ");
    broadcast({
      type: "log",
      level,
      message,
      timestamp: new Date().toISOString(),
    });
  };

  console.log = (...args: unknown[]) => {
    originalConsoleLog(...args);
    sendLog("info", args);
  };

  console.warn = (...args: unknown[]) => {
    originalConsoleWarn(...args);
    sendLog("warn", args);
  };

  console.error = (...args: unknown[]) => {
    originalConsoleError(...args);
    sendLog("error", args);
  };
}

function unhookConsole(): void {
  if (!logHooked) return;
  logHooked = false;
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
}

// ─── WebSocket ─────────────────────────────────────────────────────────────

function handleWsUpgrade(req: http.IncomingMessage, socket: import("stream").Duplex, head: Buffer): void {
  if (!wss) return;
  // Auth via token dans l'URL : /ws?token=XYZ
  const url = new URL(req.url || "/", `http://localhost:${config.controlPort}`);
  const token = url.searchParams.get("token");

  if (!config.controlToken || token !== config.controlToken) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss!.emit("connection", ws, req);
  });
}

// ─── Demarrage / Arret ────────────────────────────────────────────────────

export async function startControlServer(
  port: number,
  client: import("discord.js").Client
): Promise<void> {
  if (server) {
    logger.warn("[Control] Serveur deja en ecoute");
    return;
  }

  if (!config.controlToken) {
    logger.warn("[Control] CONTROL_TOKEN non defini — serveur desactive");
    return;
  }

  clientRef = client;

  server = http.createServer(requestHandler);

  wss = new WebSocketServer({ noServer: true });
  // Seeder les comptes Fortnite surveillés depuis la config
  const { config: appConfig } = await import("./config");
  const accounts = appConfig.twitterAccounts
    ? appConfig.twitterAccounts.split(',').filter(Boolean).map(handle => ({
        name: handle.trim(),
        platform: 'Twitter/X',
        type: 'Fortnite News',
        lastDetection: new Date().toISOString(),
        active: true,
      }))
    : [];
  if (accounts.length > 0) {
    setFortniteAccounts(accounts);
  }

  wss.on("connection", (ws) => {
    logger.info("[Control] Client WebSocket connecte");
    wsClients.add(ws);
    addFortniteWsClient(ws);
    ws.send(JSON.stringify({ type: "connected", platforms: getPlatformStatuses() }));

    ws.on("close", () => {
      wsClients.delete(ws);
      removeFortniteWsClient(ws);
      logger.info("[Control] Client WebSocket deconnecte");
    });

    ws.on("error", () => wsClients.delete(ws));
  });

  server.on("upgrade", (req, socket, head) => {
    if (req.url?.startsWith("/ws")) {
      handleWsUpgrade(req, socket, head);
    }
  });

  hookConsole();

  return new Promise<void>((resolve, reject) => {
    server!.listen(port, () => {
      logger.info(`[Control] Serveur de controle demarre sur le port ${port}`);
      resolve();
    });
    server!.on("error", (err) => {
      logger.error(`[Control] Erreur serveur: ${err.message}`);
      reject(err);
    });
  });
}

export function stopControlServer(): void {
  unhookConsole();
  for (const client of wsClients) {
    client.close();
  }
  wsClients.clear();
  clearFortniteWsClients();
  wss?.close();
  wss = null;
  server?.close();
  server = null;
  clientRef = null;
  logger.info("[Control] Serveur de controle arrete");
}

// Reset automatique des stats journalieres a minuit
(function scheduleDailyReset() {
  const now = new Date();
  const msUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
  setTimeout(() => {
    setInterval(resetDailyStats, 24 * 60 * 60 * 1000);
    resetDailyStats();
  }, msUntilMidnight);
})();
