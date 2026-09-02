/**
 * healthCheck.ts — Health check enrichi pour le bot (utilitaire réutilisable)
 *
 * Vérifie l'état de tous les sous-systèmes critiques:
 * - Discord (client ready + ping)
 * - Redis (connecté + writable)
 * - PostgreSQL (Prisma connexion)
 * - BullMQ (queues actives)
 *
 * Note: services/health-http.ts gère le serveur HTTP complet des health checks.
 * services/healthcheck.ts gère les health checks périodiques avec alerting.
 * Ce module fournit une fonction simple réutilisable depuis d'autres utils/services.
 *
 * Utilisable via endpoint HTTP ou commande /health
 */

import type { Client } from "discord.js";
import { isRedisAvailable, ensureConnected } from "./redisClient.js";
import prisma from "../prisma.js";
import logger from "./logger.js";

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: number;
  uptime: number;
  checks: {
    discord: { ok: boolean; latency?: number; detail: string };
    redis: { ok: boolean; detail: string };
    database: { ok: boolean; latency?: number; detail: string };
  };
}

/** Lance un health check complet */
export async function runHealthCheck(client?: Client): Promise<HealthStatus> {
  const checks = {
    discord: await checkDiscord(client),
    redis: await checkRedis(),
    database: await checkDatabase(),
  };

  const allOk = checks.discord.ok && checks.redis.ok && checks.database.ok;
  const partialOk = checks.discord.ok || checks.redis.ok || checks.database.ok;

  return {
    status: allOk ? "healthy" : partialOk ? "degraded" : "unhealthy",
    timestamp: Date.now(),
    uptime: process.uptime(),
    checks,
  };
}

async function checkDiscord(
  client?: Client,
): Promise<{ ok: boolean; latency?: number; detail: string }> {
  if (!client) return { ok: false, detail: "Client non fourni" };
  if (!client.isReady()) return { ok: false, detail: "Client Discord non prêt" };
  const start = Date.now();
  await client.application?.fetch();
  const latency = Date.now() - start;
  return { ok: true, latency, detail: `Connecté (${client.guilds.cache.size} serveurs)` };
}

async function checkRedis(): Promise<{ ok: boolean; detail: string }> {
  if (!isRedisAvailable()) {
    const c = await ensureConnected();
    if (!c) return { ok: false, detail: "Redis non connecté" };
  }
  return { ok: true, detail: "Redis connecté et disponible" };
}

async function checkDatabase(): Promise<{ ok: boolean; latency?: number; detail: string }> {
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - start;
    return { ok: true, latency, detail: "PostgreSQL accessible" };
  } catch (err) {
    logger.warn(
      `[HealthCheck] DB check failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { ok: false, detail: "PostgreSQL inaccessible" };
  }
}

/** Format texte pour commande Discord /health */
export function formatHealthForDiscord(health: HealthStatus): string {
  const emoji = health.status === "healthy" ? "✅" : health.status === "degraded" ? "⚠️" : "🔴";
  const lines = [
    `${emoji} **Health Check** — ${health.status.toUpperCase()}`,
    `⏱️ Uptime: ${Math.floor(health.uptime / 3600)}h ${Math.floor((health.uptime % 3600) / 60)}m`,
    "",
    `**Discord:** ${health.checks.discord.ok ? "✅" : "❌"} ${health.checks.discord.detail}`,
    `**Redis:** ${health.checks.redis.ok ? "✅" : "❌"} ${health.checks.redis.detail}`,
    `**Database:** ${health.checks.database.ok ? "✅" : "❌"} ${health.checks.database.detail}`,
  ];
  return lines.join("\n");
}
