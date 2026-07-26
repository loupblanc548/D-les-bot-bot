/**
 * permissions.ts — Helper de vérification de permissions Discord
 *
 * Fournit des fonctions réutilisables pour vérifier les permissions
 * d'un membre sur un serveur ou un salon spécifique.
 */

import { PermissionsBitField, type GuildMember, type TextChannel, type PermissionResolvable } from "discord.js";

/** Vérifie si un membre a une permission spécifique */
export function hasPermission(member: GuildMember, permission: PermissionResolvable): boolean {
  if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
  return member.permissions.has(permission);
}

/** Vérifie si un membre peut gérer les messages */
export function canManageMessages(member: GuildMember): boolean {
  return hasPermission(member, PermissionsBitField.Flags.ManageMessages);
}

/** Vérifie si un membre peut modérer (ban, kick, mute) */
export function canModerate(member: GuildMember): boolean {
  return (
    hasPermission(member, PermissionsBitField.Flags.Administrator) ||
    (hasPermission(member, PermissionsBitField.Flags.BanMembers) &&
      hasPermission(member, PermissionsBitField.Flags.KickMembers) &&
      hasPermission(member, PermissionsBitField.Flags.ModerateMembers))
  );
}

/** Vérifie si un membre peut gérer le serveur */
export function canManageGuild(member: GuildMember): boolean {
  return hasPermission(member, PermissionsBitField.Flags.ManageGuild);
}

/** Vérifie si un membre peut gérer les rôles */
export function canManageRoles(member: GuildMember): boolean {
  return hasPermission(member, PermissionsBitField.Flags.ManageRoles);
}

/** Vérifie si un membre peut voir un salon spécifique */
export function canViewChannel(member: GuildMember, channel: TextChannel): boolean {
  return channel.permissionsFor(member)?.has(PermissionsBitField.Flags.ViewChannel) ?? false;
}

/** Vérifie si un membre peut envoyer des messages dans un salon */
export function canSendInChannel(member: GuildMember, channel: TextChannel): boolean {
  return (
    channel.permissionsFor(member)?.has(PermissionsBitField.Flags.SendMessages) ?? false
  );
}

/** Vérifie si un membre est admin ou propriétaire du serveur */
export function isAdminOrOwner(member: GuildMember): boolean {
  if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
  return member.id === member.guild.ownerId;
}

/** Retourne la liste des permissions manquantes pour une action */
export function getMissingPermissions(member: GuildMember, required: PermissionResolvable[]): string[] {
  const missing: string[] = [];
  for (const perm of required) {
    if (!member.permissions.has(perm)) {
      missing.push(PermissionsBitField.resolve(perm).toString());
    }
  }
  return missing;
}
