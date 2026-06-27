/**
 * proactiveAlerts.ts — Système d'alertes proactive en DM
 *
 * Détecte automatiquement les problèmes et envoie un DM à l'owner :
 *  - Erreurs Discord (client error, shard error, shard disconnect)
 *  - Erreurs de cron jobs (échec répété)
 *  - Erreurs de base de données (connexion perdue)
 *  - Rate limiting Discord (429)
 *  - Permissions manquantes sur un serveur
 *  - Échec d'envoi de notification
 *  - API externes down (YouTube, Reddit, Steam, etc.)
 *  - Utilisation mémoire/CPU critique
 *  - Déconnexion/reconnexion WebSocket
 *
 * Cooldown intégré pour éviter le spam d'alertes.
 */

import { Client, EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";
import { config } from "../config.js";

// ─── Cooldown system ─────────────────────────────────────────────────────────

const alertCooldowns = new Map<string, number>();
const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000; // 5 min entre alertes du même type
const CRITICAL_COOLDOWN_MS = 60 * 1000; // 1 min pour les critiques

function canAlert(key: string, cooldownMs: number = DEFAULT_COOLDOWN_MS): boolean {
  const now = Date.now();
  const last = alertCooldowns.get(key) ?? 0;
  if (now - last < cooldownMs) return false;
  alertCooldowns.set(key, now);
  return true;
}

// ─── Statistiques d'erreurs ──────────────────────────────────────────────────

const errorCounts = new Map<string, number>();
const errorFirstSeen = new Map<string, number>();

function trackError(category: string): { count: number; firstSeen: number } {
  const count = (errorCounts.get(category) ?? 0) + 1;
  const firstSeen = errorFirstSeen.get(category) ?? Date.now();
  errorCounts.set(category, count);
  errorFirstSeen.set(category, firstSeen);
  return { count, firstSeen };
}

function resetError(category: string): void {
  errorCounts.delete(category);
  errorFirstSeen.delete(category);
}

// ─── Envoi DM ────────────────────────────────────────────────────────────────

let botClient: Client | null = null;

export function initProactiveAlerts(client: Client): void {
  botClient = client;

  // 1. Erreurs client Discord
  client.on("error", (error) => {
    void sendProactiveAlert(
      "discord_error",
      "🔴 Erreur Client Discord",
      `**Erreur:** ${error.message}\n\`\`\`${error.stack?.slice(0, 500) || "N/A"}\`\`\``,
      0xff3344,
      CRITICAL_COOLDOWN_MS,
    );
  });

  // 2. Déconnexion Discord
  client.on("shardDisconnect", (event) => {
    void sendProactiveAlert(
      "discord_disconnect",
      "🔌 Déconnexion Discord",
      `Le bot s'est déconnecté de Discord.\n**Raison:** ${event.reason || "Inconnue"}\n**Code:** ${event.code}`,
      0xff9900,
    );
  });

  // 3. Reconnexion Discord
  client.on("shardReconnecting", () => {
    void sendProactiveAlert(
      "discord_reconnect",
      "🔄 Reconnexion Discord",
      "Tentative de reconnexion à Discord en cours...",
      0xffaa00,
    );
  });

  // 4. Erreur de shard
  client.on("shardError", (error) => {
    void sendProactiveAlert(
      "shard_error",
      "🔴 Erreur Shard Discord",
      `**Erreur:** ${error.message}`,
      0xff3344,
      CRITICAL_COOLDOWN_MS,
    );
  });

  // 5. Rate limit Discord
  client.on("rateLimit", (rateLimitData) => {
    void sendProactiveAlert(
      `rate_limit_${rateLimitData.route}`,
      "⏱️ Rate Limit Discord",
      `**Route:** ${rateLimitData.route}\n**Limite:** ${rateLimitData.limit} req/${rateLimitData.timeout}ms\n**Méthode:** ${rateLimitData.method || "N/A"}`,
      0xffaa00,
    );
  });

  // 6. Warning Discord
  client.on("warn", (warning) => {
    void sendProactiveAlert(
      "discord_warn",
      "⚠️ Avertissement Discord",
      warning.slice(0, 1000),
      0xffaa00,
    );
  });

  // 7. Détection mémoire critique (toutes les 2 min)
  setInterval(
    () => {
      void checkMemoryUsage();
    },
    2 * 60 * 1000,
  );

  // 8. Vérification santé périodique (toutes les 10 min)
  setInterval(
    () => {
      void checkBotHealth();
    },
    10 * 60 * 1000,
  );

  logger.info("[ProactiveAlerts] Système d'alertes proactive démarré");
}

// ─── Envoi alerte DM ─────────────────────────────────────────────────────────

export async function sendProactiveAlert(
  key: string,
  title: string,
  description: string,
  color: number = 0xff3344,
  cooldownMs: number = DEFAULT_COOLDOWN_MS,
): Promise<void> {
  if (!canAlert(key, cooldownMs)) return;
  if (!botClient) return;

  try {
    const owner = await botClient.users.fetch(config.ownerId);
    if (!owner) return;

    const embed = new EmbedBuilder()
      .setTitle(`🚨 ${title}`)
      .setDescription(description.slice(0, 4000))
      .setColor(color)
      .setTimestamp()
      .setFooter({ text: "Shadow Broker — Alerte proactive" });

    await owner.send({ embeds: [embed] });
    logger.info(`[ProactiveAlerts] Alerte envoyée: ${title}`);
  } catch {
    // DM might be closed
  }
}

// ─── Détection mémoire ───────────────────────────────────────────────────────

async function checkMemoryUsage(): Promise<void> {
  const memUsage = process.memoryUsage();
  const heapUsedMB = memUsage.heapUsed / (1024 * 1024);
  const heapTotalMB = memUsage.heapTotal / (1024 * 1024);
  const rssMB = memUsage.rss / (1024 * 1024);

  // Alerte si > 400MB RSS
  if (rssMB > 400) {
    await sendProactiveAlert(
      "memory_critical",
      "🧠 Mémoire critique",
      `**RSS:** ${rssMB.toFixed(0)} MB\n**Heap utilisé:** ${heapUsedMB.toFixed(0)} MB / ${heapTotalMB.toFixed(0)} MB\n\nLe bot consomme beaucoup de mémoire. Redémarrage recommandé.`,
      0xff3344,
      30 * 60 * 1000, // 30 min cooldown
    );
  } else if (rssMB > 250) {
    await sendProactiveAlert(
      "memory_warning",
      "🧠 Mémoire élevée",
      `**RSS:** ${rssMB.toFixed(0)} MB\n**Heap utilisé:** ${heapUsedMB.toFixed(0)} MB / ${heapTotalMB.toFixed(0)} MB`,
      0xffaa00,
      60 * 60 * 1000, // 1h cooldown
    );
  }
}

// ─── Vérification santé bot ──────────────────────────────────────────────────

async function checkBotHealth(): Promise<void> {
  if (!botClient) return;

  // 1. Vérifier la connexion Discord
  if (!botClient.isReady()) {
    await sendProactiveAlert(
      "bot_not_ready",
      "❌ Bot non prêt",
      "Le client Discord n'est pas dans un état prêt. Le bot pourrait être déconnecté.",
      0xff3344,
      CRITICAL_COOLDOWN_MS,
    );
    return;
  }

  // 2. Vérifier la latence WebSocket
  const ping = botClient.ws.ping;
  if (ping > 1000) {
    await sendProactiveAlert(
      "high_ping",
      "📡 Latence élevée",
      `**Ping WebSocket:** ${ping}ms\nLa connexion à Discord est très lente.`,
      0xffaa00,
      15 * 60 * 1000,
    );
  }

  // 3. Vérifier le nombre de serveurs
  const guildCount = botClient.guilds.cache.size;
  if (guildCount === 0) {
    await sendProactiveAlert(
      "no_guilds",
      "📭 Aucun serveur",
      "Le bot n'est dans aucun serveur. Il a peut-être été expulsé de tous ses serveurs.",
      0xff3344,
      30 * 60 * 1000,
    );
  }

  // 4. Vérifier l'uptime
  const uptimeHours = botClient.uptime / (1000 * 60 * 60);
  if (uptimeHours < 0.1 && uptimeHours > 0) {
    // Bot vient de démarrer — pas une erreur mais info
    return;
  }
}

// ─── API publiques pour signalement manuel ───────────────────────────────────

/**
 * Signale une erreur de cron job.
 */
export async function alertCronFailure(cronName: string, error: string): Promise<void> {
  const { count } = trackError(`cron_${cronName}`);

  // Alerte dès le 1er échec pour les crons critiques, au 3e pour les autres
  if (count >= 1) {
    await sendProactiveAlert(
      `cron_fail_${cronName}`,
      `⏰ Cron échec: ${cronName}`,
      `**Erreur:** ${error.slice(0, 500)}\n**Échecs consécutifs:** ${count}`,
      count >= 3 ? 0xff3344 : 0xffaa00,
      count >= 3 ? CRITICAL_COOLDOWN_MS : DEFAULT_COOLDOWN_MS,
    );
  }
}

/**
 * Signale que le cron a récupéré (plus d'erreurs).
 */
export function alertCronRecovered(cronName: string): void {
  const errorCount = errorCounts.get(`cron_${cronName}`);
  if (errorCount && errorCount > 0) {
    resetError(`cron_${cronName}`);
    void sendProactiveAlert(
      `cron_recover_${cronName}`,
      `✅ Cron récupéré: ${cronName}`,
      `Le cron **${cronName}** fonctionne à nouveau normalement après ${errorCount} échec(s).`,
      0x43b581,
      60 * 1000, // 1 min cooldown
    );
  }
}

/**
 * Signale une erreur d'API externe.
 */
export async function alertApiFailure(apiName: string, error: string): Promise<void> {
  await sendProactiveAlert(
    `api_fail_${apiName}`,
    `🌐 API down: ${apiName}`,
    `**Erreur:** ${error.slice(0, 500)}\nL'API **${apiName}** ne répond pas correctement.`,
    0xff6600,
    10 * 60 * 1000, // 10 min cooldown
  );
}

/**
 * Signale un échec d'envoi de notification.
 */
export async function alertNotificationFailure(channelName: string, error: string): Promise<void> {
  await sendProactiveAlert(
    `notif_fail_${channelName}`,
    `📢 Échec notification: ${channelName}`,
    `**Salon:** ${channelName}\n**Erreur:** ${error.slice(0, 500)}`,
    0xff6600,
  );
}

/**
 * Signale un problème de permissions.
 */
export async function alertPermissionIssue(guildName: string, issue: string): Promise<void> {
  await sendProactiveAlert(
    `perm_${guildName}`,
    `🔒 Problème permissions: ${guildName}`,
    `**Serveur:** ${guildName}\n**Problème:** ${issue}`,
    0xff9900,
  );
}

/**
 * Signale une erreur de base de données.
 */
export async function alertDatabaseError(error: string): Promise<void> {
  await sendProactiveAlert(
    "db_error",
    "🗃️ Erreur base de données",
    `**Erreur:** ${error.slice(0, 500)}\n\nLa base de données (Neon) a un problème. Intervention requise.`,
    0xff3344,
    CRITICAL_COOLDOWN_MS,
  );
}

/**
 * Signale un événement critique générique.
 */
export async function alertCritical(title: string, description: string): Promise<void> {
  await sendProactiveAlert(
    `critical_${title}`,
    `🚨 ${title}`,
    description,
    0xff3344,
    CRITICAL_COOLDOWN_MS,
  );
}
