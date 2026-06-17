/**
 * Whitelist Middleware
 * Provides access control based on user IDs, roles, and guild IDs
 */

import type { GuildMember, User } from "discord.js";
import logger from "../utils/logger.js";

interface WhitelistConfig {
  enabled: boolean;
  allowedUsers: string[];
  allowedRoles: string[];
  allowedGuilds: string[];
  bypassAdmins: boolean;
  adminRoles: string[];
}

interface WhitelistCheckResult {
  allowed: boolean;
  reason?: string;
}

// Global whitelist configuration
const globalWhitelist: WhitelistConfig = {
  enabled: false,
  allowedUsers: [],
  allowedRoles: [],
  allowedGuilds: [],
  bypassAdmins: true,
  adminRoles: [],
};

// Per-guild whitelist configurations
const guildWhitelists = new Map<string, WhitelistConfig>();

/**
 * Configure the global whitelist
 */
export function configureGlobalWhitelist(config: Partial<WhitelistConfig>): void {
  Object.assign(globalWhitelist, config);
  logger.info("[Whitelist] Global whitelist configuration updated");
}

/**
 * Configure whitelist for a specific guild
 */
export function configureGuildWhitelist(guildId: string, config: Partial<WhitelistConfig>): void {
  const currentConfig = guildWhitelists.get(guildId) || {
    enabled: false,
    allowedUsers: [],
    allowedRoles: [],
    allowedGuilds: [],
    bypassAdmins: true,
    adminRoles: [],
  };

  Object.assign(currentConfig, config);
  guildWhitelists.set(guildId, currentConfig);
  logger.info(`[Whitelist] Guild ${guildId} whitelist configuration updated`);
}

/**
 * Get whitelist configuration for a guild
 */
export function getGuildWhitelist(guildId: string): WhitelistConfig {
  return guildWhitelists.get(guildId) || globalWhitelist;
}

/**
 * Check if a user is whitelisted
 */
export function isUserWhitelisted(
  user: User,
  guildId?: string,
  member?: GuildMember,
): WhitelistCheckResult {
  const config = guildId ? getGuildWhitelist(guildId) : globalWhitelist;

  // If whitelist is disabled, allow everyone
  if (!config.enabled) {
    return { allowed: true };
  }

  // Check admin bypass
  if (config.bypassAdmins && member) {
    const hasAdminRole = member.roles.cache.some((role) => config.adminRoles.includes(role.id));
    if (hasAdminRole) {
      return { allowed: true };
    }
  }

  // Check user whitelist
  if (config.allowedUsers.includes(user.id)) {
    return { allowed: true };
  }

  // Check role whitelist
  if (member) {
    const hasAllowedRole = member.roles.cache.some((role) => config.allowedRoles.includes(role.id));
    if (hasAllowedRole) {
      return { allowed: true };
    }
  }

  // Check guild whitelist
  if (guildId && config.allowedGuilds.includes(guildId)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: "User is not whitelisted",
  };
}

/**
 * Check if a guild is whitelisted
 */
export function isGuildWhitelisted(guildId: string): WhitelistCheckResult {
  const config = getGuildWhitelist(guildId);

  if (!config.enabled) {
    return { allowed: true };
  }

  if (config.allowedGuilds.includes(guildId)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: "Guild is not whitelisted",
  };
}

/**
 * Add a user to the whitelist
 */
export function addUserToWhitelist(userId: string, guildId?: string): void {
  if (guildId) {
    const config = getGuildWhitelist(guildId);
    if (!config.allowedUsers.includes(userId)) {
      config.allowedUsers.push(userId);
      guildWhitelists.set(guildId, config);
      logger.info(`[Whitelist] User ${userId} added to guild ${guildId} whitelist`);
    }
  } else {
    if (!globalWhitelist.allowedUsers.includes(userId)) {
      globalWhitelist.allowedUsers.push(userId);
      logger.info(`[Whitelist] User ${userId} added to global whitelist`);
    }
  }
}

