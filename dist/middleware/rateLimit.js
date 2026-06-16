"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_RATE_LIMIT = void 0;
exports.createRateLimitMiddleware = createRateLimitMiddleware;
const discord_js_1 = require("discord.js");
const redis_1 = require("../utils/redis");
const config_1 = require("../config");
const logger_1 = __importDefault(require("../utils/logger"));
exports.DEFAULT_RATE_LIMIT = {
    windowSeconds: 5,
    maxRequests: 3,
    bypassAdmins: true,
};
/**
 * Middleware de rate-limiting (fenêtre fixe) basé sur Redis.
 * - Clé = `rl:{guildId|dms}:{userId}:{commandName}`.
 * - Bypass configurable pour les admins et le propriétaire du serveur.
 * - Tolère l'indisponibilité de Redis (log warn + laisse passer la requête).
 */
function createRateLimitMiddleware(override = {}) {
    const cfg = {
        ...exports.DEFAULT_RATE_LIMIT,
        ...config_1.config.rateLimit,
        ...override,
    };
    return async function rateLimit(interaction, _client, next) {
        if (!interaction.isChatInputCommand()) {
            return next();
        }
        // Bypass admins / propriétaire
        if (cfg.bypassAdmins && isAdminOrOwner(interaction)) {
            return next();
        }
        const scope = interaction.guildId ?? "dm";
        const key = `rl:${scope}:${interaction.user.id}:${interaction.commandName}`;
        let count = null;
        try {
            count = await (0, redis_1.incrementCache)(key);
            if (count === 1 || count === null) {
                await (0, redis_1.setCacheExpire)(key, cfg.windowSeconds);
            }
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger_1.default.warn(`[RateLimit] Redis indisponible, on laisse passer : ${msg}`);
            return next();
        }
        if (count === null) {
            return next();
        }
        if (count > cfg.maxRequests) {
            const ttl = await (0, redis_1.getCacheTTL)(key);
            const remaining = Math.max(1, ttl ?? cfg.windowSeconds);
            const content = `⏱️ Trop de requêtes. Réessaie dans **${remaining}s**.`;
            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp({ content, flags: [discord_js_1.MessageFlags.Ephemeral] });
                }
                else {
                    await interaction.reply({ content, flags: [discord_js_1.MessageFlags.Ephemeral] });
                }
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                logger_1.default.warn(`[RateLimit] Impossible de prévenir l'utilisateur : ${msg}`);
            }
            logger_1.default.info(`[RateLimit] ⛔ ${interaction.user.tag} (${interaction.user.id}) bloqué sur /${interaction.commandName} (${count}/${cfg.maxRequests})`);
            return;
        }
        return next();
    };
}
function isAdminOrOwner(interaction) {
    if (!interaction.inGuild() || !interaction.guild)
        return false;
    const member = interaction.member;
    if (!member || !("permissions" in member))
        return false;
    const perms = member.permissions;
    if (perms && perms.has(discord_js_1.PermissionsBitField.Flags.Administrator)) {
        return true;
    }
    return interaction.user.id === interaction.guild.ownerId;
}
//# sourceMappingURL=rateLimit.js.map