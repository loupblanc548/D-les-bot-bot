"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleModerationEvents = handleModerationEvents;
const logger_1 = __importDefault(require("../utils/logger"));
const logs_1 = require("../services/logs");
function handleModerationEvents(client) {
    // Ban + Purge automatique des messages
    client.on("guildBanAdd", async (ban) => {
        // 1. Journalisation du bannissement
        await (0, logs_1.createLog)({
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
                            logger_1.default.warn(`[guildBanAdd] BulkDelete impossible dans #${chan.name} :`, bulkErr.message);
                        }
                    }
                }
                catch (fetchErr) {
                    // Salon inaccessible (verrouille, permissions manquantes, etc.)
                    const chan = channel;
                    logger_1.default.warn(`[guildBanAdd] Fetch impossible dans #${chan.name} :`, fetchErr.message);
                    continue;
                }
            }
        }
        catch (err) {
            logger_1.default.error("[guildBanAdd] Erreur lors de la purge automatique :", err);
        }
        // 3. Envoi du recapitulatif dans le salon de logs
        await (0, logs_1.sendBanPurgeLog)(ban.user.tag, ban.user.id, totalDeleted, channelsScanned, client);
    });
    // Unban
    client.on("guildBanRemove", async (ban) => {
        await (0, logs_1.createLog)({
            type: "unban",
            action: `${ban.user.tag} a ete debanni`,
            userId: ban.user.id,
        });
    });
}
//# sourceMappingURL=moderation.js.map