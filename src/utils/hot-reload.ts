import { Client, REST, Routes } from "discord.js";
import logger from "./logger.js";
import { safeInterval } from "./safe-interval.js";
import { config } from "../config.js";
import { readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

let isReloading = false;
let reloadInterval: NodeJS.Timeout | null = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Invalide le cache des modules pour forcer le re-import.
 * En ESM, on utilise le cache interne de Node via import().
 */
export async function invalidateModuleCache(modulePath: string): Promise<void> {
  try {
    const url = new URL(`file:///${modulePath.replace(/\\/g, "/")}`).href;
    // En ESM, pas de cache accessible directement, mais on peut forcer un re-import
    // en ajoutant un query string pour bypasser le cache
    await import(`${url}?t=${Date.now()}`);
    logger.debug(`[HotReload] Cache invalidé: ${modulePath}`);
  } catch {
    // Si l'import échoue, le module n'existe peut-être pas encore
  }
}

/**
 * Découvre automatiquement tous les fichiers de commandes dans src/commands/
 * Inspiré de disapp — auto-registry sans imports manuels.
 */
export function discoverCommandFiles(): string[] {
  const commandsDir = join(__dirname, "..", "commands");
  const files: string[] = [];

  function scan(dir: string) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".js")) {
        if (entry.name.endsWith(".d.ts") || entry.name.endsWith(".test.ts")) continue;
        files.push(fullPath);
      }
    }
  }

  try {
    scan(commandsDir);
  } catch {
    // ignore
  }

  return files;
}

/**
 * Découvre automatiquement tous les fichiers de services dans src/services/
 */
export function discoverServiceFiles(): string[] {
  const servicesDir = join(__dirname, "..", "services");
  const files: string[] = [];

  try {
    const entries = readdirSync(servicesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (
        (entry.name.endsWith(".ts") || entry.name.endsWith(".js")) &&
        !entry.name.endsWith(".d.ts") &&
        !entry.name.endsWith(".test.ts")
      ) {
        files.push(join(servicesDir, entry.name));
      }
    }
  } catch {
    // ignore
  }

  return files;
}

/**
 * Recharge un module spécifique à chaud.
 * Retourne le module rechargé ou null.
 */
export async function reloadModule(modulePath: string): Promise<unknown | null> {
  try {
    const url = new URL(`file:///${modulePath.replace(/\\/g, "/")}`).href;
    const freshModule = await import(`${url}?t=${Date.now()}`);
    logger.info(`[HotReload] Module rechargé: ${modulePath.split(/[\\/]/).pop()}`);
    return freshModule;
  } catch (error) {
    logger.error(`[HotReload] Erreur rechargement ${modulePath}:`, error);
    return null;
  }
}

/**
 * Recharge tous les modules de commandes à chaud.
 */
export async function reloadAllCommands(): Promise<{ success: number; failed: number }> {
  const files = discoverCommandFiles();
  let success = 0;
  let failed = 0;

  for (const file of files) {
    const result = await reloadModule(file);
    if (result) {
      success++;
    } else {
      failed++;
    }
  }

  logger.info(`[HotReload] Commandes rechargées: ${success} OK, ${failed} échouées`);
  return { success, failed };
}

/**
 * Recharge tous les services à chaud.
 */
export async function reloadAllServices(): Promise<{ success: number; failed: number }> {
  const files = discoverServiceFiles();
  let success = 0;
  let failed = 0;

  for (const file of files) {
    const result = await reloadModule(file);
    if (result) {
      success++;
    } else {
      failed++;
    }
  }

  logger.info(`[HotReload] Services rechargés: ${success} OK, ${failed} échouées`);
  return { success, failed };
}

/**
 * Recharge tout (commandes + services) et réenregistre les slash commands.
 */
export async function fullReload(client: Client): Promise<{
  commands: { success: number; failed: number };
  services: { success: number; failed: number };
  registered: boolean;
}> {
  if (isReloading) {
    logger.warn("[HotReload] Rechargement déjà en cours...");
    return {
      commands: { success: 0, failed: 0 },
      services: { success: 0, failed: 0 },
      registered: false,
    };
  }

  isReloading = true;
  logger.info("[HotReload] Rechargement complet en cours...");

  try {
    const commands = await reloadAllCommands();
    const services = await reloadAllServices();

    // Réenregistrer les slash commands via l'API Discord
    let registered = false;
    try {
      const { allCommands } = await import("../commandRouter.js?t=" + Date.now());
      const rest = new REST({ version: "10" }).setToken(config.token);
      if (config.guildId) {
        await rest.put(
          Routes.applicationGuildCommands(config.clientId, config.guildId),
          { body: allCommands },
        );
      } else {
        await rest.put(Routes.applicationCommands(config.clientId), {
          body: allCommands,
        });
      }
      registered = true;
      logger.info(`[HotReload] ${allCommands.length} commandes réenregistrées`);
    } catch (error) {
      logger.error("[HotReload] Erreur réenregistrement:", error);
    }

    logger.info("[HotReload] Rechargement complet terminé");
    return { commands, services, registered };
  } finally {
    isReloading = false;
  }
}

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
  reloadInterval = safeInterval(
    "HotReload",
    async () => {
      logger.info("[HotReload] Rechargement automatique...");
      await reloadCommands(client);
    },
    intervalMs,
  );
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
