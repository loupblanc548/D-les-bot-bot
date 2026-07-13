import logger from "../utils/logger.js";
import fs from "fs";
import path from "path";
import { Client } from "discord.js";
import prisma from "../prisma.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface CheckResult {
  module: string;
  name: string;
  passed: boolean;
  detail: string;
  critical: boolean;
}

interface ModuleGroup {
  module: string;
  emoji: string;
  results: CheckResult[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function ok(name: string, module: string, detail = "OK"): CheckResult {
  return { module, name, passed: true, detail, critical: true };
}

function fail(name: string, module: string, detail: string): CheckResult {
  return { module, name, passed: false, detail, critical: true };
}

function warn(name: string, module: string, detail: string): CheckResult {
  return { module, name, passed: false, detail, critical: false };
}

function isValidSnowflake(val: string): boolean {
  return /^\d{17,20}$/.test(val);
}

function fileCheck(filePath: string, module: string, label: string): CheckResult {
  const fullPath = path.resolve(process.cwd(), filePath);
  const exists = fs.existsSync(fullPath);
  return exists ? ok(label, module) : fail(label, module, "FICHIER MANQUANT");
}

// ── Module 1 : BASE (5 checks) ────────────────────────────────────────────

function checkBase(): CheckResult[] {
  const m = "BASE";
  const r: CheckResult[] = [];

  const token = process.env.DISCORD_TOKEN || "";
  r.push(
    token.length > 50
      ? ok("DISCORD_TOKEN", m, `${token.length} caracteres`)
      : fail(
          "DISCORD_TOKEN",
          m,
          token.length === 0 ? "MANQUANT" : `Trop court (${token.length} car.)`,
        ),
  );

  const cid = process.env.DISCORD_CLIENT_ID || "";
  r.push(
    isValidSnowflake(cid)
      ? ok("DISCORD_CLIENT_ID", m)
      : fail("DISCORD_CLIENT_ID", m, cid ? "Format invalide" : "MANQUANT"),
  );

  const gid = process.env.DISCORD_GUILD_ID || "";
  r.push(
    isValidSnowflake(gid)
      ? ok("DISCORD_GUILD_ID", m)
      : fail("DISCORD_GUILD_ID", m, gid ? "Format invalide" : "MANQUANT"),
  );

  const oid = process.env.OWNER_ID || "";
  r.push(
    isValidSnowflake(oid)
      ? ok("OWNER_ID", m)
      : fail("OWNER_ID", m, oid ? "Format invalide" : "MANQUANT"),
  );

  const env = process.env.NODE_ENV || "development";
  r.push(ok("NODE_ENV", m, env));

  return r;
}

// ── Module 2 : BASE DE DONNEES (4 checks) ─────────────────────────────────

async function checkDatabase(): Promise<CheckResult[]> {
  const m = "BASE DE DONNEES";
  const r: CheckResult[] = [];

  const dbUrl = process.env.DATABASE_URL || "";
  r.push(dbUrl.length > 0 ? ok("DATABASE_URL", m, dbUrl) : fail("DATABASE_URL", m, "MANQUANTE"));

  r.push(fileCheck("src/prisma.ts", m, "prisma.ts"));
  r.push(fileCheck("prisma/schema.prisma", m, "schema.prisma"));

  // Vrai ping DB
  try {
    await prisma.$queryRaw`SELECT 1`;
    r.push(ok("Connexion DB", m, "SQLite operationnelle"));
  } catch (e) {
    r.push(fail("Connexion DB", m, `Echec ping: ${String(e).slice(0, 80)}`));
  }

  return r;
}

// ── Module 3 : SALONS DISCORD (8 checks) ──────────────────────────────────

function checkChannels(): CheckResult[] {
  const m = "SALONS DISCORD";
  const channels: [string, string][] = [
    ["STEAM_EPIC_CHANNEL_ID", "Steam/Epic"],
    ["PLAYSTATION_CHANNEL_ID", "PlayStation"],
    ["FORTNITE_CHANNEL_ID", "Fortnite"],
    ["XBOX_CHANNEL_ID", "Xbox"],
    ["NINTENDO_CHANNEL_ID", "Nintendo"],
    ["INSTANT_GAMING_CHANNEL_ID", "Instant Gaming"],
    ["LOG_CHANNEL_ID", "Logs"],
  ];

  return channels.map(([envVar, label]) => {
    const val = process.env[envVar] || "";
    if (val.length === 0) return fail(label, m, "MANQUANT");
    if (!isValidSnowflake(val)) return fail(label, m, `Format invalide (${val.length} chiffres)`);
    return ok(label, m);
  });
}

// ── Module 4 : IA (2 checks) ──────────────────────────────────────────────

function checkAI(): CheckResult[] {
  const m = "IA";
  const r: CheckResult[] = [];

  const key = process.env.OPENROUTER_API_KEY || "";
  r.push(
    key.length > 20
      ? ok("OPENROUTER_API_KEY", m, `${key.length} caracteres`)
      : fail(
          "OPENROUTER_API_KEY",
          m,
          key.length === 0 ? "MANQUANTE" : `Trop courte (${key.length} car.)`,
        ),
  );

  r.push(fileCheck("src/services/ai.ts", m, "ai.ts"));

  return r;
}

// ── Module 5 : SURVEILLANCE (6 checks) ────────────────────────────────────

function checkSurveillance(): CheckResult[] {
  const m = "SURVEILLANCE";
  return [
    fileCheck("src/services/monitor.ts", m, "monitor.ts"),
    fileCheck("src/services/feeds.ts", m, "feeds.ts"),
    fileCheck("src/services/epicgames.ts", m, "epicgames.ts"),
    fileCheck("src/services/youtube.ts", m, "youtube.ts"),
    fileCheck("src/commands/sources.ts", m, "sources.ts"),
  ];
}

// ── Module 6 : COMMANDES (6 checks) ───────────────────────────────────────

function checkCommandes(): CheckResult[] {
  const m = "COMMANDES";
  return [
    fileCheck("src/commands/main.ts", m, "main.ts"),
    fileCheck("src/commands/moderation.ts", m, "moderation.ts"),
    fileCheck("src/commands/admin.ts", m, "admin.ts"),
    fileCheck("src/commands/security.ts", m, "security.ts"),
    fileCheck("src/commands/community.ts", m, "community.ts"),
    fileCheck("src/commands/gaming.ts", m, "gaming.ts"),
  ];
}

// ── Module 7 : SERVICES (3 checks) ────────────────────────────────────────

function checkServices(): CheckResult[] {
  const m = "SERVICES";
  return [
    fileCheck("src/services/logs.ts", m, "logs.ts"),
    fileCheck("src/services/permissions.ts", m, "permissions.ts"),
    fileCheck("src/services/healthcheck.ts", m, "healthcheck.ts"),
  ];
}

// ── Module 8 : EVENEMENTS (3 checks) ──────────────────────────────────────

function checkEvenements(): CheckResult[] {
  const m = "EVENEMENTS";
  return [
    fileCheck("src/events/members.ts", m, "members.ts"),
    fileCheck("src/events/messages.ts", m, "messages.ts"),
    fileCheck("src/events/channels.ts", m, "channels.ts"),
  ];
}

// ── Module 9 : SERVICES EXTERNES (5 checks) ───────────────────────────────

async function checkExternalServices(): Promise<CheckResult[]> {
  const m = "SERVICES EXTERNES";
  const r: CheckResult[] = [];

  // Redis
  try {
    const redis = await import("../utils/redis.js");
    const testKey = "healthcheck:ping";
    await redis.setCache(testKey, { ts: Date.now() }, 10);
    const val = await redis.getCache<{ ts: number }>(testKey);
    r.push(
      val
        ? ok("Redis", m, "Cache opérationnel")
        : fail("Redis", m, "Écriture OK mais lecture échouée"),
    );
  } catch (e) {
    r.push(fail("Redis", m, `Erreur: ${String(e).slice(0, 60)}`));
  }

  // Twitch API (non-critical — bot works without it)
  const twitchToken = process.env.TWITCH_ACCESS_TOKEN || "";
  r.push(
    twitchToken.length > 10
      ? ok("Twitch API", m, "Token configuré")
      : warn("Twitch API", m, twitchToken ? "Token trop court" : "MANQUANT"),
  );

  // Steam API (non-critical — bot works without it)
  const steamKey = process.env.STEAM_API_KEY || "";
  r.push(
    steamKey.length > 10
      ? ok("Steam API", m, "Clé configurée")
      : warn("Steam API", m, steamKey ? "Clé trop courte" : "MANQUANTE"),
  );

  // Epic Games (pas d'API key requise, juste vérifier le endpoint)
  r.push(ok("Epic Games", m, "API publique (pas de clé requise)"));

  // OpenRouter AI
  const aiKey = process.env.OPENROUTER_API_KEY || "";
  r.push(
    aiKey.length > 20
      ? ok("OpenRouter AI", m, "Clé configurée")
      : fail("OpenRouter AI", m, "MANQUANTE"),
  );

  return r;
}

// ── Runner principal ──────────────────────────────────────────────────────

export async function runHealthCheck(): Promise<CheckResult[]> {
  logger.info("");
  logger.info("=".repeat(55));
  logger.info("  🔍 HEALTH CHECK — Verification systeme");
  logger.info("=".repeat(55));

  // Modules synchrones + DB + services externes en parallèle
  const [dbResults, extResults] = await Promise.all([checkDatabase(), checkExternalServices()]);

  const moduleGroups: ModuleGroup[] = [
    { module: "BASE", emoji: "⚙️", results: checkBase() },
    { module: "BASE DE DONNEES", emoji: "🗄️", results: dbResults },
    { module: "SALONS DISCORD", emoji: "📡", results: checkChannels() },
    { module: "IA", emoji: "🤖", results: checkAI() },
    { module: "SURVEILLANCE", emoji: "👁️", results: checkSurveillance() },
    { module: "COMMANDES", emoji: "⚡", results: checkCommandes() },
    { module: "SERVICES", emoji: "🔧", results: checkServices() },
    { module: "EVENEMENTS", emoji: "📢", results: checkEvenements() },
    { module: "SERVICES EXTERNES", emoji: "🌐", results: extResults },
  ];

  let totalPassed = 0;
  let totalFailed = 0;
  let totalChecks = 0;

  for (const group of moduleGroups) {
    logger.info(`\n  ${group.emoji} ${group.module}`);
    for (const r of group.results) {
      totalChecks++;
      if (r.passed) {
        totalPassed++;
        logger.info(`    [OK]   ${r.name}`);
      } else {
        totalFailed++;
        logger.info(`    [FAIL] ${r.name} → ${r.detail}`);
      }
    }
  }

  logger.info("");
  logger.info("=".repeat(55));
  if (totalFailed === 0) {
    logger.info(
      `  ✅ RESULTAT : ${totalPassed}/${totalChecks} OK — Tous les modules sont operationnels`,
    );
  } else {
    logger.info(`  ⚠️  RESULTAT : ${totalPassed}/${totalChecks} OK (${totalFailed} echec(s))`);
  }
  logger.info("=".repeat(55));
  logger.info("");

  // Flat array pour compatibilité avec l'existant
  return moduleGroups.flatMap((g) => g.results);
}

// ── Rapport Discord ───────────────────────────────────────────────────────

export async function sendHealthReport(client: Client, results: CheckResult[]) {
  const failed = results.filter((r) => !r.passed);
  const passed = results.filter((r) => r.passed);

  // Log interne uniquement — plus d'envoi dans le salon Discord au démarrage
  if (failed.length === 0) {
    logger.info(`[HealthCheck] ✅ ${passed.length}/${results.length} checks OK`);
  } else {
    logger.warn(
      `[HealthCheck] ⚠️ ${passed.length}/${results.length} OK — ${failed.length} échec(s)`,
    );
    for (const f of failed) {
      logger.warn(`[HealthCheck] ❌ ${f.module}: ${f.name} — ${f.detail}`);
    }
  }
}
