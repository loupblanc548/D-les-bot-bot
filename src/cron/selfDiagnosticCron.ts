/**
 * selfDiagnosticCron.ts — Auto-diagnostic périodique posté dans le salon des logs.
 *
 * Env :
 *  - SELF_DIAGNOSTIC_ENABLED=false        pour couper
 *  - SELF_DIAGNOSTIC_INTERVAL_HOURS=6     fréquence (1 à 168)
 *  - SELF_DIAGNOSTIC_CHANNEL_ID           sinon config.logChannel
 */
import type { Client } from "discord.js";
import { monitorEventLoopDelay, type IntervalHistogram } from "node:perf_hooks";
import logger, { fortniteLogger } from "../utils/logger.js";
import { config } from "../config.js";
import prisma from "../prisma.js";
import { getMemoryLevel } from "../utils/memoryConfig.js";
import { postFichesViaRest } from "../services/discordFiche.js";
import {
  buildDiagnosticReport,
  closeWindow,
  getWindowProblems,
  getWindowStart,
  installDiagnosticCapture,
  type HealthChecks,
} from "../services/selfDiagnostic.js";

const DB_TIMEOUT_MS = 5_000;

let timer: ReturnType<typeof setInterval> | null = null;
let loopHistogram: IntervalHistogram | null = null;

export function selfDiagnosticIntervalMs(): number {
  const hours = Number(process.env.SELF_DIAGNOSTIC_INTERVAL_HOURS || 6);
  const safe = Number.isFinite(hours) ? Math.min(168, Math.max(1, hours)) : 6;
  return safe * 60 * 60 * 1000;
}

async function checkDatabase(): Promise<{ latencyMs: number | null; error: string | null }> {
  const start = Date.now();
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout 5s")), DB_TIMEOUT_MS)),
    ]);
    return { latencyMs: Date.now() - start, error: null };
  } catch (err) {
    return {
      latencyMs: null,
      error: (err instanceof Error ? err.message : String(err)).slice(0, 120),
    };
  }
}

export async function collectHealthChecks(client: Client): Promise<HealthChecks> {
  const mem = process.memoryUsage();
  const rssMB = Math.round(mem.rss / 1024 / 1024);
  const db = await checkDatabase();
  let eventLoopP99Ms: number | null = null;
  if (loopHistogram && loopHistogram.count > 0) {
    eventLoopP99Ms = Math.round(loopHistogram.percentile(99) / 1e6);
    loopHistogram.reset();
  }
  return {
    rssMB,
    heapMB: Math.round(mem.heapUsed / 1024 / 1024),
    memoryLevel: getMemoryLevel(rssMB),
    eventLoopP99Ms,
    discordReady: client.isReady(),
    discordPingMs: Math.round(client.ws.ping),
    dbLatencyMs: db.latencyMs,
    dbError: db.error,
    uptimeSec: Math.round(process.uptime()),
  };
}

export async function runSelfDiagnostic(client: Client): Promise<void> {
  const channelId = process.env.SELF_DIAGNOSTIC_CHANNEL_ID || config.logChannel;
  if (!channelId) {
    logger.warn(
      "[SelfDiagnostic] Aucun salon de logs configuré (LOG_CHANNEL_ID) — rapport non envoyé",
    );
    return;
  }
  const health = await collectHealthChecks(client);
  const { status, embeds } = buildDiagnosticReport(health, getWindowProblems(), getWindowStart());
  await postFichesViaRest(client, channelId, embeds);
  closeWindow();
  logger.info(`[SelfDiagnostic] Rapport envoyé (${status})`);
}

export function startSelfDiagnostic(client: Client): void {
  if (timer) return;
  if (process.env.SELF_DIAGNOSTIC_ENABLED === "false") {
    logger.info("[SelfDiagnostic] Désactivé (SELF_DIAGNOSTIC_ENABLED=false)");
    return;
  }
  installDiagnosticCapture(logger);
  installDiagnosticCapture(fortniteLogger, "Fortnite");
  loopHistogram = monitorEventLoopDelay({ resolution: 20 });
  loopHistogram.enable();

  const intervalMs = selfDiagnosticIntervalMs();
  timer = setInterval(() => {
    runSelfDiagnostic(client).catch((err) =>
      logger.error("[SelfDiagnostic] Échec du rapport:", err),
    );
  }, intervalMs);
  if (timer.unref) timer.unref();
  logger.info(`[SelfDiagnostic] Actif — rapport toutes les ${intervalMs / 3_600_000} h`);
}

export function stopSelfDiagnostic(): void {
  if (timer) clearInterval(timer);
  timer = null;
  loopHistogram?.disable();
  loopHistogram = null;
}
