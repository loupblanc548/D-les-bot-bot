import logger from "../utils/logger.js";
import prisma from "../prisma.js";
import { EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
export async function createLog(entry) {
    return prisma.log.create({
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
export async function getLogs(limit = 50) {
    return prisma.log.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
    });
}
export async function getLogsByType(type, limit = 50) {
    return prisma.log.findMany({
        where: { type },
        orderBy: { createdAt: "desc" },
        take: limit,
    });
}
export async function getLogsByUser(userId, limit = 50) {
    return prisma.log.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: limit,
    });
}
export async function sendErrorLog(contexte, erreur, client) {
    logger.error(`[${contexte}]`, erreur);
    if (!config.logChannel)
        return;
    try {
        const embed = new EmbedBuilder()
            .setTitle('🚨 Erreur Critique')
            .setColor(0xff3344)
            .addFields({ name: 'Module', value: contexte, inline: true }, { name: 'Timestamp', value: new Date().toISOString(), inline: true }, { name: 'Message', value: erreur.message.slice(0, 1024) }, { name: 'Stack Trace', value: (erreur.stack || 'Aucune').slice(0, 1024) })
            .setTimestamp();
        if (client) {
            const channel = client.channels?.cache?.get(config.logChannel);
            if (channel?.isTextBased()) {
                await channel.send({ embeds: [embed] });
            }
        }
    }
    catch (e) {
        logger.error('[sendErrorLog] Impossible d envoyer dans le salon de logs:', String(e));
    }
}
// ─────────────────────────────────────────────
// Log de purge après bannissement
export async function sendBanPurgeLog(userTag, userId, totalDeleted, channelsScanned, client) {
    if (!config.logChannel)
        return;
    try {
        const channel = client.channels.cache.get(config.logChannel);
        if (!channel || !channel.isTextBased())
            return;
        const logChannel = channel;
        const embed = new EmbedBuilder()
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
        logger.error("[sendBanPurgeLog] Erreur d'envoi dans le salon de logs :", String(e));
    }
}
// ─────────────────────────────────────────────
export async function deleteOldLogs(daysOld = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);
    return prisma.log.deleteMany({
        where: { createdAt: { lt: cutoff } },
    });
}
// ─────────────────────────────────────────────
// Audit Logs Améliorés
// ─────────────────────────────────────────────
/**
 * Log d'action sensible (ban, kick, mute, etc.)
 */
export async function logSensitiveAction(action, executorId, targetId, details) {
    await createLog({
        type: 'SENSITIVE_ACTION',
        action,
        userId: executorId,
        targetId,
        moderator: executorId,
        details,
    });
    logger.info(`[AUDIT] SENSITIVE_ACTION: ${action} by ${executorId} on ${targetId}`);
}
/**
 * Log de changement de configuration
 */
export async function logConfigChange(action, executorId, guildId, details) {
    await createLog({
        type: 'CONFIG_CHANGE',
        action,
        userId: executorId,
        targetId: guildId,
        moderator: executorId,
        details,
    });
    logger.info(`[AUDIT] CONFIG_CHANGE: ${action} by ${executorId} in ${guildId}`);
}
/**
 * Log de tentative d'accès non autorisé
 */
export async function logUnauthorizedAccess(action, userId, details) {
    await createLog({
        type: 'UNAUTHORIZED_ACCESS',
        action,
        userId,
        details,
    });
    logger.warn(`[AUDIT] UNAUTHORIZED_ACCESS: ${action} by ${userId}`);
}
/**
 * Log d'erreur système
 */
export async function logSystemError(action, error, context) {
    await createLog({
        type: 'SYSTEM_ERROR',
        action,
        details: `${error.message}${context ? ` | Context: ${context}` : ''}`,
    });
    logger.error(`[AUDIT] SYSTEM_ERROR: ${action} - ${error.message}`);
}
/**
 * Récupère les logs d'audit avec filtres avancés
 */
export async function getAuditLogs(filters) {
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
        const logs = await prisma.log.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset,
        });
        return logs;
    }
    catch (error) {
        logger.error('Erreur lors de la récupération des logs:', String(error));
        return [];
    }
}
//# sourceMappingURL=logs.js.map