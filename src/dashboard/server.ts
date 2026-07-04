/**
 * dashboard/server.ts — Serveur Express intégré au dashboard Electron
 *
 * Routes:
 *  GET  /api/auth/discord         — Redirige vers Discord OAuth2
 *  GET  /api/auth/callback        — Callback Discord OAuth2
 *  GET  /api/auth/logout          — Déconnexion
 *  GET  /api/user                 — Profil utilisateur connecté
 *  GET  /api/guilds               — Serveurs où l'user est admin + bot présent
 *  GET  /api/guilds/:id           — Config d'un serveur
 *  POST /api/guilds/:id/settings  — Modifier la config d'un serveur
 *  GET  /api/bot/stats            — Statistiques globales du bot
 *  GET  /api/bot/health           — Health check
 */

import express from "express";
import cors from "cors";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import axios from "axios";
import * as path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { config } from "../config.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";

const DISCORD_API = "https://discord.com/api/v10";
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomUUID().replace(/-/g, "");
if (!process.env.JWT_SECRET) {
  logger.warn("[Dashboard] JWT_SECRET non défini — sessions invalidées à chaque redémarrage. Définissez JWT_SECRET dans .env");
}
const SESSION_COOKIE_NAME = "sb_session";

// ─── Rate limiting (simple in-memory) ─────────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 30; // 30 requests per minute per IP

function rateLimit(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    next();
    return;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    res.status(429).json({ error: "Too many requests" });
    return;
  }
  next();
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  global_name?: string;
}

interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}

// ─── OAuth2 Config ───────────────────────────────────────────────────────────

const CLIENT_ID = config.clientId;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || "";
const REDIRECT_URI =
  process.env.DASHBOARD_REDIRECT_URI || "http://localhost:3721/api/auth/callback";

const OAUTH_SCOPES = "identify guilds";
const OAUTH_URL = `${DISCORD_API}/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(OAUTH_SCOPES)}`;

// ─── Token helpers ───────────────────────────────────────────────────────────

function createSessionToken(userId: string, accessToken: string): string {
  return jwt.sign({ userId, accessToken }, JWT_SECRET, { expiresIn: "7d" });
}

function verifySessionToken(token: string): { userId: string; accessToken: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string; accessToken: string };
  } catch {
    return null;
  }
}

// ─── Middleware d'auth ───────────────────────────────────────────────────────

function authRequired(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace("Bearer ", "") || req.cookies?.[SESSION_COOKIE_NAME];

  if (!token) {
    res.status(401).json({ error: "Non authentifié" });
    return;
  }

  const session = verifySessionToken(token);
  if (!session) {
    res.status(401).json({ error: "Session invalide" });
    return;
  }

  (req as any).session = session;
  next();
}

// ─── Serveur ─────────────────────────────────────────────────────────────────

