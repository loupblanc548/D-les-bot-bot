"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLog = createLog;
exports.getLogs = getLogs;
exports.getLogsByType = getLogsByType;
exports.getLogsByUser = getLogsByUser;
exports.sendErrorLog = sendErrorLog;
exports.sendBanPurgeLog = sendBanPurgeLog;
exports.deleteOldLogs = deleteOldLogs;
exports.logSensitiveAction = logSensitiveAction;
exports.logConfigChange = logConfigChange;
exports.logUnauthorizedAccess = logUnauthorizedAccess;
exports.logSystemError = logSystemError;
exports.getAuditLogs = getAuditLogs;
const logger_1 = __importDefault(require("../utils/logger"));
const prisma_1 = __importDefault(require("../prisma"));
const discord_js_1 = require("discord.js");
const config_1 = require("../config");
async function createLog(entry) {
    return prisma_1.default.log.create({
        data: {
            type: entry.type,
            action: entry.action,
            userId: entry.userId || null,
            targetId: entry.targetId || null,
            details: entry.details || null,
            moderator: entry.moderator || null,
        },
    });
}
async function getLogs(limit = 50) {
    return prisma_1.default.log.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
    });
}
async function getLogsByType(type, limit = 50) {
    return prisma_1.default.log.findMany({
        where: { type },
        orderBy: { createdAt: "desc" },
        take: limit,
    });
}
async function getLogsByUser(userId, limit = 50) {
    return prisma_1.default.log.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: limit,
    });
}
async function sendErrorLog(contexte, erreur, client) {
    logger_1.default.error(`[${contexte}]`, erreur);
    if (!config_1.config.logChannel)
        return;
    try {
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle('🚨 Erreur Critique')
            .setColor(0xff3344)
            .addFields({ name: 'Module', value: contexte, inline: true }, { name: 'Timestamp', value: new Date().toISOString(), inline: true }, { name: 'Message', value: erreur.message.slice(0, 1024) }, { name: 'Stack Trace', value: (erreur.stack || 'Aucune').slice(0, 1024) })
            .setTimestamp();
        if (client) {
            const channel = client.channels?.cache?.get(config_1.config.logChannel);
            if (channel?.isTextBased()) {
                await channel.send({ embeds: [embed] });
            }
        }
    }
    catch (e) {
        logger_1.default.error('[sendErrorLog] Impossible d envoyer dans le salon de logs:', String(e));
    }
}
// ─────────────────────────────────────────────
// Log de purge après bannissement
async function sendBanPurgeLog(userTag, userId, totalDeleted, channelsScanned, client) {
    if (!config_1.config.logChannel)
        return;
    try {
        const channel = client.channels.cache.get(config_1.config.logChannel);
        if (!channel || !channel.isTextBased())
            return;
        const logChannel = channel;
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle("🔨 Bannissement & Purge Automatique")
            .setColor(0xff0033)
            .setDescription(`L'historique de messages de l'utilisateur banni a été automatiquement nettoyé.`)
            .addFields({
            name: "👤 Utilisateur",
            value: `${userTag} (\`${userId}\`)`,
            inline: false,
        }, {
            name: "🗑️ Messages supprimés",
            value: `${totalDeleted} message(s)`,
            inline: true,
        }, {
            name: "📁 Salons scannés",
            value: `${channelsScanned}`,
            inline: true,
        }, {
            name: "🕒 Horodatage",
            value: new Date().toLocaleString("fr-FR"),
            inline: false,
        })
            .setFooter({ text: "Purge automatique • Discord Surveillance Bot" })
            .setTimestamp();
        await logChannel.send({ embeds: [embed] });
    }
    catch (e) {
        logger_1.default.error("[sendBanPurgeLog] Erreur d'envoi dans le salon de logs :", String(e));
    }
}
// ─────────────────────────────────────────────
async function deleteOldLogs(daysOld = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);
    return prisma_1.default.log.deleteMany({
        where: { createdAt: { lt: cutoff } },
    });
}
// ─────────────────────────────────────────────
// Audit Logs Améliorés
// ─────────────────────────────────────────────
/**
 * Log d'action sensible (ban, kick, mute, etc.)
 */
async function logSensitiveAction(action, executorId, targetId, details) {
    await createLog({
        type: 'SENSITIVE_ACTION',
        action,
        userId: executorId,
        targetId,
        moderator: executorId,
        details,
    });
    logger_1.default.info(`[AUDIT] SENSITIVE_ACTION: ${action} by ${executorId} on ${targetId}`);
}
/**
 * Log de changement de configuration
 */
async function logConfigChange(action, executorId, guildId, details) {
    await createLog({
        type: 'CONFIG_CHANGE',
        action,
        userId: executorId,
        targetId: guildId,
        moderator: executorId,
        details,
    });
    logger_1.default.info(`[AUDIT] CONFIG_CHANGE: ${action} by ${executorId} in ${guildId}`);
}
/**
 * Log de tentative d'accès non autorisé
 */
async function logUnauthorizedAccess(action, userId, details) {
    await createLog({
        type: 'UNAUTHORIZED_ACCESS',
        action,
        userId,
        details,
    });
    logger_1.default.warn(`[AUDIT] UNAUTHORIZED_ACCESS: ${action} by ${userId}`);
}
/**
 * Log d'erreur système
 */
async function logSystemError(action, error, context) {
    await createLog({
        type: 'SYSTEM_ERROR',
        action,
        details: `${error.message}${context ? ` | Context: ${context}` : ''}`,
    });
    logger_1.default.error(`[AUDIT] SYSTEM_ERROR: ${action} - ${error.message}`);
}
/**
 * Récupère les logs d'audit avec filtres avancés
 */
async function getAuditLogs(filters) {
    try {
        const { type, userId, targetId, moderator, limit = 100, offset = 0 } = filters;
        const where = {};
        if (type)
            where.type = type;
        if (userId)
            where.userId = userId;
        if (targetId)
            where.targetId = targetId;
        if (moderator)
            where.moderator = moderator;
        const logs = await prisma_1.default.log.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset,
        });
        return logs;
    }
    catch (error) {
        logger_1.default.error('Erreur lors de la récupération des logs:', String(error));
        return [];
    }
}
//# sourceMappingURL=logs.js.map