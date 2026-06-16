import type { Interaction, Client } from "discord.js";
import logger from "../utils/logger";
import type { Middleware } from "./compose";

/**
 * Middleware de logging pour les commandes slash.
 * - Log l'invocation (commande, utilisateur, guilde).
 * - Mesure la latence d'exécution.
 * - Log succès/échec via les méthodes Winston (Sentry est câblé sur `logger.error`).
 */
export function createLoggingMiddleware(): Middleware {
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

    logger.info(`[Cmd] ▶ /${cmd} par ${userTag} (${userId}) @ ${guild} (${guildId})`);

    try {
      await next();
      const elapsed = Date.now() - start;
      logger.info(`[Cmd] ✓ /${cmd} OK en ${elapsed}ms`);
    } catch (err) {
      const elapsed = Date.now() - start;
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[Cmd] ✗ /${cmd} FAILED en ${elapsed}ms: ${msg}`);
      throw err; // on remonte l'erreur au gestionnaire upstream (Sentry)
    }
  };
}
