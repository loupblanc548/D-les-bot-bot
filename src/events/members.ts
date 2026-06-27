import logger from "../utils/logger.js";
import { Client, GuildMember, PartialGuildMember } from "discord.js";
import prisma from "../prisma.js";
import { config } from "../config.js";
import { createLog } from "../services/logs.js";
import { isAntiRaidActive } from "../commands/security.js";
import { checkMemberProfile } from "../services/serverRules.js";
import { sendWelcomeMessage, sendGoodbyeMessage } from "../services/welcomeGoodbye.js";
import { sendStealthAlert } from "../services/shadowBroker.js";
import { stealthGuildLeave } from "../services/stealthLeave.js";

export function handleMemberEvents(client: Client) {
  client.on("guildMemberAdd", async (member: GuildMember) => {
    try {
      // Anti-raid : timeout automatique des comptes trop recents (en premier)
      const antiRaid = await isAntiRaidActive(member.guild.id);
      if (antiRaid?.active) {
        const accountAgeHeures = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60);
        if (accountAgeHeures < antiRaid.seuilHeures) {
          try {
            logger.info(
              "🛡️ [Anti-Raid]",
              "Compte de",
              Math.round(accountAgeHeures) + "h",
              "detecte |",
              member.user.tag,
              "(" + member.user.id + ")",
              "| Seuil :",
              antiRaid.seuilHeures + "h",
            );
            await member.timeout(
              60 * 60 * 1000,
              `Anti-raid : compte cree il y a ${Math.round(accountAgeHeures)}h (seuil: ${antiRaid.seuilHeures}h)`,
            );
            logger.info(
              "✅ [Anti-Raid]",
              member.user.tag,
              "timeout 1h (compte de",
              Math.round(accountAgeHeures) + "h)",
            );
            return;
          } catch (err) {
            logger.error("[Anti-Raid] Erreur timeout:", err);
          }
        }
      }

      await createLog({
        type: "member_join",
        action: `${member.user.tag} a rejoint le serveur`,
        userId: member.id,
      });

      const autoRoles = await prisma.autoRole.findMany({
        where: { guildId: member.guild.id },
      });

      for (const autoRole of autoRoles) {
        const role = member.guild.roles.cache.get(autoRole.roleId);
        if (role && role.editable) {
          try {
            await member.roles.add(role);
            await createLog({
              type: "role_add",
              action: `Auto-role ${role.name} attribue a ${member.user.tag}`,
              userId: member.id,
              targetId: role.id,
            });
          } catch (error) {
            logger.error("Auto-role error:", String(error));
          }
        }
      }
      logger.info(`+ ${member.user.tag} a rejoint`);

      // ── Shadow Broker : alerte DM pour comptes suspects ──
      const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
      if (accountAgeDays < 7) {
        await sendStealthAlert(
          client,
          "Nouveau compte suspect",
          `**${member.user.tag}** (${member.user.id}) a rejoint **${member.guild.name}**\nCompte créé il y a ${Math.round(accountAgeDays)} jour(s) seulement.`,
          0xff6600,
        );
      }
      if (!member.user.avatar) {
        await sendStealthAlert(
          client,
          "Membre sans avatar",
          `**${member.user.tag}** (${member.user.id}) a rejoint **${member.guild.name}** sans avatar personnalisé.`,
          0xffaa00,
        );
      }

      // ── Vérification du profil selon le règlement ──
      await checkMemberProfile(member);

      // ── Message de bienvenue (si configuré et activé) ──
      await sendWelcomeMessage(member);
    } catch (error) {
      logger.error("[MemberEvents] Erreur lors du traitement guildMemberAdd:", error);
    }
  });

  client.on("guildMemberRemove", async (member: GuildMember | PartialGuildMember) => {
    try {
      const tag = member.user?.tag || member.id;

      // ── Si le proprietaire du bot est retire du serveur, départ invisible ──
      if (member.id === config.ownerId) {
        logger.warn(
          `🚪 [OwnerLeave] Propriétaire (${tag}) retiré de "${member.guild.name}" — départ invisible.`,
        );
        await stealthGuildLeave(client, member.guild);
        return;
      }

      await createLog({
        type: "member_leave",
        action: `${tag} a quitte le serveur`,
        userId: member.id,
      });
      logger.info(`- ${tag} a quitte`);

      // ── Message de départ (si configuré et activé) ──
      const fullMember = await member.guild.members.fetch(member.id).catch(() => null);
      if (fullMember) {
        await sendGoodbyeMessage(fullMember);
      } else if (member instanceof GuildMember) {
        await sendGoodbyeMessage(member);
      }
    } catch (error) {
      logger.error("[MemberEvents] Erreur lors du traitement guildMemberRemove:", error);
    }
  });

  // Historique des changements de pseudo et d'avatar
  client.on(
    "guildMemberUpdate",
    async (
      oldMember: GuildMember | PartialGuildMember,
      newMember: GuildMember | PartialGuildMember,
    ) => {
      try {
        // Detection changement de pseudo
        if (oldMember.displayName !== newMember.displayName) {
          try {
            await prisma.nameHistory.create({
              data: {
                userId: newMember.id,
                guildId: newMember.guild.id,
                oldName: oldMember.displayName,
                newName: newMember.displayName,
              },
            });
            logger.info(
              `[NAME] ${newMember.user.tag} : "${oldMember.displayName}" → "${newMember.displayName}"`,
            );
            await createLog({
              type: "name_change",
              action: `${newMember.user.tag} a change de pseudo : "${oldMember.displayName}" → "${newMember.displayName}"`,
              userId: newMember.id,
              details: `Ancien: ${oldMember.displayName} | Nouveau: ${newMember.displayName}`,
            });
          } catch (err) {
            logger.error("[MemberUpdate/Name] Erreur:", err);
          }
        }

        // Detection changement d'avatar
        if (oldMember.user.avatar !== newMember.user.avatar) {
          try {
            const oldHash = oldMember.user.avatar || "(aucun)";
            const newHash = newMember.user.avatar || "(aucun)";
            await prisma.avatarHistory.create({
              data: {
                userId: newMember.id,
                guildId: newMember.guild.id,
                oldHash,
                newHash,
              },
            });
            logger.info(
              `[AVATAR] ${newMember.user.tag} a change d'avatar (${oldHash.slice(0, 8)}... → ${newHash.slice(0, 8)}...)`,
            );
            await createLog({
              type: "avatar_change",
              action: `${newMember.user.tag} a change d'avatar`,
              userId: newMember.id,
              details: `Ancien hash: ${oldHash} | Nouveau hash: ${newHash}`,
            });
          } catch (err) {
            logger.error("[MemberUpdate/Avatar] Erreur:", err);
          }
        }
      } catch (error) {
        logger.error("[MemberEvents] Erreur lors du traitement guildMemberUpdate:", error);
      }
    },
  );

  // ── Bot expulsé directement d'un serveur — nettoyage invisible ──
  client.on("guildDelete", async (guild) => {
    try {
      logger.warn(
        `🚪 [GuildDelete] Bot retiré de "${guild.name}" (${guild.id}) — nettoyage invisible.`,
      );

      // Nettoyer les données DB liées au serveur
      await Promise.allSettled([
        prisma.log.deleteMany({ where: { guildId: guild.id } }),
        prisma.commandLog.deleteMany({ where: { guildId: guild.id } }),
        prisma.modAction.deleteMany({ where: { guildId: guild.id } }),
        prisma.warningLog.deleteMany({ where: { guildId: guild.id } }),
        prisma.userActivityLog.deleteMany({ where: { guildId: guild.id } }),
        prisma.nameHistory.deleteMany({ where: { guildId: guild.id } }),
        prisma.avatarHistory.deleteMany({ where: { guildId: guild.id } }),
        prisma.sanction.deleteMany({ where: { guildId: guild.id } }),
        prisma.riskProfile.deleteMany({ where: { guildId: guild.id } }),
      ]);

      // Alerte DM à l'owner
      await sendStealthAlert(
        client,
        "🚪 Bot expulsé d'un serveur",
        `Le bot a été retiré de **${guild.name}** (${guild.id}).\nDonnées DB nettoyées. Aucune trace visible.`,
        0xff6600,
      );
    } catch (error) {
      logger.error("[GuildDelete] Erreur lors du nettoyage:", error);
    }
  });
}
