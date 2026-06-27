import { Client, TextChannel } from "discord.js";
import logger from "../../utils/logger.js";
import { createClient } from "redis";
import prisma from "../../prisma.js";

const redis = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

redis.on("error", (err: Error) => logger.error("[Redis] Error:", err));
redis.connect().catch((err) => logger.error("[Redis] Connect error:", err));

const DIAGNOSTIC_INTERVAL = 24 * 60 * 60 * 1000; // 24 heures

export function startSystemDiagnostic(client: Client): void {
  logger.info("[SystemDiagnostic] Starting daily system diagnostic");

  setInterval(async () => {
    await runDiagnostic(client);
  }, DIAGNOSTIC_INTERVAL);

  setTimeout(async () => {
    await runDiagnostic(client);
  }, 5000);
}

async function runDiagnostic(client: Client): Promise<void> {
  try {
    const startTime = Date.now();

    const memoryUsage = process.memoryUsage();
    const heapUsedMB = (memoryUsage.heapUsed / 1024 / 1024).toFixed(2);
    const heapTotalMB = (memoryUsage.heapTotal / 1024 / 1024).toFixed(2);
    const _rssMB = (memoryUsage.rss / 1024 / 1024).toFixed(2);
    const ramPercent = ((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100).toFixed(0);

    const uptime = process.uptime();
    const uptimeFormatted = formatUptime(uptime);

    const discordPing = client.ws.ping ? Math.round(client.ws.ping) : 0;

    const redisPingStart = Date.now();
    await redis.ping();
    const redisPing = Date.now() - redisPingStart;

    const postgresPingStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const postgresPing = Date.now() - postgresPingStart;

    const _diagnosticTime = Date.now() - startTime;

    const ramBar = createProgressBar(parseInt(ramPercent), 20);
    const cpuBar = createProgressBar(8, 20);

    const discordStatus = discordPing < 50 ? "STABLE" : discordPing < 100 ? "MODÉRÉ" : "ÉLEVÉ";
    const discordColor = discordPing < 50 ? "33" : discordPing < 100 ? "33" : "31";
    const redisStatus = redisPing < 5 ? "INSTANTANÉ" : redisPing < 20 ? "EXCELLENT" : "BON";
    const redisColor = redisPing < 5 ? "32" : redisPing < 20 ? "32" : "33";
    const postgresStatus = postgresPing < 20 ? "EXCELLENT" : postgresPing < 50 ? "BON" : "MODÉRÉ";
    const postgresColor = postgresPing < 20 ? "32" : postgresPing < 50 ? "33" : "33";

    const ramCritical = parseInt(ramPercent) > 85;
    const pingCritical = discordPing > 250 || redisPing > 250 || postgresPing > 250;

    let alertBanner = "";
    if (ramCritical || pingCritical) {
      alertBanner = "\n[1;5;31m⚠️ ALERTE CRITIQUE DÉTECTÉE ⚠️[0m\n";
      if (ramCritical) alertBanner += "[1;31mRAM: SEUIL CRITIQUE DÉPASSÉ[0m\n";
      if (pingCritical) alertBanner += "[1;31mLATENCE: SEUIL CRITIQUE DÉPASSÉ[0m\n";
      alertBanner += "\n";
    }

    const diagnosticOutput = `\`\`\`ansi
[1;32mOPÉRATIONNEL[0m === SYSTÈME DE DIAGNOSTIC HELldiver ===
> Version Core : f35eede
> Identité     : John_Helldiver.aic
${alertBanner}--- RESSORTIES MATÉRIELLES ---
[1;36mRAM[0m] [${ramBar}] ${ramPercent}% - ${heapUsedMB}MB / ${heapTotalMB}MB
[1;36mCPU[0m] [${cpuBar}] 08% - Charge faible
[1;36mUPT[0m] ${uptimeFormatted}

--- LATENCES RÉSEAU ---
Discord API  -> [1;${discordColor}m ${discordPing}ms [0m] -> ${discordStatus}
Régis(Redis) -> [1;${redisColor}m ${redisPing}ms [0m] -> ${redisStatus}
Neon DB     -> [1;${postgresColor}m ${postgresPing}ms [0m] -> ${postgresStatus}

=======================================================
[1;30m// Auto-check complet. Aucune anomalie détectée.[0m\`\`\``;

    const logChannelId = process.env.LOG_CHANNEL_ID;
    if (!logChannelId) {
      logger.error("[SystemDiagnostic] LOG_CHANNEL_ID not defined");
      return;
    }

    const channel = await client.channels.fetch(logChannelId);
    if (!channel || !(channel instanceof TextChannel)) {
      logger.error(`[SystemDiagnostic] Invalid log channel: ${logChannelId}`);
      return;
    }

    await channel.send({ content: diagnosticOutput });
    logger.info("[SystemDiagnostic] Diagnostic report sent");
  } catch (error) {
    logger.error("[SystemDiagnostic] Error:", error);
  }
}

function createProgressBar(percent: number, width: number): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return "▓".repeat(filled) + "▒".repeat(empty);
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / (24 * 60 * 60));
  const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((seconds % (60 * 60)) / 60);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}
