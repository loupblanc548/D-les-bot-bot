"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateChannels = validateChannels;
exports.validateChannelIdsStatic = validateChannelIdsStatic;
const config_1 = require("../config");
const logger_1 = __importDefault(require("../utils/logger"));
const validators_1 = require("../utils/validators");
// ==========================================================================
// Liste des channels à valider au démarrage
// ==========================================================================
const CHANNELS_TO_VALIDATE = [
    // -- Salons multi-plateforme (routage automatique) --
    { id: config_1.config.steamEpicChannel, label: "Steam/Epic Games", envKey: "STEAM_EPIC_CHANNEL_ID" },
    { id: config_1.config.playstationChannel, label: "PlayStation", envKey: "PLAYSTATION_CHANNEL_ID" },
    { id: config_1.config.xboxChannel, label: "Xbox", envKey: "XBOX_CHANNEL_ID" },
    { id: config_1.config.nintendoChannel, label: "Nintendo", envKey: "NINTENDO_CHANNEL_ID" },
    // -- Salons spécialisés --
    { id: config_1.config.fortniteChannel, label: "Fortnite", envKey: "FORTNITE_CHANNEL_ID", optional: true },
    { id: config_1.config.steamChannel, label: "Steam News", envKey: "STEAM_CHANNEL_ID", optional: true },
    { id: config_1.config.robloxChannel, label: "Roblox", envKey: "ROBLOX_CHANNEL_ID", optional: true },
    { id: config_1.config.instantGamingChannel, label: "Instant Gaming", envKey: "INSTANT_GAMING_CHANNEL_ID", optional: true },
    { id: config_1.config.gamingBlogChannel, label: "Gaming Blog", envKey: "GAMING_BLOG_CHANNEL_ID", optional: true },
    { id: config_1.config.twitterChannel, label: "Twitter/X", envKey: "TWITTER_CHANNEL_ID", optional: true },
    // -- Logs & monitoring --
    { id: config_1.config.logChannel, label: "Logs", envKey: "LOG_CHANNEL_ID", optional: true },
    { id: config_1.config.dedicatedChannel, label: "Dédié", envKey: "DEDICATED_CHANNEL_ID", optional: true },
];
// ==========================================================================
// Helper
// ==========================================================================
/** Récupère le nom d'un canal de manière sûre (gère les DM channels). */
function safeChannelName(channel) {
    return "name" in channel && channel.name ? `#${channel.name}` : `DM:${channel.id}`;
}
// ==========================================================================
// Validation principale
// ==========================================================================
/**
 * Valide au démarrage que tous les CHANNEL_ID configurés dans le .env
 * sont des salons Discord valides et accessibles par le bot.
 *
 * @param client - Le client Discord connecté
 * @returns Un rapport détaillé avec le statut de chaque salon
 */