export async function startDashboardServer(port: number): Promise<number> {
  const app = express();

  app.use(cors({
    origin: process.env.DASHBOARD_CORS_ORIGIN || "http://localhost:3721",
    credentials: true,
  }));
  app.use(express.json({ limit: "1mb" }));

  // Security headers (helmet + custom)
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
      },
    },
  }));

  // Rate limiting on all API routes
  app.use("/api", rateLimit);

  // Cookie parser simple
  app.use((req, _res, next) => {
    const cookieHeader = req.headers.cookie || "";
    const cookies: Record<string, string> = {};
    for (const part of cookieHeader.split(";")) {
      const [key, ...val] = part.trim().split("=");
      if (key && key !== "__proto__" && key !== "constructor" && key !== "prototype") {
        cookies[key] = val.join("=");
      }
    }
    (req as any).cookies = cookies;
    next();
  });

  // Servir les fichiers statiques du frontend
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const frontendDir = path.join(__dirname, "frontend");
  app.use(express.static(frontendDir));

  // ─── Routes OAuth2 ─────────────────────────────────────────────────────────

  app.get("/api/auth/discord", (_req, res) => {
    res.redirect(OAUTH_URL);
  });

  app.get("/api/auth/callback", async (req, res) => {
    const code = req.query.code as string;
    if (!code) {
      res.status(400).send("Code manquant");
      return;
    }

    try {
      // Échanger le code contre un access token
      const tokenResponse = await axios.post(
        `${DISCORD_API}/oauth2/token`,
        new URLSearchParams({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT_URI,
        }),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        },
      );

      const { access_token, refresh_token } = tokenResponse.data;

      // Récupérer le profil utilisateur
      const userResponse = await axios.get<DiscordUser>(`${DISCORD_API}/users/@me`, {
        headers: { Authorization: `Bearer ${access_token}` },
      });

      const user = userResponse.data;
      const sessionToken = createSessionToken(user.id, access_token);

      // Rediriger vers le frontend avec le token
      res.redirect(`/?token=${sessionToken}`);
    } catch (error) {
      logger.error("[Dashboard] Erreur OAuth2 callback:", error);
      res.status(500).send("Erreur d'authentification Discord");
    }
  });

  app.get("/api/auth/logout", (_req, res) => {
    res.clearCookie(SESSION_COOKIE_NAME);
    res.json({ success: true });
  });

  // ─── Routes API ────────────────────────────────────────────────────────────

  // Profil utilisateur
  app.get("/api/user", authRequired, async (req, res) => {
    const session = (req as any).session;
    try {
      const userResponse = await axios.get<DiscordUser>(`${DISCORD_API}/users/@me`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });

      const user = userResponse.data;
      const avatarUrl = user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`
        : `https://cdn.discordapp.com/embed/avatars/0.png`;

      res.json({
        id: user.id,
        username: user.username,
        globalName: user.global_name || user.username,
        avatarUrl,
      });
    } catch {
      res.status(401).json({ error: "Token Discord expiré" });
    }
  });

  // Liste des serveurs (où l'user est admin ET le bot est présent)
  app.get("/api/guilds", authRequired, async (req, res) => {
    const session = (req as any).session;
    try {
      const guildsResponse = await axios.get<DiscordGuild[]>(`${DISCORD_API}/users/@me/guilds`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });

      const userGuilds = guildsResponse.data;

      // Filtrer : l'user doit avoir les permissions admin (0x8 = Administrator)
      const adminGuilds = userGuilds.filter(
        (g) => g.owner || (parseInt(g.permissions, 10) & 0x8) === 0x8,
      );

      // Récupérer les serveurs où le bot est présent (depuis Prisma)
      const botGuildIds = new Set(
        (await prisma.guildConfig.findMany({ select: { guildId: true } })).map((g) => g.guildId),
      );

      const result = adminGuilds.map((g) => ({
        id: g.id,
        name: g.name,
        icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128` : null,
        botPresent: botGuildIds.has(g.id),
        isOwner: g.owner,
      }));

      res.json({ guilds: result });
    } catch (error) {
      logger.error("[Dashboard] Erreur récupération guilds:", error);
      res.status(500).json({ error: "Erreur récupération serveurs" });
    }
  });

  // Config d'un serveur
  app.get("/api/guilds/:id", authRequired, async (req, res) => {
    const guildId = String(req.params.id);

    // Validate guildId format
    if (!/^\d{17,20}$/.test(guildId)) {
      res.status(400).json({ error: "Invalid guild ID" });
      return;
    }

    try {
      const guildConfig = await prisma.guildConfig.findUnique({
        where: { guildId },
      });

      if (!guildConfig) {
        res.json({ guildId, configured: false });
        return;
      }

      res.json({ ...guildConfig, configured: true });
    } catch (error) {
      logger.error("[Dashboard] Erreur récupération config guild:", error);
      res.status(500).json({ error: "Erreur récupération config" });
    }
  });

  // Modifier la config d'un serveur
  app.post("/api/guilds/:id/settings", authRequired, async (req, res) => {
    const guildId = String(req.params.id);
    const settings = req.body;

    // Validate guildId format
    if (!/^\d{17,20}$/.test(guildId)) {
      res.status(400).json({ error: "Invalid guild ID" });
      return;
    }

    // Allowlist fields to prevent mass assignment
    const ALLOWED_FIELDS = [
      "prefix", "language", "logChannelId", "modLogChannelId", "reportChannelId",
      "welcomeChannelId", "welcomeMessage", "goodbyeMessage",
      "autoModEnabled", "antiRaidEnabled", "antiPhishingEnabled",
      "levelingEnabled", "musicEnabled",
    ];
    const safeSettings: Record<string, unknown> = {};
    for (const key of ALLOWED_FIELDS) {
      if (key in settings) safeSettings[key] = settings[key];
    }

    try {
      // Upsert : créer ou mettre à jour
      const updated = await prisma.guildConfig.upsert({
        where: { guildId },
        create: {
          guildId,
          ...safeSettings,
        },
        update: {
          ...safeSettings,
        },
      });

      res.json({ success: true, config: updated });
    } catch (error) {
      logger.error("[Dashboard] Erreur mise à jour config guild:", error);
      res.status(500).json({ error: "Erreur sauvegarde config" });
    }
  });

  // Stats globales du bot
  app.get("/api/bot/stats", authRequired, async (_req, res) => {
    try {
      const [totalGuilds, totalLogs, totalSanctions, totalUsers] = await Promise.all([
        prisma.guildConfig.count(),
        prisma.log.count(),
        prisma.sanction.count(),
        prisma.userActivityLog.count(),
      ]);

      res.json({
        totalGuilds,
        totalLogs,
        totalSanctions,
        totalUsers,
        uptime: process.uptime(),
        memoryMb: (process.memoryUsage().rss / (1024 * 1024)).toFixed(1),
      });
    } catch (error) {
      logger.error("[Dashboard] Erreur stats:", error);
      res.status(500).json({ error: "Erreur stats" });
    }
  });

  // Health check
  app.get("/api/bot/health", (_req, res) => {
    res.json({
      status: "ok",
      uptime: process.uptime(),
      timestamp: Date.now(),
    });
  });

  // Fallback : servir index.html pour les routes non-API
  app.use((req, res) => {
    if (!req.path.startsWith("/api")) {
      res.sendFile(path.join(__dirname, "frontend", "index.html"));
    } else {
      res.status(404).json({ error: "Route non trouvée" });
    }
  });

  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      logger.info(`[Dashboard] Serveur en écoute sur http://localhost:${port}`);
      resolve(port);
    });
    server.on("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        logger.warn(`[Dashboard] Port ${port} occupé, essai ${port + 1}`);
        const server2 = app.listen(port + 1, () => resolve(port + 1));
      } else {
        logger.error("[Dashboard] Erreur serveur:", err);
      }
    });
  });
}

// Auto-démarrage si exécuté directement (npm run dashboard ou Railway)
const isDirectRun =
  process.argv[1]?.includes("dashboard") ||
  process.env.DASHBOARD_DEV === "true" ||
  process.env.RAILWAY_SERVICE_ID !== undefined;
if (isDirectRun) {
  const port = parseInt(process.env.PORT || process.env.DASHBOARD_PORT || "3721");
  void startDashboardServer(port).then((p) => {
    console.log(`\n  ╔══════════════════════════════════════════╗`);
    console.log(`  ║  🕵️  SHADOW BROKER DASHBOARD              ║`);
    console.log(`  ║  → http://localhost:${p}                 ║`);
    console.log(`  ╚══════════════════════════════════════════╝\n`);
  });
}
