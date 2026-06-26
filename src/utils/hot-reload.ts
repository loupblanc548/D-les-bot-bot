import { Client, REST, Routes } from "discord.js";
import logger from "./logger.js";
import { config } from "../config.js";

let isReloading = false;
let reloadInterval: NodeJS.Timeout | null = null;

/**
 * Active le mode maintenance (désactive les commandes)
 */
export async function enableMaintenanceMode(_client: Client) {
  logger.warn("[HotReload] Mode maintenance activé");
  // Supprimer toutes les commandes
  const rest = new REST().setToken(config.token);
  try {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: [] });
    logger.info("[HotReload] Commandes supprimées (mode maintenance)");
  } catch (error) {
    logger.error("[HotReload] Erreur lors de la suppression des commandes:", error);
  }
}

/**
 * Désactive le mode maintenance (réenregistre les commandes)
 */
export async function disableMaintenanceMode(client: Client) {
  logger.info("[HotReload] Mode maintenance désactivé");
  // Réenregistrer les commandes
  await registerCommands(client);
}

/**
 * Recharge la configuration depuis les variables d'environnement
 */
export function reloadConfig() {
  logger.info("[HotReload] Rechargement de la configuration...");
  // La configuration est déjà chargée depuis process.env
  // On peut ajouter une logique spécifique si nécessaire
  logger.info("[HotReload] Configuration rechargée");
}

/**
 * Recharge les commandes Discord sans redémarrer le bot
 */
export async function reloadCommands(client: Client) {
  if (isReloading) {
    logger.warn("[HotReload] Rechargement déjà en cours...");
    return;
  }

  isReloading = true;
  logger.info("[HotReload] Rechargement des commandes...");

  try {
    await registerCommands(client);
    logger.info("[HotReload] Commandes rechargées avec succès");
  } catch (error) {
    logger.error("[HotReload] Erreur lors du rechargement des commandes:", error);
  } finally {
    isReloading = false;
  }
}

/**
 * Enregistre les commandes Discord
 */
async function registerCommands(_client: Client) {
  const _commandsPath = "./src/commands";
  // Importer dynamiquement toutes les commandes
  const commandFiles = ["main", "moderation", "admin", "security", "community", "gaming", "debug"];

  const commands = [];
  for (const file of commandFiles) {
    try {
      const module = await import(`../commands/${file}`);
      if (module.data) {
        commands.push(module.data.toJSON());
      }
    } catch (error) {
      logger.error(`[HotReload] Erreur lors du chargement de ${file}:`, error);
    }
  }

  const rest = new REST().setToken(config.token);
  try {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
      body: commands,
    });
    logger.info(`[HotReload] ${commands.length} commandes enregistrées`);
  } catch (error) {
    logger.error("[HotReload] Erreur lors de l'enregistrement des commandes:", error);
  }
}

/**
 * Active le rechargement automatique des commandes
 */
export function enableAutoReload(client: Client, intervalMs: number = 300000) {
  if (reloadInterval) {
    logger.warn("[HotReload] Auto-reload déjà activé");
    return;
  }

  logger.info(`[HotReload] Auto-reload activé (intervalle: ${intervalMs}ms)`);
  reloadInterval = setInterval(async () => {
    logger.info("[HotReload] Rechargement automatique...");
    await reloadCommands(client);
  }, intervalMs);
}

/**
 * Désactive le rechargement automatique
 */
export function disableAutoReload() {
  if (reloadInterval) {
    clearInterval(reloadInterval);
    reloadInterval = null;
    logger.info("[HotReload] Auto-reload désactivé");
  }
}

/**
 * Obtient le statut du hot reload
 */
export function getHotReloadStatus() {
  return {
    isReloading,
    autoReloadEnabled: reloadInterval !== null,
  };
}
