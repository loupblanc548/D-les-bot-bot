/**
 * inviteTracker.ts — Suit qui invite qui sur le serveur (EVENT-15)
 *
 * Enregistre l'inviteur quand un nouveau membre rejoint.
 * Détecte les raids organisés (même inviteur, comptes récents).
 */

import { Client, EmbedBuilder, TextChannel } from "discord.js";
import logger from "../utils/logger.js";
import { config } from "../config.js";
import { recordSecurityEvent } from "../services/risk-engine.js";
import { createLog } from "../services/logs.js";

const RAID_THRESHOLD = 5; // 5 joins depuis même inviteur en 1h = suspect
const joinTracker = new Map<string, { count: number; firstJoin: number }>();

export function handleInviteTracker(client: Client): void {
  client.on("guildMemberAdd", async (member) => {
    try {
      const guild = member.guild;

      // Récupérer les invites du serveur
      const invites = await guild.invites.fetch().catch(() => null);
      if (!invites) return;

      // Trouver l'invite qui a gagné un usage
      // (comparaison avec cache précédent — simplifié: on cherche l'invite la plus récente)
      const cachedInvites = (client as any).inviteCache?.get(guild.id) as
        | Map<string, number>
        | undefined;

      let inviterId: string | null = null;

      if (cachedInvites) {
        for (const [code, invite] of invites) {
          const cachedUses = cachedInvites.get(code) || 0;
          if ((invite.uses ?? 0) > cachedUses) {
            inviterId = invite.inviter?.id || null;
            break;
          }
        }
      }

      // Mettre à jour le cache
      if (!(client as any).inviteCache) (client as any).inviteCache = new Map();
      const newCache = new Map<string, number>();
      for (const [code, invite] of invites) {
        newCache.set(code, invite.uses ?? 0);
      }
      (client as any).inviteCache.set(guild.id, newCache);

      if (inviterId) {
        // Enregistrer en DB via Log
        try {
          await createLog({
            type: "invite",
            action: `${member.user.tag} invité par ${inviterId}`,
            userId: inviterId,
            targetId: member.id,
          });
        } catch {
          // Fallback silencieux
        }

        // Tracker pour détection de raid
        const now = Date.now();
        const tracker = joinTracker.get(`${guild.id}_${inviterId}`);
        if (!tracker || now - tracker.firstJoin > 3600000) {
          joinTracker.set(`${guild.id}_${inviterId}`, { count: 1, firstJoin: now });
        } else {
          tracker.count++;
          if (tracker.count >= RAID_THRESHOLD) {
            logger.warn(
              `[InviteTracker] Raid suspect: ${tracker.count} joins depuis ${inviterId} en < 1h`,
            );
            await recordSecurityEvent(inviterId, guild.id, "ANTI_RAID").catch(() => {});
            await createLog({
              type: "security",
              action: `Raid suspect: ${tracker.count} joins via ${inviterId}`,
              userId: inviterId,
            });

            // Alerte dans le salon de log
            const logChannelId = config.logChannel;
            if (logChannelId) {
              const channel = await client.channels.fetch(logChannelId);
              if (channel?.isTextBased()) {
                const embed = new EmbedBuilder()
                  .setTitle("🚨 Raid Suspect")
                  .setColor(0xff3344)
                  .setDescription(
                    `**${tracker.count}** nouveaux membres invités par <@${inviterId}> en moins d'1 heure`,
                  )
                  .addFields({ name: "Inviteur", value: `<@${inviterId}>`, inline: true })
                  .setTimestamp();
                await (channel as TextChannel).send({ embeds: [embed] });
              }
            }
          }
        }

        logger.info(`[InviteTracker] ${member.user.tag} invité par ${inviterId}`);
      }
    } catch (error) {
      logger.error("[InviteTracker] Erreur:", error);
    }
  });

  // Cleanup périodique
  setInterval(() => {
    const now = Date.now();
    for (const [key, val] of joinTracker) {
      if (now - val.firstJoin > 3600000) joinTracker.delete(key);
    }
  }, 300000);

  logger.info("[InviteTracker] Tracker d'invitations activé");
}
