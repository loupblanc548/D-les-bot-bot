import {
  Client,
  MessageReaction,
  User,
  Role,
  PartialMessageReaction,
  PartialUser,
} from "discord.js";
import logger from "../utils/logger.js";
import prisma from "../prisma.js";

const ROLE_EMOJI_MAP: Record<string, string> = {
  "🎮": "Steam/Epic",
  "🕹️": "PlayStation",
  "🎯": "Xbox",
  "🎲": "Nintendo",
  "🔫": "Fortnite",
};

export function startReactionRoles(client: Client): void {
  client.on(
    "messageReactionAdd",
    async (reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) => {
      try {
        if (user.bot) return;
        if (reaction.partial) await reaction.fetch();

        const emoji = reaction.emoji.name;
        if (!emoji || !(emoji in ROLE_EMOJI_MAP)) return;

        const message = reaction.message;
        const guild = message.guild;
        if (!guild) return;

        const member = await guild.members.fetch(user.id).catch(() => null);
        if (!member) return;

        const roleName = ROLE_EMOJI_MAP[emoji];
        const role = guild.roles.cache.find(
          (r) => r.name.toLowerCase() === roleName.toLowerCase(),
        ) as Role | undefined;

        if (role) {
          await member.roles.add(role);
          logger.info(`[ReactionRoles] ${user.tag} → rôle ${role.name}`);

          try {
            await prisma.userPlatformPreference.upsert({
              where: { userId_platform: { userId: user.id, platform: "all" as any } },
              create: { userId: user.id, guildId: guild.id, platform: "all" as any, notify: true },
              update: { notify: true },
            });
          } catch {}
        }
      } catch (err) {
        logger.error(
          `[ReactionRoles] Erreur add: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  );

  client.on(
    "messageReactionRemove",
    async (reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) => {
      try {
        if (user.bot) return;
        if (reaction.partial) await reaction.fetch();

        const emoji = reaction.emoji.name;
        if (!emoji || !(emoji in ROLE_EMOJI_MAP)) return;

        const guild = reaction.message.guild;
        if (!guild) return;

        const member = await guild.members.fetch(user.id).catch(() => null);
        if (!member) return;

        const roleName = ROLE_EMOJI_MAP[emoji];
        const role = guild.roles.cache.find(
          (r) => r.name.toLowerCase() === roleName.toLowerCase(),
        ) as Role | undefined;

        if (role) {
          await member.roles.remove(role);
          logger.info(`[ReactionRoles] ${user.tag} ← rôle ${role.name} retiré`);
        }
      } catch (err) {
        logger.error(
          `[ReactionRoles] Erreur remove: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  );

  logger.info("[ReactionRoles] Système de rôles par réaction activé");
}
