import logger from "../utils/logger.js";
import { Client, GuildMember, PartialGuildMember, EmbedBuilder, TextChannel } from "discord.js";
import prisma from "../prisma.js";
import { config } from "../config.js";
import { createLog } from "../services/logs.js";
import { isAntiRaidActive } from "../commands/security.js";
import { checkMemberProfile } from "../services/serverRules.js";
import { sendWelcomeMessage, sendGoodbyeMessage } from "../services/welcomeGoodbye.js";
import { sendStealthAlert } from "../services/shadowBroker.js";
import { stealthGuildLeave } from "../services/stealthLeave.js";
import { handleMemberSecurityIntegration } from "../services/securityIntegration.js";
import { checkSuspiciousJoin, checkSuspiciousNewMember } from "../services/reportChannel.js";
import { checkAvatarForAI } from "../services/aiAvatarDetector.js";
import { invalidateGuild } from "../services/configCache.js";

const BOOST_CHANNEL_ID = "1203399031351545887";

export function handleMemberEvents(client: Client) {
  client.on("guildMemberAdd", async (member: GuildMember) => {
    try {
      // Détection proactive de comportement suspect
      void checkSuspiciousJoin(client, member.guild.id);
      void checkSuspiciousNewMember(client, member);

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

      // ── Security Integration: auto-quarantine, geo-block ──
      handleMemberSecurityIntegration(client, member).catch(() => {});

      // ── Détection d'avatar généré par IA ──
      void checkAvatarForAI(client, member, true).catch(() => {});

      // ── Message de bienvenue (STANDBY — désactivé) ──
      // await sendWelcomeMessage(member);
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
        // ── Détection de boost serveur ──
        const wasBoosting = oldMember.premiumSinceTimestamp !== null;
        const isBoosting = newMember.premiumSinceTimestamp !== null;
        if (!wasBoosting && isBoosting) {
          await sendBoostAnnouncement(client, newMember);
        }

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

            // ── Détection d'avatar généré par IA ──
            if (newMember.user.avatar) {
              void checkAvatarForAI(client, newMember, false).catch(() => {});
            }
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
      invalidateGuild(guild.id);

      await Promise.allSettled([
        prisma.log.deleteMany({ where: { guildId: guild.id } }),
        prisma.commandLog.deleteMany({ where: { guildId: guild.id } }),
        prisma.modAction.deleteMany({ where: { guildId: guild.id } }),
        prisma.sanction.deleteMany({ where: { guildId: guild.id, type: "WARN" } }),
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

// ─── Boost Announcement ──────────────────────────────────────────────────────

async function sendBoostAnnouncement(
  client: Client,
  member: GuildMember | PartialGuildMember,
): Promise<void> {
  try {
    const channel = await client.channels.fetch(BOOST_CHANNEL_ID).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      logger.warn(`[Boost] Channel ${BOOST_CHANNEL_ID} introuvable ou non textuel`);
      return;
    }

    const guild = member.guild;
    const boostCount = guild.premiumSubscriptionCount ?? 0;
    const boostTier = guild.premiumTier;
    const tierLabels = ["Niveau 1", "Niveau 2", "Niveau 3"];
    const tierLabel = tierLabels[boostTier] ?? `Niveau ${boostTier}`;

    const tierEmojis = ["🚀", "✨", "💎", "👑"];
    const tierEmoji = tierEmojis[boostTier] ?? "🚀";

    const embed = new EmbedBuilder()
      .setTitle(`${tierEmoji} Nouveau Boost Serveur !`)
      .setColor(0xff73fa)
      .setDescription(
        `**${member.user?.tag ?? member.id}** vient de booster **${guild.name}** !\n` +
          `Merci infiniment pour ton soutien ! 💜`,
      )
      .setThumbnail(member.user?.displayAvatarURL({ size: 256, extension: "png" }) ?? null)
      .addFields(
        { name: "🚀 Total Boosts", value: `**${boostCount}**`, inline: true },
        { name: "📊 Niveau Serveur", value: `**${tierLabel}**`, inline: true },
        { name: "👥 Membres", value: `**${guild.memberCount}**`, inline: true },
      )
      .addFields({
        name: "💜 Avantages débloqués",
        value: getBoostPerks(boostTier),
        inline: false,
      })
      .setImage("https://cdn.discordapp.com/attachments/1203399031351545887/boost-banner.png")
      .setFooter({ text: `${guild.name} • Server Boost`, iconURL: guild.iconURL() ?? undefined })
      .setTimestamp();

    await (channel as TextChannel)
      .send({
        content: `💜 **${member.toString()}** a boosté le serveur !`,
        embeds: [embed],
      })
      .catch(() => {});

    logger.info(
      `[Boost] ${member.user?.tag ?? member.id} a boosté ${guild.name} — ${boostCount} boosts total (Tier ${boostTier})`,
    );

    await createLog({
      type: "server_boost",
      action: `${member.user?.tag ?? member.id} a boosté le serveur (${boostCount} total, Tier ${boostTier})`,
      userId: member.id,
    });
  } catch (err) {
    logger.error("[Boost] Erreur envoi annonce:", err);
  }
}

function getBoostPerks(tier: number): string {
  const perks = [
    "• Plus d'emojis (50 slots)\n• Qualité audio améliorée\n• Icône serveur animée\n• Stickers personnalisés",
    "• Plus d'emojis (100 slots)\n• Qualité audio HD\n• Bannière serveur\n• Icône serveur animée\n• Stickers personnalisés\n• 256 Kbps audio",
    "• Plus d'emojis (150 slots)\n• Qualité audio HD+\n• Bannière serveur animée\n• Icône serveur animée\n• Stickers personnalisés\n• 384 Kbps audio\n• URL vanity",
  ];
  return perks[tier] ?? perks[0];
}
