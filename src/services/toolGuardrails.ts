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

import type { Client } from "discord.js";
import logger from "../utils/logger.js";
import { getPermissionLevel, PermissionLevel as StaffRank } from "./permissions.js";

/** Permission levels (ascending) */
export type PermissionLevel = "user" | "moderator" | "admin";

/** Phrase dite telle quelle quand le demandeur n'a pas le grade. */
export const GRADE_REQUIRED_REPLY = "Tu n'as pas le grade requis pour ça.";

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
  "pinMessage",
]);

/** Discord actions the requester's own permissions authorize. No second DM. */
const GUILD_ACTION_TOOLS = new Set([
  ...MODERATOR_ACTIONS,
  "banUser",
  "deleteChannel",
  "createChannel",
  "createInvite",
  "pinMessage",
]);
GUILD_ACTION_TOOLS.delete("sendDM");

export function isGuildActionTool(toolName: string): boolean {
  return GUILD_ACTION_TOOLS.has(toolName);
}

/** Actions that require admin level */
const ADMIN_ACTIONS = new Set([
  "banUser",
  "deleteChannel",
  "createChannel",
  "createInvite",
  "setup_basic_server",
  "getAuditLog",
  "ssh_command",
  "run_terminal",
]);

/**
 * Niveau réel du demandeur. Un droit Discord isolé (gérer les messages)
 * ne compte pas : il faut le rôle Modérateur, un rôle au-dessus, ou admin.
 */
export async function getUserPermissionLevel(
  client: Client,
  guildId: string,
  userId: string,
): Promise<PermissionLevel> {
  try {
    const guild =
      client.guilds.cache.get(guildId) ?? (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) return "user";

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return "user";

    if (guild.roles.cache.size <= 1) {
      await guild.roles.fetch().catch(() => null);
    }

    const level = await getPermissionLevel(member);
    if (level >= StaffRank.ADMIN) return "admin";
    if (level >= StaffRank.MODERATOR) return "moderator";
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
        reason: GRADE_REQUIRED_REPLY,
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
        reason: GRADE_REQUIRED_REPLY,
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
