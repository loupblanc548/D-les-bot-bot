import logger from "../utils/logger.js";
import { createLog, sendBanPurgeLog } from "../services/logs.js";
export function handleModerationEvents(client) {
    // Ban + Purge automatique des messages
    client.on("guildBanAdd", async (ban) => {
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
            const textChannels = ban.guild.channels.cache.filter((ch) => ch.isTextBased() && !("nsfw" in ch && ch.nsfw));
            for (const [, channel] of textChannels) {
                // Verification des permissions avant de tenter la purge
                const botMember = ban.guild.members.me;
                if (!botMember
                    ?.permissionsIn(channel.id)
                    .has(["ViewChannel", "ReadMessageHistory", "ManageMessages"])) {
                    continue;
                }
                try {
                    channelsScanned++;
                    const chan = channel;
                    const messages = await chan.messages.fetch({ limit: 100 });
                    const userMessages = messages.filter((msg) => msg.author.id === ban.user.id);
                    if (userMessages.size > 0) {
                        try {
                            const deleted = await chan.bulkDelete(userMessages, true);
                            totalDeleted += deleted.size;
                        }
                        catch (bulkErr) {
                            // Erreur silencieuse : messages trop vieux (>14j), salon verrouille, etc.
                            if (bulkErr.code === 50034) {
                                // Messages de plus de 14 jours — on les ignore
                                continue;
                            }
                            logger.warn(`[guildBanAdd] BulkDelete impossible dans #${chan.name} :`, bulkErr.message);
                        }
                    }
                }
                catch (fetchErr) {
                    // Salon inaccessible (verrouille, permissions manquantes, etc.)
                    const chan = channel;
                    logger.warn(`[guildBanAdd] Fetch impossible dans #${chan.name} :`, fetchErr.message);
                    continue;
                }
            }
        }
        catch (err) {
            logger.error("[guildBanAdd] Erreur lors de la purge automatique :", err);
        }
        // 3. Envoi du recapitulatif dans le salon de logs
        await sendBanPurgeLog(ban.user.tag, ban.user.id, totalDeleted, channelsScanned, client);
    });
    // Unban
    client.on("guildBanRemove", async (ban) => {
        await createLog({
            type: "unban",
            action: `${ban.user.tag} a ete debanni`,
            userId: ban.user.id,
        });
    });
}
//# sourceMappingURL=moderation.js.map