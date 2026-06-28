/**
 * shardManager.ts — Gestionnaire de sharding automatique
 *
 * Inspiré de discord-hybrid-sharding :
 * - Détection automatique du nombre de shards requis
 * - Mode single (bot petit) ou sharded (bot large)
 * - Stats par shard (guildes, ping, statut)
 * - Restart d'un shard individuel
 *
 * Discord.js v14 utilise son propre ShardingManager.
 * Ce module wrapper ajoute :
 *  - Auto-détection du nombre de shards
 *  - Monitoring des shards
 *  - Restart individuel
 */

import { ShardingManager, Shard } from "discord.js";
import logger from "./utils/logger.js";
import { config } from "./config.js";

const SHARD_FILE = "./src/bot.js";
const MAX_GUILDS_PER_SHARD = 1000;
const RECOMMENDED_SHARD_THRESHOLD = 2500;

let manager: ShardingManager | null = null;

/**
 * Calcule le nombre optimal de shards.
 * Discord recommande 1 shard pour < 2500 guildes,
 * mais on peut anticiper avec 1 shard / 1000 guildes.
 */
export function calculateShardCount(guildCount?: number): number | "auto" {
  if (!guildCount) return "auto";

  if (guildCount < RECOMMENDED_SHARD_THRESHOLD) {
    // Petit bot : 1 shard suffit, mais on peut en utiliser plus pour la perf
    if (guildCount > MAX_GUILDS_PER_SHARD) {
      return Math.ceil(guildCount / MAX_GUILDS_PER_SHARD);
    }
    return 1;
  }

  // Gros bot : calculer le nombre de shards
  return Math.ceil(guildCount / MAX_GUILDS_PER_SHARD);
}

/**
 * Démarre le bot en mode sharded ou single selon la taille.
 */
export async function startBot(): Promise<void> {
  // Pour les petits bots, on lance directement sans sharding
  // ShardingManager spawn un process enfant par shard
  const shouldShard = process.env.FORCE_SHARDING === "true";

  if (!shouldShard) {
    logger.info("[ShardManager] Mode single (pas de sharding). Pour forcer: FORCE_SHARDING=true");
    // Importer et lancer main() directement
    const { main } = await import("./bot.js");
    await main();
    return;
  }

  logger.info("[ShardManager] Démarrage en mode sharded...");

  manager = new ShardingManager(SHARD_FILE, {
    token: config.token,
    totalShards: "auto",
    respawn: true,
    shardList: "auto",
  });

  manager.on("shardCreate", (shard: Shard) => {
    logger.info(`[ShardManager] Shard ${shard.id} démarré`);

    shard.on("ready", () => {
      logger.info(`[ShardManager] Shard ${shard.id} prêt`);
    });

    shard.on("disconnect", () => {
      logger.warn(`[ShardManager] Shard ${shard.id} déconnecté`);
    });

    shard.on("reconnecting", () => {
      logger.info(`[ShardManager] Shard ${shard.id} reconnexion...`);
    });

    shard.on("death", () => {
      logger.error(`[ShardManager] Shard ${shard.id} mort`);
    });

    shard.on("error", (error) => {
      logger.error(`[ShardManager] Shard ${shard.id} erreur:`, error);
    });
  });

  try {
    await manager.spawn();
    logger.info(`[ShardManager] ${manager.totalShards} shard(s) démarré(s)`);
  } catch (error) {
    logger.error("[ShardManager] Erreur lors du spawn:", error);
    process.exit(1);
  }
}

/**
 * Récupère les statistiques de tous les shards.
 */
export async function getShardStats(): Promise<
  Array<{ id: number; status: string; ping: number; guilds: number }>
> {
  if (!manager) {
    return [];
  }

  const results: Array<{ id: number; status: string; ping: number; guilds: number }> = [];

  for (const [id, shard] of manager.shards) {
    try {
      const evalResult = await shard.eval((client) => ({
        ping: client.ws.ping,
        guilds: client.guilds.cache.size,
        status: client.ws.status === 0 ? "connected" : "disconnected",
      }));
      results.push({
        id,
        status: evalResult.status,
        ping: evalResult.ping,
        guilds: evalResult.guilds,
      });
    } catch {
      results.push({ id, status: "error", ping: -1, guilds: 0 });
    }
  }

  return results.sort((a, b) => a.id - b.id);
}

/**
 * Redémarre un shard spécifique.
 */
export async function restartShard(shardId: number): Promise<boolean> {
  if (!manager) return false;

  const shard = manager.shards.get(shardId);
  if (!shard) return false;

  try {
    logger.info(`[ShardManager] Redémarrage du shard ${shardId}...`);
    await shard.respawn();
    logger.info(`[ShardManager] Shard ${shardId} redémarré`);
    return true;
  } catch (error) {
    logger.error(`[ShardManager] Erreur redémarrage shard ${shardId}:`, error);
    return false;
  }
}

/**
 * Récupère le nombre total de shards.
 */
export function getShardCount(): number | "auto" {
  return manager?.totalShards ?? 1;
}

/**
 * Vérifie si le bot tourne en mode sharded.
 */
export function isSharded(): boolean {
  return manager !== null;
}