async function validateChannels(client) {
    const results = [];
    if (!client.user) {
        logger_1.default.error("[ChannelValidator] Client user non disponible — vérification impossible");
        return { passed: 0, warnings: 0, errors: CHANNELS_TO_VALIDATE.length, results: [] };
    }
    logger_1.default.info("[ChannelValidator] Vérification des salons Discord configurés...");
    for (const def of CHANNELS_TO_VALIDATE) {
        // 1. Variable d'environnement absente ?
        if (!def.id || def.id.length === 0) {
            const status = def.optional ? "skipped" : "missing_env";
            const message = def.optional
                ? `Variable ${def.envKey} non définie (optionnel, ignoré)`
                : `Variable ${def.envKey} non définie — le routage vers ${def.label} sera désactivé`;
            results.push({ label: def.label, envKey: def.envKey, id: def.id, status, message });
            continue;
        }
        // 2. Format Snowflake invalide ?
        if (!(0, validators_1.isValidDiscordId)(def.id)) {
            results.push({
                label: def.label,
                envKey: def.envKey,
                id: def.id,
                status: "invalid_snowflake",
                message: `L'ID "${def.id}" n'est pas un Snowflake Discord valide (${def.id.length} caractères, attendu 17-20 chiffres)`,
            });
            continue;
        }
        // 3. Fetch du salon via l'API Discord
        try {
            const channel = await client.channels.fetch(def.id);
            if (!channel) {
                results.push({
                    label: def.label,
                    envKey: def.envKey,
                    id: def.id,
                    status: "not_found",
                    message: `Salon ${def.id} introuvable — le bot n'a peut-être pas accès à ce serveur, ou le salon a été supprimé`,
                });
                continue;
            }
            // 4. Vérifier que c'est un salon textuel
            if (!channel.isTextBased()) {
                results.push({
                    label: def.label,
                    envKey: def.envKey,
                    id: def.id,
                    status: "not_text",
                    message: `Le salon ${def.id} (${safeChannelName(channel)}) n'est pas un salon textuel`,
                });
                continue;
            }
            // 5. Vérifier que le bot peut envoyer des messages
            const textChannel = channel;
            const permissions = textChannel.permissionsFor(client.user.id);
            if (permissions && !permissions.has("SendMessages")) {
                results.push({
                    label: def.label,
                    envKey: def.envKey,
                    id: def.id,
                    status: "no_access",
                    message: `Le bot n'a pas la permission d'envoyer des messages dans ${safeChannelName(textChannel)} (${def.id})`,
                });
                continue;
            }
            // ✅ Tout est OK
            results.push({
                label: def.label,
                envKey: def.envKey,
                id: def.id,
                status: "ok",
                message: `${safeChannelName(textChannel)} (${def.id}) accessible`,
            });
        }
        catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            results.push({
                label: def.label,
                envKey: def.envKey,
                id: def.id,
                status: "not_found",
                message: `Erreur lors de l'accès au salon ${def.id} : ${errorMsg}`,
            });
        }
    }
    // Calcul du résumé
    const passed = results.filter((r) => r.status === "ok").length;
    const warnings = results.filter((r) => r.status === "skipped").length;
    const errors = results.filter((r) => r.status !== "ok" && r.status !== "skipped" && r.status !== "unchecked").length;
    // Log récapitulatif
    if (errors > 0) {
        logger_1.default.warn(`[ChannelValidator] ${passed} salon(s) OK, ${warnings} ignoré(s), ${errors} erreur(s) détectée(s)`);
        for (const r of results) {
            if (r.status !== "ok" && r.status !== "skipped" && r.status !== "unchecked") {
                logger_1.default.warn(`[ChannelValidator] ⚠️  ${r.label} (${r.envKey}) : ${r.message}`);
            }
        }
    }
    else {
        logger_1.default.info(`[ChannelValidator] ✅ ${passed} salon(s) validé(s), ${warnings} ignoré(s), 0 erreur`);
    }
    return { passed, warnings, errors, results };
}
/**
 * Version synchrone légère qui vérifie juste que les IDs sont des Snowflakes
 * valides (sans appeler l'API Discord). Utile pour le healthcheck statique.
 */
function validateChannelIdsStatic() {
    const results = [];
    for (const def of CHANNELS_TO_VALIDATE) {
        if (!def.id || def.id.length === 0) {
            results.push({
                label: def.label,
                envKey: def.envKey,
                id: def.id,
                status: def.optional ? "skipped" : "missing_env",
                message: def.optional
                    ? `Variable ${def.envKey} non definie (optionnel)`
                    : `Variable ${def.envKey} non definie`,
            });
        }
        else if (!(0, validators_1.isValidDiscordId)(def.id)) {
            results.push({
                label: def.label,
                envKey: def.envKey,
                id: def.id,
                status: "invalid_snowflake",
                message: `L'ID "${def.id}" n'est pas un Snowflake valide (${def.id.length} caracteres)`,
            });
        }
        else {
            results.push({
                label: def.label,
                envKey: def.envKey,
                id: def.id,
                status: "unchecked",
                message: "Snowflake valide (verification API au demarrage)",
            });
        }
    }
    return results;
}
//# sourceMappingURL=channel-validator.js.map