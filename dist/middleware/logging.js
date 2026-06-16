"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLoggingMiddleware = createLoggingMiddleware;
const logger_1 = __importDefault(require("../utils/logger"));
/**
 * Middleware de logging pour les commandes slash.
 * - Log l'invocation (commande, utilisateur, guilde).
 * - Mesure la latence d'exécution.
 * - Log succès/échec via les méthodes Winston (Sentry est câblé sur `logger.error`).
 */
function createLoggingMiddleware() {
    return async function logging(interaction, _client, next) {
        if (!interaction.isChatInputCommand()) {
            return next();
        }
        const start = Date.now();
        const cmd = interaction.commandName;
        const userTag = interaction.user.tag;
        const userId = interaction.user.id;
        const guild = interaction.guild?.name ?? "DM";
        const guildId = interaction.guildId ?? "DM";
        logger_1.default.info(`[Cmd] ▶ /${cmd} par ${userTag} (${userId}) @ ${guild} (${guildId})`);
        try {
            await next();
            const elapsed = Date.now() - start;
            logger_1.default.info(`[Cmd] ✓ /${cmd} OK en ${elapsed}ms`);
        }
        catch (err) {
            const elapsed = Date.now() - start;
            const msg = err instanceof Error ? err.message : String(err);
            logger_1.default.error(`[Cmd] ✗ /${cmd} FAILED en ${elapsed}ms: ${msg}`);
            throw err; // on remonte l'erreur au gestionnaire upstream (Sentry)
        }
    };
}
//# sourceMappingURL=logging.js.map