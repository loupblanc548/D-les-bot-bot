"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAlert = generateAlert;
exports.buildAlertEmbed = buildAlertEmbed;
exports.sendAlertToChannel = sendAlertToChannel;
exports.notifyOwners = notifyOwners;
exports.resolveAlert = resolveAlert;
exports.getPendingAlerts = getPendingAlerts;
exports.getAlertHistory = getAlertHistory;
exports.getAlertsByUser = getAlertsByUser;
const prisma_1 = __importDefault(require("../prisma"));
const logger_1 = __importDefault(require("../utils/logger"));
const config_1 = require("../config");
const logs_1 = require("./logs");
const discord_js_1 = require("discord.js");
const risk_engine_1 = require("./risk-engine");
// ============================================================
// Constantes
// ============================================================
const RISK_EMOJIS = {
    "FAIBLE": "\u2139",
    "MOYEN": "\u26A0",
    "ÉLEVÉ": "\uD83D\uDEA8",
    "CRITIQUE": "\u274C",
};
const ALERT_BUTTONS = [
    { id: "IGNORE", label: "Ignorer", emoji: "\u274C", style: discord_js_1.ButtonStyle.Secondary },
    { id: "WATCH", label: "Surveiller", emoji: "\u2139", style: discord_js_1.ButtonStyle.Primary },
    { id: "WARN", label: "Warn", emoji: "\u26A0", style: discord_js_1.ButtonStyle.Success },
    { id: "TIMEOUT", label: "Timeout", emoji: "\u23F0", style: discord_js_1.ButtonStyle.Danger },
    { id: "KICK", label: "Kick", emoji: "\uD83D\uDCE6", style: discord_js_1.ButtonStyle.Danger },
    { id: "BAN", label: "Ban", emoji: "\uD83D\uDEA8", style: discord_js_1.ButtonStyle.Danger },
];
// ============================================================
// Génération d'une alerte
// ============================================================
async function generateAlert(profile, reason, type = "RISK_THRESHOLD") {
    const alert = await prisma_1.default.alert.create({
        data: {
            guildId: profile.guildId,
            userId: profile.userId,
            type,
            riskScore: profile.riskScore,
            riskLevel: profile.riskLevel,
            details: reason,
            status: "PENDING",
        },
    });
    // Marquer le profil avec la dernière alerte
    await prisma_1.default.riskProfile.updateMany({
        where: { userId: profile.userId, guildId: profile.guildId },
        data: { lastAlertAt: new Date() },
    });
    await (0, logs_1.createLog)({
        type: "ALERT",
        action: `Alerte g\u00E9n\u00E9r\u00E9e pour ${profile.userId}`,
        userId: profile.userId,
        targetId: profile.guildId,
        details: JSON.stringify({ riskScore: profile.riskScore, riskLevel: profile.riskLevel, reason }),
    });
    logger_1.default.info(`[AlertService] Alerte g\u00E9n\u00E9r\u00E9e pour ${profile.userId} (${profile.riskLevel}, score=${profile.riskScore})`);
    return alert;
}
// ============================================================
// Construction de l'embed d'alerte
// ============================================================
async function buildAlertEmbed(alert, client) {
    const { profile, recentSanctions } = await (0, risk_engine_1.getRiskReport)(alert.userId, alert.guildId);
    // Récupérer infos utilisateur
    let userTag = "Inconnu";
    let accountCreatedAt = "Inconnu";
    let joinedAt = "Inconnu";
    try {
        const user = await client.users.fetch(alert.userId);
        userTag = user.tag;
        accountCreatedAt = `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`;
        const guild = client.guilds.cache.get(alert.guildId);
        if (guild) {
            const member = await guild.members.fetch(alert.userId).catch(() => null);
            if (member?.joinedTimestamp) {
                joinedAt = `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`;
            }
        }
    }
    catch { }
    const riskEmoji = RISK_EMOJIS[alert.riskLevel] || "\u26A0";
    // Construire l'historique des sanctions récentes
    let sanctionsHistory = "Aucune sanction r\u00E9cente";
    if (recentSanctions.length > 0) {
        sanctionsHistory = recentSanctions
            .slice(0, 5)
            .map((s) => {
            const date = `<t:${Math.floor(new Date(s.createdAt).getTime() / 1000)}:R>`;
            return `\u2022 **${s.type}** \u2014 ${s.reason.substring(0, 60)} (${date})`;
        })
            .join("\n");
    }
    const colorMap = {
        "FAIBLE": 0x53fc18,
        "MOYEN": 0xffaa00,
        "ÉLEVÉ": 0xff6600,
        "CRITIQUE": 0xff3344,
    };
    const color = colorMap[alert.riskLevel] || 0x808080;
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle(`\uD83D\uDEA8 Alerte de Mod\u00E9ration \uD83D\uDEA8`)
        .setColor(color)
        .setDescription(`## ${riskEmoji} Niveau de Risque : **${alert.riskLevel}**\n` +
        `**Score** : \`${alert.riskScore}\` \u2014 **Raison** : ${alert.details}\n\n` +
        `### \u2139 Informations Utilisateur\n` +
        `\u2022 **Pseudo** : \`${userTag}\`\n` +
        `\u2022 **Mention** : <@${alert.userId}>\n` +
        `\u2022 **ID** : \`${alert.userId}\`\n` +
        `\u2022 **Compte cr\u00E9\u00E9** : ${accountCreatedAt}\n` +
        `\u2022 **Arriv\u00E9e serveur** : ${joinedAt}\n\n` +
        `### \uD83D\uDEA8 Statistiques de Sanctions\n` +
        `\u2022 **Warns** : ${profile.warnCount} \u2014 **Timeouts** : ${profile.timeoutCount}\n` +
        `\u2022 **Kicks** : ${profile.kickCount} \u2014 **Tempbans** : ${profile.tempbanCount}\n` +
        `\u2022 **Bans** : ${profile.banCount} \u2014 **Total** : ${profile.totalSanctions}\n\n` +
        `### \u23F0 Historique R\u00E9cent\n${sanctionsHistory}`)
        .setFooter({ text: `Alerte #${alert.id.substring(0, 8)} \u2022 Syst\u00E8me de Surveillance v1.0.0` })
        .setTimestamp();
    return embed;
}
// ============================================================
// Envoi de l'alerte vers le salon dédié
// ============================================================
async function sendAlertToChannel(alert, client) {
    const embed = await buildAlertEmbed(alert, client);
    // Boutons d'action (2 rows of 3)
    const rows = [];
    let currentRow = new discord_js_1.ActionRowBuilder();
    let buttonCount = 0;
    for (const btn of ALERT_BUTTONS) {
        currentRow.addComponents(new discord_js_1.ButtonBuilder()
            .setCustomId(`alert_${btn.id}_${alert.id}`)
            .setLabel(btn.label)
            .setEmoji(btn.emoji)
            .setStyle(btn.style));
        buttonCount++;
        if (buttonCount % 3 === 0 || buttonCount === ALERT_BUTTONS.length) {
            rows.push(currentRow);
            currentRow = new discord_js_1.ActionRowBuilder();
        }
    }
    // Trouver le canal d'alerte
    let targetChannel = null;
    try {
        const guildConfig = await prisma_1.default.guildConfig.findUnique({ where: { guildId: alert.guildId } });
        if (guildConfig?.logChannelId) {
            const guild = client.guilds.cache.get(alert.guildId);
            if (guild) {
                const channel = await guild.channels.fetch(guildConfig.logChannelId).catch(() => null);
                if (channel?.isTextBased())
                    targetChannel = channel;
            }
        }
    }
    catch (err) {
        logger_1.default.warn(`[AlertService] Impossible de trouver le canal d'alerte: ${err}`);
    }
    if (targetChannel) {
        try {
            await targetChannel.send({
                content: `\uD83D\uDEA8 **Alerte de mod\u00E9ration** \uD83D\uDEA8`,
                embeds: [embed],
                components: rows,
            });
            logger_1.default.info(`[AlertService] Alerte envoy\u00E9e dans #${targetChannel.name}`);
        }
        catch (err) {
            logger_1.default.error(`[AlertService] \u00C9chec envoi alerte canal: ${err}`);
        }
    }
    else {
        logger_1.default.warn(`[AlertService] Aucun canal d'alerte configur\u00E9 pour ${alert.guildId}`);
    }
}
// ============================================================
// Notification des propriétaires du bot
// ============================================================
async function notifyOwners(alert, message, client) {
    const ownerIds = config_1.config.ownerId
        ? config_1.config.ownerId.split(",").map((s) => s.trim())
        : [];
    if (ownerIds.length === 0)
        return;
    for (const ownerId of ownerIds) {
        if (!ownerId)
            continue;
        try {
            const owner = await client.users.fetch(ownerId);
            const embed = new discord_js_1.EmbedBuilder()
                .setTitle(`\uD83D\uDEA8 Alerte Propri\u00E9taire - ${alert.riskLevel}`)
                .setColor(0xff3344)
                .setDescription(message)
                .addFields({ name: "Serveur", value: alert.guildId, inline: true }, { name: "Utilisateur", value: `<@${alert.userId}>`, inline: true }, { name: "Score", value: `${alert.riskScore}`, inline: true })
                .setTimestamp();
            await owner.send({ embeds: [embed] }).catch((err) => {
                logger_1.default.warn(`[AlertService] Impossible de DM le propri\u00E9taire ${ownerId}: ${err.message}`);
            });
        }
        catch (err) {
            logger_1.default.warn(`[AlertService] Erreur notification owner ${ownerId}: ${err}`);
        }
    }
}
// ============================================================
// Traitement des actions des boutons d'alerte
// ============================================================
async function resolveAlert(alertId, action, moderatorId) {
    const alert = await prisma_1.default.alert.findUnique({ where: { id: alertId } });
    if (!alert || alert.status !== "PENDING")
        return null;
    const updated = await prisma_1.default.alert.update({
        where: { id: alertId },
        data: {
            status: action === "IGNORE" ? "DISMISSED" : "RESOLVED",
            action,
            resolvedBy: moderatorId,
            resolvedAt: new Date(),
        },
    });
    if (action === "WATCH") {
        await prisma_1.default.riskProfile.updateMany({
            where: { userId: alert.userId, guildId: alert.guildId },
            data: { underWatch: true },
        });
    }
    await (0, logs_1.createLog)({
        type: "ALERT_ACTION",
        action: `Alerte r\u00E9solue: ${action}`,
        userId: alert.userId,
        moderator: moderatorId,
        details: JSON.stringify({ alertId, action }),
    });
    logger_1.default.info(`[AlertService] Alerte ${alertId} r\u00E9solue par ${moderatorId}: ${action}`);
    return updated;
}
// ============================================================
// Récupération des alertes
// ============================================================
async function getPendingAlerts(guildId) {
    return prisma_1.default.alert.findMany({
        where: { guildId, status: "PENDING" },
        orderBy: { createdAt: "desc" },
        take: 25,
    });
}
async function getAlertHistory(guildId, limit = 50) {
    return prisma_1.default.alert.findMany({
        where: { guildId },
        orderBy: { createdAt: "desc" },
        take: limit,
    });
}
async function getAlertsByUser(userId, guildId) {
    return prisma_1.default.alert.findMany({
        where: { userId, guildId },
        orderBy: { createdAt: "desc" },
        take: 25,
    });
}
//# sourceMappingURL=alert-service.js.map