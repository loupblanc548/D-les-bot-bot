import { MessageReaction, User } from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";

export async function handleReactionRoleAdd(reaction: MessageReaction, user: User): Promise<void> {
  if (user.bot) return;

  const message = reaction.message;
  if (!message.guild) return;

  const rrMsg = await prisma.reactionRoleMessage.findFirst({
    where: { guildId: message.guild.id, messageId: message.id },
    include: { mappings: true },
  });

  if (!rrMsg) return;

  const emojiId = reaction.emoji.id
    ? `<${reaction.emoji.animated ? "a" : ""}:${reaction.emoji.name}:${reaction.emoji.id}>`
    : reaction.emoji.name || "";

  const mapping = rrMsg.mappings.find(
    (m) => m.emoji === emojiId || m.emoji === reaction.emoji.name,
  );
  if (!mapping) return;

  const member = await message.guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  const role = message.guild.roles.cache.get(mapping.roleId);
  if (!role) return;

  try {
    await member.roles.add(role, "Rôles par réaction");
    logger.info(`[ReactionRoles] + ${user.tag} a reçu le rôle ${role.name} via réaction`);
  } catch (error) {
    logger.error(
      `[ReactionRoles] Impossible d'attribuer le rôle ${role.name} à ${user.tag}:`,
      error,
    );
  }
}

export async function handleReactionRoleRemove(
  reaction: MessageReaction,
  user: User,
): Promise<void> {
  if (user.bot) return;

  const message = reaction.message;
  if (!message.guild) return;

  const rrMsg = await prisma.reactionRoleMessage.findFirst({
    where: { guildId: message.guild.id, messageId: message.id },
    include: { mappings: true },
  });

  if (!rrMsg) return;

  const emojiId = reaction.emoji.id
    ? `<${reaction.emoji.animated ? "a" : ""}:${reaction.emoji.name}:${reaction.emoji.id}>`
    : reaction.emoji.name || "";

  const mapping = rrMsg.mappings.find(
    (m) => m.emoji === emojiId || m.emoji === reaction.emoji.name,
  );
  if (!mapping) return;

  const member = await message.guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  const role = message.guild.roles.cache.get(mapping.roleId);
  if (!role) return;

  try {
    await member.roles.remove(role, "Rôles par réaction (retrait)");
    logger.info(
      `[ReactionRoles] - ${user.tag} a perdu le rôle ${role.name} via retrait de réaction`,
    );
  } catch (error) {
    logger.error(
      `[ReactionRoles] Impossible de retirer le rôle ${role.name} à ${user.tag}:`,
      error,
    );
  }
}
