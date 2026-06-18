import {
  MessageFlags,
  PermissionsBitField,
  type GuildMember,
  type Interaction,
  type Client,
} from "discord.js";
import { incrementCache, setCacheExpire, getCacheTTL } from "../utils/redis.js";
import { config } from "../config.js";
import logger from "../utils/logger.js";
import type { Middleware } from "./compose.js";

export interface RateLimitConfig {
  /** Fenêtre de temps (en secondes) pendant laquelle les requêtes sont comptées. */
  windowSeconds: number;
  /** Nombre maximum de requêtes autorisées dans la fenêtre. */
  maxRequests: number;
  /** Si vrai, les administrateurs et le propriétaire du bot ne sont pas limités. */
  bypassAdmins: boolean;
}

export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
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
export function createRateLimitMiddleware(
  override: Partial<RateLimitConfig> = {}
): Middleware {
  const cfg: RateLimitConfig = {
    ...DEFAULT_RATE_LIMIT,
    ...config.rateLimit,
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

    let count: number | null = null;
    try {
      count = await incrementCache(key);
      if (count === 1 || count === null) {
        await setCacheExpire(key, cfg.windowSeconds);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`[RateLimit] Redis indisponible, on laisse passer : ${msg}`);
      return next();
    }

    if (count === null) {
      return next();
    }

    if (count > cfg.maxRequests) {
      const ttl = await getCacheTTL(key);
      const remaining = Math.max(1, ttl ?? cfg.windowSeconds);
      const content = `⏱️ Trop de requêtes. Réessaie dans **${remaining}s**.`;

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({ content, flags: [MessageFlags.Ephemeral] });
        } else {
          await interaction.reply({ content, flags: [MessageFlags.Ephemeral] });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(`[RateLimit] Impossible de prévenir l'utilisateur : ${msg}`);
      }

      logger.info(
        `[RateLimit] ⛔ ${interaction.user.tag} (${interaction.user.id}) bloqué sur /${interaction.commandName} (${count}/${cfg.maxRequests})`
      );
      return;
    }

    return next();
  };
}

function isAdminOrOwner(interaction: Interaction): boolean {
  if (!interaction.inGuild() || !interaction.guild) return false;
  const member = interaction.member as GuildMember | null;
  if (!member || !("permissions" in member)) return false;
  const perms = (member as GuildMember).permissions;
  if (perms && perms.has(PermissionsBitField.Flags.Administrator)) {
    return true;
  }
  return interaction.user.id === interaction.guild.ownerId;
}
