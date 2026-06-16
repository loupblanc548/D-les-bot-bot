"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enableMaintenanceMode = enableMaintenanceMode;
exports.disableMaintenanceMode = disableMaintenanceMode;
exports.reloadConfig = reloadConfig;
exports.reloadCommands = reloadCommands;
exports.enableAutoReload = enableAutoReload;
exports.disableAutoReload = disableAutoReload;
exports.getHotReloadStatus = getHotReloadStatus;
const discord_js_1 = require("discord.js");
const logger_1 = __importDefault(require("./logger"));
const config_1 = require("../config");
let isReloading = false;
let reloadInterval = null;
/**
 * Active le mode maintenance (désactive les commandes)
 */
async function enableMaintenanceMode(client) {
    logger_1.default.warn("[HotReload] Mode maintenance activé");
    // Supprimer toutes les commandes
    const rest = new discord_js_1.REST().setToken(config_1.config.token);
    try {
        await rest.put(discord_js_1.Routes.applicationGuildCommands(config_1.config.clientId, config_1.config.guildId), { body: [] });
        logger_1.default.info("[HotReload] Commandes supprimées (mode maintenance)");
    }
    catch (error) {
        logger_1.default.error("[HotReload] Erreur lors de la suppression des commandes:", error);
    }
}
/**
 * Désactive le mode maintenance (réenregistre les commandes)
 */
async function disableMaintenanceMode(client) {
    logger_1.default.info("[HotReload] Mode maintenance désactivé");
    // Réenregistrer les commandes
    await registerCommands(client);
}
/**
 * Recharge la configuration depuis les variables d'environnement
 */
function reloadConfig() {
    logger_1.default.info("[HotReload] Rechargement de la configuration...");
    // La configuration est déjà chargée depuis process.env
    // On peut ajouter une logique spécifique si nécessaire
    logger_1.default.info("[HotReload] Configuration rechargée");
}
/**
 * Recharge les commandes Discord sans redémarrer le bot
 */
async function reloadCommands(client) {
    if (isReloading) {
        logger_1.default.warn("[HotReload] Rechargement déjà en cours...");
        return;
    }
    isReloading = true;
    logger_1.default.info("[HotReload] Rechargement des commandes...");
    try {
        await registerCommands(client);
        logger_1.default.info("[HotReload] Commandes rechargées avec succès");
    }
    catch (error) {
        logger_1.default.error("[HotReload] Erreur lors du rechargement des commandes:", error);
    }
    finally {
        isReloading = false;
    }
}
/**
 * Enregistre les commandes Discord
 */
async function registerCommands(client) {
    const commandsPath = "./src/commands";
    // Importer dynamiquement toutes les commandes
    const commandFiles = [
        "main",
        "moderation",
        "admin",
        "security",
        "community",
        "gaming",
        "debug",
    ];
    const commands = [];
    for (const file of commandFiles) {
        try {
            const module = await Promise.resolve(`${`../commands/${file}`}`).then(s => __importStar(require(s)));
            if (module.data) {
                commands.push(module.data.toJSON());
            }
        }
        catch (error) {
            logger_1.default.error(`[HotReload] Erreur lors du chargement de ${file}:`, error);
        }
    }
    const rest = new discord_js_1.REST().setToken(config_1.config.token);
    try {
        await rest.put(discord_js_1.Routes.applicationGuildCommands(config_1.config.clientId, config_1.config.guildId), { body: commands });
        logger_1.default.info(`[HotReload] ${commands.length} commandes enregistrées`);
    }
    catch (error) {
        logger_1.default.error("[HotReload] Erreur lors de l'enregistrement des commandes:", error);
    }
}
/**
 * Active le rechargement automatique des commandes
 */
function enableAutoReload(client, intervalMs = 300000) {
    if (reloadInterval) {
        logger_1.default.warn("[HotReload] Auto-reload déjà activé");
        return;
    }
    logger_1.default.info(`[HotReload] Auto-reload activé (intervalle: ${intervalMs}ms)`);
    reloadInterval = setInterval(async () => {
        logger_1.default.info("[HotReload] Rechargement automatique...");
        await reloadCommands(client);
    }, intervalMs);
}
/**
 * Désactive le rechargement automatique
 */
function disableAutoReload() {
    if (reloadInterval) {
        clearInterval(reloadInterval);
        reloadInterval = null;
        logger_1.default.info("[HotReload] Auto-reload désactivé");
    }
}
/**
 * Obtient le statut du hot reload
 */
function getHotReloadStatus() {
    return {
        isReloading,
        autoReloadEnabled: reloadInterval !== null,
    };
}
//# sourceMappingURL=hot-reload.js.map