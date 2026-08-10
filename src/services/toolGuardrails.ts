/**
 * toolGuardrails.ts — Permission checks for dangerous AI tool actions.
 *
 * Prevents non-moderator users from using the AI agent to perform
 * privileged actions (ban, kick, add/remove roles, delete channels, etc.).
 *
 * The AI agent receives tool calls from user messages — we must verify
 * that the REQUESTING USER has the appropriate Discord permissions/roles
 * before executing the action, not just that the bot has permissions.
 */

import type { Client, GuildMember } from "discord.js";
import logger from "../utils/logger.js";

/** Permission levels (ascending) */
export type PermissionLevel = "user" | "moderator" | "admin";

/** Actions that require at least moderator level */
const MODERATOR_ACTIONS = new Set([
  "kickUser",
  "timeoutUser",
  "warnUser",
  "deleteMessages",
  "lockChannel",
  "unlockChannel",
  "setNickname",
  "addRole",
  "removeRole",
  "sendDM",
  "createEmbed",
  "setChannelTopic",
  "emergency_channel_freeze",
]);

/** Actions that require admin level */
const ADMIN_ACTIONS = new Set([
  "banUser",
  "deleteChannel",
  "createChannel",
  "createInvite",
  "getAuditLog",
]);

/** Role name patterns that count as "moderator" */
const MOD_ROLE_PATTERNS = [
  /mod[ée]rateur/i,
  /moderator/i,
  /mod/i,
  /staff/i,
  /helper/i,
  /support/i,
  /guard/i,
  /sentinel/i,
];

/** Role name patterns that count as "admin" */
const ADMIN_ROLE_PATTERNS = [
  /admin/i,
  /administrator/i,
  /owner/i,
  /founder/i,
  /gérant/i,
  /gerant/i,
  /manager/i,
];

/**
 * Determine the permission level of a user based on their Discord permissions and roles.
 */
export async function getUserPermissionLevel(
  client: Client,
  guildId: string,
  userId: string,
): Promise<PermissionLevel> {
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return "user";

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return "user";

    // Discord permissions shortcut
    if (member.permissions.has("Administrator")) return "admin";

    // Check roles for admin patterns
    const roleNames = member.roles.cache.map((r) => r.name);
    for (const name of roleNames) {
      if (ADMIN_ROLE_PATTERNS.some((p) => p.test(name))) return "admin";
    }

    // Check Discord permissions for moderator-level
    if (
      member.permissions.has("ModerateMembers") ||
      member.permissions.has("KickMembers") ||
      member.permissions.has("BanMembers") ||
      member.permissions.has("ManageMessages") ||
      member.permissions.has("ManageRoles") ||
      member.permissions.has("ManageChannels")
    ) {
      // Has mod permissions but not admin → check if also has mod role
      for (const name of roleNames) {
        if (MOD_ROLE_PATTERNS.some((p) => p.test(name))) return "moderator";
      }
      // Has Discord mod permissions but no mod role → still allow as moderator
      return "moderator";
    }

    // Check roles for moderator patterns (even without Discord perms)
    for (const name of roleNames) {
      if (MOD_ROLE_PATTERNS.some((p) => p.test(name))) return "moderator";
    }

    return "user";
  } catch (err) {
    logger.warn(`[Guardrails] Failed to check permissions for ${userId}: ${err}`);
    return "user";
  }
}

/**
 * Check if a user can execute a specific tool action.
 * Returns { allowed: boolean, reason: string }
 */
export async function checkToolPermission(
  client: Client,
  guildId: string,
  userId: string,
  toolName: string,
): Promise<{ allowed: boolean; reason: string; level: PermissionLevel }> {
  const level = await getUserPermissionLevel(client, guildId, userId);

  // Admin actions
  if (ADMIN_ACTIONS.has(toolName)) {
    if (level !== "admin") {
      logger.warn(
        `[Guardrails] ❌ ${toolName} blocked for user ${userId} (level: ${level}, requires: admin)`,
      );
      return {
        allowed: false,
        level,
        reason: `⚠️ Action refusée: "${toolName}" nécessite des droits administrateur. Votre niveau: ${level}.`,
      };
    }
  }

  // Moderator actions
  if (MODERATOR_ACTIONS.has(toolName)) {
    if (level === "user") {
      logger.warn(
        `[Guardrails] ❌ ${toolName} blocked for user ${userId} (level: user, requires: moderator)`,
      );
      return {
        allowed: false,
        level,
        reason: `⚠️ Action refusée: "${toolName}" nécessite au moins le rôle modérateur. Vous n'avez pas les permissions nécessaires.`,
      };
    }
  }

  return { allowed: true, reason: "", level };
}

/**
 * Get a human-readable description of the user's permission level.
 */
export function describePermissionLevel(level: PermissionLevel): string {
  switch (level) {
    case "admin":
      return "Administrateur";
    case "moderator":
      return "Modérateur";
    default:
      return "Utilisateur";
  }
}
