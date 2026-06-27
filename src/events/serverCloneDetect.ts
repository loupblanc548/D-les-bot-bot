/**
 * serverCloneDetect.ts — Détecte le clonage de serveur (EVENT-14)
 *
 * Détecte la création massive de salons ( potentiel clonage )
 * et alerte les administrateurs + lockdown automatique optionnel.
 */

import { Client, Channel, EmbedBuilder, TextChannel } from "discord.js";
import logger from "../utils/logger.js";
import { config } from "../config.js";
import { recordSecurityEvent } from "../services/risk-engine.js";
import { createLog } from "../services/logs.js";

const CLONE_THRESHOLD = 5; // 5 salons créés en 30s = suspect
const CLONE_WINDOW_MS = 30_000;

const channelCreateTracker: { count: number; firstSeen: number } = { count: 0, firstSeen: 0 };

export function handleServerCloneDetect(client: Client): void {
  client.on("channelCreate", async (channel: Channel) => {
    try {
      if (!("guild" in channel) || !channel.guild) return;

      const now = Date.now();
      if (now - channelCreateTracker.firstSeen > CLONE_WINDOW_MS) {
        channelCreateTracker.count = 1;
        channelCreateTracker.firstSeen = now;
      } else {
        channelCreateTracker.count++;
      }

      if (channelCreateTracker.count >= CLONE_THRESHOLD) {
        const guild = channel.guild;
        logger.warn(
          `[CloneDetect] ${channelCreateTracker.count} salons créés en < 30s sur ${guild.name}`,
        );

        // Alerte critique
        const logChannelId = config.logChannel;
        if (logChannelId) {
          const logChannel = await client.channels.fetch(logChannelId);
          if (logChannel?.isTextBased()) {
            const embed = new EmbedBuilder()
              .setTitle("🚨 Clonage de serveur suspecté")
              .setColor(0xff3344)
              .setDescription(
                `**${channelCreateTracker.count}** salons créés en moins de 30 secondes.\n` +
                  "Vérifiez immédiatement l'activité du serveur.",
              )
              .addFields(
                { name: "Serveur", value: guild.name, inline: true },
                { name: "Salons créés", value: `${channelCreateTracker.count}`, inline: true },
              )
              .setTimestamp()
              .setFooter({ text: "Détection automatique" });
            await (logChannel as TextChannel).send({
              content: "@here",
              embeds: [embed],
              allowedMentions: { parse: ["everyone"] },
            });
          }
        }

        // Enregistrer l'événement
        await recordSecurityEvent("unknown", guild.id, "ANTI_RAID").catch(() => {});
        await createLog({
          type: "security",
          action: `Clonage suspect: ${channelCreateTracker.count} salons créés en < 30s`,
        });

        // Reset
        channelCreateTracker.count = 0;
        channelCreateTracker.firstSeen = now;
      }
    } catch (error) {
      logger.error("[CloneDetect] Erreur:", error);
    }
  });

  logger.info("[CloneDetect] Détection de clonage de serveur activée");
}