/**
 * Remove a user from the whitelist
 */
export function removeUserFromWhitelist(userId: string, guildId?: string): void {
  if (guildId) {
    const config = getGuildWhitelist(guildId);
    config.allowedUsers = config.allowedUsers.filter((id) => id !== userId);
    guildWhitelists.set(guildId, config);
    logger.info(`[Whitelist] User ${userId} removed from guild ${guildId} whitelist`);
  } else {
    globalWhitelist.allowedUsers = globalWhitelist.allowedUsers.filter((id) => id !== userId);
    logger.info(`[Whitelist] User ${userId} removed from global whitelist`);
  }
}

/**
 * Add a role to the whitelist
 */
export function addRoleToWhitelist(roleId: string, guildId?: string): void {
  if (guildId) {
    const config = getGuildWhitelist(guildId);
    if (!config.allowedRoles.includes(roleId)) {
      config.allowedRoles.push(roleId);
      guildWhitelists.set(guildId, config);
      logger.info(`[Whitelist] Role ${roleId} added to guild ${guildId} whitelist`);
    }
  } else {
    if (!globalWhitelist.allowedRoles.includes(roleId)) {
      globalWhitelist.allowedRoles.push(roleId);
      logger.info(`[Whitelist] Role ${roleId} added to global whitelist`);
    }
  }
}

/**
 * Remove a role from the whitelist
 */
export function removeRoleFromWhitelist(roleId: string, guildId?: string): void {
  if (guildId) {
    const config = getGuildWhitelist(guildId);
    config.allowedRoles = config.allowedRoles.filter((id) => id !== roleId);
    guildWhitelists.set(guildId, config);
    logger.info(`[Whitelist] Role ${roleId} removed from guild ${guildId} whitelist`);
  } else {
    globalWhitelist.allowedRoles = globalWhitelist.allowedRoles.filter((id) => id !== roleId);
    logger.info(`[Whitelist] Role ${roleId} removed from global whitelist`);
  }
}

/**
 * Add a guild to the whitelist
 */
export function addGuildToWhitelist(guildId: string): void {
  if (!globalWhitelist.allowedGuilds.includes(guildId)) {
    globalWhitelist.allowedGuilds.push(guildId);
    logger.info(`[Whitelist] Guild ${guildId} added to global whitelist`);
  }
}

/**
 * Remove a guild from the whitelist
 */
export function removeGuildFromWhitelist(guildId: string): void {
  globalWhitelist.allowedGuilds = globalWhitelist.allowedGuilds.filter((id) => id !== guildId);
  logger.info(`[Whitelist] Guild ${guildId} removed from global whitelist`);
}

/**
 * Enable whitelist for a guild
 */
export function enableGuildWhitelist(guildId: string): void {
  const config = getGuildWhitelist(guildId);
  config.enabled = true;
  guildWhitelists.set(guildId, config);
  logger.info(`[Whitelist] Whitelist enabled for guild ${guildId}`);
}

/**
 * Disable whitelist for a guild
 */
export function disableGuildWhitelist(guildId: string): void {
  const config = getGuildWhitelist(guildId);
  config.enabled = false;
  guildWhitelists.set(guildId, config);
  logger.info(`[Whitelist] Whitelist disabled for guild ${guildId}`);
}

/**
 * Get whitelist statistics
 */
export function getWhitelistStats(): {
  globalEnabled: boolean;
  globalUsers: number;
  globalRoles: number;
  globalGuilds: number;
  guildConfigs: number;
} {
  return {
    globalEnabled: globalWhitelist.enabled,
    globalUsers: globalWhitelist.allowedUsers.length,
    globalRoles: globalWhitelist.allowedRoles.length,
    globalGuilds: globalWhitelist.allowedGuilds.length,
    guildConfigs: guildWhitelists.size,
  };
}
