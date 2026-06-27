/**
 * permissionGuard.ts — Middleware de vérification des permissions
 *
 * Vérifie que l'utilisateur a le grade minimum requis pour les commandes dangereuses.
 * Fonctionne avec le système existant PermissionLevel (EVERYONE, MODERATOR, ADMIN).
 *
 * Si la commande n'est pas dans la map, elle est accessible à tous.
 */

import { MessageFlags, GuildMember } from "discord.js";
import { getPermissionLevel, PermissionLevel } from "../services/permissions.js";
import logger from "../utils/logger.js";
import type { Middleware } from "./compose.js";

// ─── Classification des commandes dangereuses ───────────────────────────────

const DANGEROUS_COMMANDS: Record<string, PermissionLevel> = {
  // Admin uniquement
  "purge-content": PermissionLevel.ADMIN,
  "clean-duplicates": PermissionLevel.ADMIN,
  "channel-routing": PermissionLevel.ADMIN,
  sources: PermissionLevel.ADMIN,
  "permission-audit": PermissionLevel.ADMIN,
  "security-audit": PermissionLevel.ADMIN,
  antiraid: PermissionLevel.ADMIN,
  verif: PermissionLevel.ADMIN,
  blacklist: PermissionLevel.ADMIN,
  "rss-test": PermissionLevel.ADMIN,
  "retro-config": PermissionLevel.ADMIN,
  "cooldown-config": PermissionLevel.ADMIN,
  aichat: PermissionLevel.ADMIN,
  "welcome-config": PermissionLevel.ADMIN,
  "reaction-roles": PermissionLevel.ADMIN,

  // Modérateur+
  nuke: PermissionLevel.MODERATOR,
  lockdown: PermissionLevel.MODERATOR,
  slowmode: PermissionLevel.MODERATOR,
  warn: PermissionLevel.MODERATOR,
  mute: PermissionLevel.MODERATOR,
  unmute: PermissionLevel.MODERATOR,
  clear: PermissionLevel.MODERATOR,
  "purge-user": PermissionLevel.MODERATOR,
  namehistory: PermissionLevel.MODERATOR,
  avatarhistory: PermissionLevel.MODERATOR,
  linkcheck: PermissionLevel.MODERATOR,
  massmove: PermissionLevel.MODERATOR,
  disconnect: PermissionLevel.MODERATOR,
  userinfo: PermissionLevel.MODERATOR,
  security: PermissionLevel.MODERATOR,
  twitch: PermissionLevel.MODERATOR,
};

const LEVEL_LABELS: Record<PermissionLevel, string> = {
  [PermissionLevel.EVERYONE]: "tout le monde",
  [PermissionLevel.MODERATOR]: "modérateurs et administrateurs",
  [PermissionLevel.ADMIN]: "administrateurs",
};

// ─── Middleware ──────────────────────────────────────────────────────────────

export function createPermissionGuardMiddleware(): Middleware {
  return async (interaction, _client, next) => {
    if (!interaction.isChatInputCommand?.()) {
      return next();
    }

    const commandName = interaction.commandName;
    const requiredLevel = DANGEROUS_COMMANDS[commandName];

    // Commande non listée → pas de restriction
    if (requiredLevel === undefined) {
      return next();
    }

    const member = interaction.member as GuildMember | undefined;
    if (!member) {
      await interaction.reply({
        content: "❌ Cette commande doit être utilisée sur un serveur.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const userLevel = await getPermissionLevel(member);

    if (userLevel < requiredLevel) {
      logger.warn(
        `[PermissionGuard] ${interaction.user.tag} a tenté d'utiliser /${commandName} (niveau ${userLevel} < requis ${requiredLevel})`,
      );
      await interaction.reply({
        content: `❌ Cette commande est réservée aux **${LEVEL_LABELS[requiredLevel]}**.\nVotre grade actuel est insuffisant.`,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    return next();
  };
}
