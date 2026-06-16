import logger from "../utils/logger";
import { Client, GuildBan, GuildTextBasedChannel } from "discord.js";
import { createLog, sendBanPurgeLog } from "../services/logs";

export function handleModerationEvents(client: Client) {
  // Ban + Purge automatique des messages
  client.on("guildBanAdd", async (ban: GuildBan) => {
    // 1. Journalisation du bannissement
    await createLog({
      type: "ban",
      action: `${ban.user.tag} a ete banni`,
      userId: ban.user.id,
    });

    // 2. Purge automatique des messages residuels dans tous les salons textuels
    let totalDeleted = 0;
    let channelsScanned = 0;

    try {
      const textChannels = ban.guild.channels.cache.filter(
        (ch) => ch.isTextBased() && !("nsfw" in ch && ch.nsfw)
      );

      for (const [, channel] of textChannels) {
        // Verification des permissions avant de tenter la purge
        const botMember = ban.guild.members.me;
        if (
          !botMember
            ?.permissionsIn(channel.id)
            .has(["ViewChannel", "ReadMessageHistory", "ManageMessages"])
        ) {
          continue;
        }

        try {
          channelsScanned++;
          const chan = channel as GuildTextBasedChannel;
          const messages = await chan.messages.fetch({ limit: 100 });
          const userMessages = messages.filter(
            (msg) => msg.author.id === ban.user.id
          );

          if (userMessages.size > 0) {
            try {
              const deleted = await chan.bulkDelete(userMessages, true);
              totalDeleted += deleted.size;
            } catch (bulkErr: unknown) {
              // Erreur silencieuse : messages trop vieux (>14j), salon verrouille, etc.
              if ((bulkErr as any).code === 50034) {
                // Messages de plus de 14 jours — on les ignore
                continue;
              }
              logger.warn(
                `[guildBanAdd] BulkDelete impossible dans #${chan.name} :`,
                (bulkErr as Error).message
              );
            }
          }
        } catch (fetchErr: unknown) {
          // Salon inaccessible (verrouille, permissions manquantes, etc.)
          const chan = channel as GuildTextBasedChannel;
          logger.warn(
            `[guildBanAdd] Fetch impossible dans #${chan.name} :`,
            (fetchErr as Error).message
          );
          continue;
        }
      }
    } catch (err) {
      logger.error(
        "[guildBanAdd] Erreur lors de la purge automatique :",
        err
      );
    }

    // 3. Envoi du recapitulatif dans le salon de logs
    await sendBanPurgeLog(
      ban.user.tag,
      ban.user.id,
      totalDeleted,
      channelsScanned,
      client
    );
  });

  // Unban
  client.on("guildBanRemove", async (ban: GuildBan) => {
    await createLog({
      type: "unban",
      action: `${ban.user.tag} a ete debanni`,
      userId: ban.user.id,
    });
  });
}
