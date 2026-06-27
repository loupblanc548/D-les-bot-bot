import {
  MessageFlags,
  CommandInteraction,
  GuildMember,
  PermissionFlagsBits,
  Role,
} from "discord.js";
import { config } from "../config.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";

export enum PermissionLevel {
  EVERYONE = 0,
  MODERATOR = 1,
  ADMIN = 2,
}

// Permissions Discord minimales requises pour être modérateur
const MOD_REQUIRED_PERMISSIONS = [
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.KickMembers,
];

/**
 * Vérifie qu'un rôle a les permissions Discord minimales pour être modérateur.
 * Retourne la liste des permissions manquantes (vide si tout est OK).
 */
export function checkRolePermissions(role: Role): string[] {
  const missing: string[] = [];
  for (const perm of MOD_REQUIRED_PERMISSIONS) {
    if (!role.permissions.has(perm)) {
      const label =
        perm === PermissionFlagsBits.ModerateMembers
          ? "Moderer les membres (timeout)"
          : perm === PermissionFlagsBits.ManageMessages
            ? "Gérer les messages"
            : perm === PermissionFlagsBits.KickMembers
              ? "Expulser des membres"
              : String(perm);
      missing.push(label);
    }
  }
  return missing;
}

/**
 * Valide au démarrage que les rôles modérateurs configurés ont les bonnes permissions.
 * Log un warning pour chaque permission manquante.
 */
export async function validateModeratorRoles(guild: {
  id: string;
  roles: { cache: Map<string, Role> };
}): Promise<void> {
  const modRoleIds = config.modRoles;
  const guildConfig = await prisma.guildConfig.findUnique({
    where: { guildId: guild.id },
  });
  if (guildConfig?.modRoleId) {
    modRoleIds.push(guildConfig.modRoleId);
  }

  for (const roleId of modRoleIds) {
    const role = guild.roles.cache.get(roleId);
    if (!role) {
      logger.warn(`[Permissions] Rôle modérateur ${roleId} introuvable sur le serveur ${guild.id}`);
      continue;
    }
    const missing = checkRolePermissions(role);
    if (missing.length > 0) {
      logger.warn(`[Permissions] Rôle "${role.name}" (${roleId}) manque: ${missing.join(", ")}`);
    } else {
      logger.info(`[Permissions] Rôle "${role.name}" (${roleId}) validé comme modérateur ✅`);
    }
  }
}

export async function getPermissionLevel(member: GuildMember): Promise<PermissionLevel> {
  // Admin Discord = accès total
  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    return PermissionLevel.ADMIN;
  }

  const guildConfig = await prisma.guildConfig.findUnique({
    where: { guildId: member.guild.id },
  });

  // Vérifier rôle admin (DB ou env)
  if (
    (guildConfig?.adminRoleId && member.roles.cache.has(guildConfig.adminRoleId)) ||
    config.adminRoles.some((r) => member.roles.cache.has(r))
  ) {
    return PermissionLevel.ADMIN;
  }

  // Vérifier rôle modérateur (DB ou env)
  // Double vérification: le membre a le rôle ET le rôle a les permissions Discord requises
  const modRoleIds = [
    ...(guildConfig?.modRoleId ? [guildConfig.modRoleId] : []),
    ...config.modRoles,
  ];

  for (const roleId of modRoleIds) {
    if (!member.roles.cache.has(roleId)) continue;

    // Vérifier que le rôle a les permissions Discord minimales
    const role = member.guild.roles.cache.get(roleId);
    if (!role) continue;

    const missing = checkRolePermissions(role);
    if (missing.length > 0) {
      // Le rôle existe mais manque de permissions — on log mais on accorde quand même
      // le niveau modérateur (le rôle a été configuré explicitement)
      logger.debug(
        `[Permissions] Rôle modérateur "${role.name}" manque: ${missing.join(", ")} — accès accordé par configuration`,
      );
    }
    return PermissionLevel.MODERATOR;
  }

  // Fallback: vérifier les permissions Discord directement
  // Si un membre a les permissions modérateur sans avoir le rôle, on lui accorde le niveau
  if (member.permissions.has(MOD_REQUIRED_PERMISSIONS)) {
    return PermissionLevel.MODERATOR;
  }

  return PermissionLevel.EVERYONE;
}

export async function requireAdmin(interaction: CommandInteraction): Promise<boolean> {
  const member = interaction.member as GuildMember;
  if (!member) {
    await interaction.reply({
      content: "❌ Cette commande doit etre utilisee sur un serveur.",
      flags: [MessageFlags.Ephemeral],
    });
    return false;
  }

  const level = await getPermissionLevel(member);
  if (level < PermissionLevel.ADMIN) {
    await interaction.reply({
      content: "❌ Cette commande est reservee aux administrateurs.",
      flags: [MessageFlags.Ephemeral],
    });
    return false;
  }

  return true;
}

export async function requireMod(interaction: CommandInteraction): Promise<boolean> {
  const member = interaction.member as GuildMember;
  if (!member) {
    await interaction.reply({
      content: "❌ Cette commande doit etre utilisee sur un serveur.",
      flags: [MessageFlags.Ephemeral],
    });
    return false;
  }

  const level = await getPermissionLevel(member);
  if (level < PermissionLevel.MODERATOR) {
    await interaction.reply({
      content: "❌ Cette commande est reservee aux moderateurs et administrateurs.",
      flags: [MessageFlags.Ephemeral],
    });
    return false;
  }

  return true;
}
