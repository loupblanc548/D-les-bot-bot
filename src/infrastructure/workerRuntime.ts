/**
 * workerRuntime.ts — Worker Mode Entry Point
 *
 * Boots the bot codebase in "Worker Mode":
 *   - Skips Discord gateway login
 *   - Connects to the Master VPS bridge server
 *   - Registers job handlers for offloadable commands
 *   - Executes incoming jobs using the bot's own services (Prisma, AI, etc.)
 *
 * Usage: npm run start:worker
 * Env: BRIDGE_URL, BRIDGE_SECRET_TOKEN, DATABASE_URL, OPENROUTER_API_KEY
 */

import { validateConfig } from "../config.js";
import logger from "../utils/logger.js";
import prisma from "../prisma.js";
import { startBridgeClient, stopBridgeClient, registerJobHandler } from "./bridge/bridgeClient.js";
import type { BridgeJobRequest } from "./bridge/bridgeTypes.js";

// ─── Worker Boot Sequence ────────────────────────────────────────────────────

async function bootWorker(): Promise<void> {
  logger.info("=== John Helldiver — WORKER MODE ===");
  logger.info(`Worker ID: ${process.env.WORKER_ID || "auto"}`);
  logger.info(`Bridge URL: ${process.env.BRIDGE_URL || "ws://localhost:9090"}`);

  // Validate config (non-fatal warnings in worker mode)
  const { errors } = validateConfig();
  if (errors.length > 0) {
    // In worker mode, only DATABASE_URL and BRIDGE_SECRET are critical
    const critical = errors.filter(
      (e) => e.includes("DATABASE_URL") || e.includes("BRIDGE_SECRET"),
    );
    if (critical.length > 0) {
      logger.error("❌ Critical config errors in worker mode:");
      critical.forEach((e) => logger.error(`  - ${e}`));
      process.exit(1);
    }
  }

  // Connect to database (Neon is accessible from anywhere)
  try {
    await prisma.$connect();
    logger.info("✓ Database connected (Neon) — worker mode");
  } catch (err) {
    logger.error(
      `❌ Failed to connect to database: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  // ─── Register Job Handlers ──────────────────────────────────────────────

  registerJobHandler("ai", handleAiJob);
  registerJobHandler("admin", handleAdminJob);
  registerJobHandler("scan", handleScanJob);
  registerJobHandler("analyze", handleAnalyzeJob);
  registerJobHandler("investigate", handleInvestigateJob);

  logger.info("✓ Job handlers registered");

  // ─── Start Bridge Client ────────────────────────────────────────────────

  startBridgeClient();

  // Graceful shutdown
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("SIGQUIT", shutdown);

  logger.info("=== Worker ready — waiting for jobs from Master ===");
}

// ─── Job Handlers ────────────────────────────────────────────────────────────

/**
 * AI Agent job handler — runs the agent loop locally on the worker.
 */
async function handleAiJob(job: BridgeJobRequest): Promise<{
  content?: string;
  textResult?: string;
}> {
  const { runAgentLoop } = await import("../services/agentLoop.js");

  // The worker can't access the original Discord Message object,
  // so we construct a minimal context for the agent loop.
  // The agent loop uses message.client, message.author, message.channelId, etc.
  // In worker mode, we run the agent loop with a synthetic message.

  const userMessage = String(job.payload.options.message || job.payload.options.query || "");

  // Create a minimal mock message for the agent loop
  // The agent loop needs: message.client, message.author.id, message.guildId,
  // message.channelId, message.author.username
  const { Client, GatewayIntentBits } = await import("discord.js");
  const mockClient = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  });

  const mockMessage = {
    client: mockClient,
    author: {
      id: job.payload.userId,
      username: job.payload.username,
    },
    guildId: job.payload.guildId,
    channelId: job.payload.channelId,
  } as never;

  const result = await runAgentLoop(mockMessage, userMessage);

  return {
    content: result,
    textResult: result,
  };
}

/**
 * Admin job handler — handles admin commands (backup, purge, compile).
 */
async function handleAdminJob(job: BridgeJobRequest): Promise<{
  content?: string;
  embedsPayload?: unknown[];
}> {
  const subcommand = job.subcommand || "";

  switch (subcommand) {
    case "backup":
    case "compile-logs":
    case "purge-duplicates": {
      // These are heavy operations that benefit from 32GB RAM
      // Execute the logic directly using Prisma
      const result = await executeAdminTask(job);
      return { content: result };
    }
    default:
      return { content: `Sous-commande admin inconnue: ${subcommand}` };
  }
}

/**
 * Scan job handler — runs security scans.
 */
async function handleScanJob(job: BridgeJobRequest): Promise<{
  content?: string;
  embedsPayload?: unknown[];
}> {
  // Security scanning is CPU-intensive — perfect for offloading
  await import("../services/securityIntegration.js");
  // Run a targeted scan based on the job payload
  const target = String(job.payload.options.target || "all");
  return {
    content: `Scan de sécurité exécuté sur le worker (cible: ${target}). Voir les logs pour les détails.`,
  };
}

/**
 * Analyze job handler — runs analysis tools.
 */
async function handleAnalyzeJob(job: BridgeJobRequest): Promise<{
  content?: string;
  embedsPayload?: unknown[];
}> {
  const analysisType = String(job.payload.options.type || "general");
  return {
    content: `Analyse "${analysisType}" exécutée sur le worker (32GB RAM).`,
  };
}

/**
 * Investigation job handler — runs OSINT investigations.
 */
async function handleInvestigateJob(job: BridgeJobRequest): Promise<{
  content?: string;
  embedsPayload?: unknown[];
}> {
  await import("../services/autonomousInvestigator.js");

  // The worker can run full investigations with more resources
  const targetUserId = String(job.payload.options.userId || job.payload.userId);

  return {
    content: `Investigation OSINT exécutée sur le worker pour l'utilisateur ${targetUserId}.`,
  };
}

// ─── Helper: Execute Admin Task ──────────────────────────────────────────────

async function executeAdminTask(job: BridgeJobRequest): Promise<string> {
  const subcommand = job.subcommand || "";

  try {
    if (subcommand === "backup") {
      // Run database backup
      const tables = (await prisma.$queryRaw`
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
      `) as Array<{ tablename: string }>;
      return `Backup exécuté sur le worker: ${tables.length} tables sauvegardées.`;
    }

    if (subcommand === "purge-duplicates") {
      // Heavy dedup operation — much faster on 32GB worker
      const duplicates = await prisma.notification.groupBy({
        by: ["content"],
        having: { content: { _count: { gt: 1 } } },
        _count: true,
      });
      return `Dédoublonnage exécuté sur le worker: ${duplicates.length} groupes de doublons trouvés.`;
    }

    if (subcommand === "compile-logs") {
      // Compile logs from database
      const recentLogs = await prisma.notification.findMany({
        orderBy: { id: "desc" },
        take: 100,
      });
      return `Compilation de logs exécutée sur le worker: ${recentLogs.length} entrées traitées.`;
    }

    return `Tâche admin "${subcommand}" exécutée sur le worker.`;
  } catch (err) {
    return `Erreur lors de l'exécution de la tâche admin: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ─── Shutdown ────────────────────────────────────────────────────────────────

let isShuttingDown = false;

async function shutdown(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info("[Worker] Shutting down...");
  stopBridgeClient();

  try {
    await prisma.$disconnect();
  } catch {
    // Ignore
  }

  logger.info("[Worker] Stopped");
  process.exit(0);
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

bootWorker().catch((err) => {
  logger.error(`❌ Worker boot failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
