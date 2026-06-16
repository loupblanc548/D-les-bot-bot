import {
  MessageFlags,
  CommandInteraction,
  GuildMember,
  PermissionFlagsBits,
} from "discord.js";
import { config } from "../config";
import prisma from "../prisma";


export enum PermissionLevel {
  EVERYONE = 0,
  MODERATOR = 1,
  ADMIN = 2,
}

export async function getPermissionLevel(
  member: GuildMember
): Promise<PermissionLevel> {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    return PermissionLevel.ADMIN;
  }

  const guildConfig = await prisma.guildConfig.findUnique({
    where: { guildId: member.guild.id },
  });

  if ((guildConfig?.adminRoleId && member.roles.cache.has(guildConfig.adminRoleId)) || config.adminRoles.some(r => member.roles.cache.has(r))) {
    return PermissionLevel.ADMIN;
  }

  if ((guildConfig?.modRoleId && member.roles.cache.has(guildConfig.modRoleId)) || config.modRoles.some(r => member.roles.cache.has(r))) {
    return PermissionLevel.MODERATOR;
  }

  return PermissionLevel.EVERYONE;
}

export async function requireAdmin(
  interaction: CommandInteraction
): Promise<boolean> {
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

export async function requireMod(
  interaction: CommandInteraction
): Promise<boolean> {
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
