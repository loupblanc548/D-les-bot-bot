"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAlertInteractions = handleAlertInteractions;
const discord_js_1 = require("discord.js");
const prisma_1 = __importDefault(require("../prisma"));
const logger_1 = __importDefault(require("../utils/logger"));
const logs_1 = require("../services/logs");
const alert_service_1 = require("../services/alert-service");
const risk_engine_1 = require("../services/risk-engine");
// ============================================================
// Gestionnaire des boutons interactifs d'alerte
// ============================================================
function handleAlertInteractions(client) {
    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isButton())
            return;
        const customId = interaction.customId;
        if (!customId.startsWith("alert_"))
            return;
        // Format: alert_ACTION_alertId
        const parts = customId.split("_");
        if (parts.length < 3)
            return;
        const action = parts[1];
        const alertId = parts.slice(2).join("_");
        await interaction.deferReply({ ephemeral: true });
        try {
            // Vérifier les permissions du modérateur
            const member = interaction.member;
            if (!member) {
                await interaction.editReply({ content: "\u274C Impossible de v\u00E9rifier vos permissions." });
                return;
            }
            const requiredPerms = getRequiredPermissions(action);
            if (requiredPerms && !member.permissions.has(requiredPerms)) {
                await interaction.editReply({
                    content: `\u274C Permission insuffisante pour l'action **${action}**. Permission requise : \`${String(requiredPerms)}\``,
                });
                return;
            }
            // Résoudre l'alerte
            const alert = await (0, alert_service_1.resolveAlert)(alertId, action, interaction.user.id);
            if (!alert) {
                await interaction.editReply({ content: "\u274C Cette alerte n'est plus en attente ou n'existe pas." });
                return;
            }
            // Exécuter l'action correspondante
            const actionResult = await executeAlertAction(action, alert.userId, alert.guildId, interaction, client);
            // Mettre à jour l'embed original pour montrer la résolution
            try {
                const originalMessage = interaction.message;
                if (originalMessage) {
                    const embed = discord_js_1.EmbedBuilder.from(originalMessage.embeds[0] || {});
                    embed.setColor(action === "IGNORE" ? 0x808080 : 0x53fc18);
                    embed.setFooter({
                        text: `R\u00E9solu par ${interaction.user.tag} \u2022 Action: ${action}`,
                    });
                    await originalMessage.edit({
                        embeds: [embed],
                        components: [], // Retirer les boutons
                    });
                }
            }
            catch { }
            const responseText = actionResult
                ? `${actionResult}\n\n\u2705 Alerte r\u00E9solue.`
                : `\u2705 Alerte **${action}** trait\u00E9e avec succ\u00E8s.`;
            await interaction.editReply({ content: responseText });
        }
        catch (error) {
            logger_1.default.error(`[AlertInteraction] Erreur traitement alerte ${alertId}:`, error);
            try {
                await interaction.editReply({ content: "\u274C Une erreur est survenue lors du traitement de l'alerte." });
            }
            catch { }
        }
    });
}
// ============================================================
// Permissions requises par action
// ============================================================
function getRequiredPermissions(action) {
    switch (action) {
        case "WARN":
        case "TIMEOUT":
            return discord_js_1.PermissionFlagsBits.ModerateMembers;
        case "KICK":
            return discord_js_1.PermissionFlagsBits.KickMembers;
        case "BAN":
            return discord_js_1.PermissionFlagsBits.BanMembers;
        case "IGNORE":
        case "WATCH":
            return null; // Tout modérateur peut ignorer ou surveiller
        default:
            return discord_js_1.PermissionFlagsBits.ModerateMembers;
    }
}
// ============================================================
// Exécution de l'action correspondante
// ============================================================
async function executeAlertAction(action, userId, guildId, interaction, client) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild)
        return null;
    switch (action) {
        case "IGNORE":
            return "\u274C Alerte ignor\u00E9e.";
        case "WATCH": {
            await (0, logs_1.createLog)({
                type: "ALERT_ACTION",
                action: `Utilisateur plac\u00E9 sous surveillance`,
                userId,
                moderator: interaction.user.id,
                details: `Action depuis alerte`,
            });
            return "\u2139 Utilisateur ajout\u00E9 \u00E0 la liste de surveillance.";
        }
        case "WARN": {
            await executeWarn(userId, guildId, interaction);
            await (0, risk_engine_1.recordSanction)(userId, guildId, "WARN");
            return "\u26A0 Avertissement envoy\u00E9 et enregistr\u00E9.";
        }
        case "TIMEOUT": {
            await executeTimeout(userId, guildId, interaction);
            await (0, risk_engine_1.recordSanction)(userId, guildId, "TIMEOUT");
            return "\u23F0 Timeout de 1 heure appliqu\u00E9.";
        }
        case "KICK": {
            await executeKick(userId, guildId, interaction);
            await (0, risk_engine_1.recordSanction)(userId, guildId, "KICK");
            return "\uD83D\uDCE6 Membre expuls\u00E9.";
        }
        case "BAN": {
            await executeBan(userId, guildId, interaction);
            await (0, risk_engine_1.recordSanction)(userId, guildId, "BAN");
            return "\uD83D\uDEA8 Membre banni.";
        }
        default:
            return null;
    }
}
async function executeWarn(userId, guildId, interaction) {
    await prisma_1.default.sanction.create({
        data: {
            guildId,
            userId,
            moderatorId: interaction.user.id,
            type: "WARN",
            reason: "Avertissement depuis alerte de mod\u00E9ration",
        },
    });
    await (0, logs_1.createLog)({
        type: "WARN",
        action: "Avertissement depuis alerte",
        userId,
        moderator: interaction.user.id,
        details: "Warn via bouton d'alerte",
    });
}
async function executeTimeout(userId, guildId, interaction) {
    const guild = interaction.guild;
    if (!guild)
        return;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member) {
        await member.timeout(60 * 60 * 1000, "Timeout depuis alerte de mod\u00E9ration");
    }
    await (0, logs_1.createLog)({
        type: "TIMEOUT",
        action: "Timeout 1h depuis alerte",
        userId,
        moderator: interaction.user.id,
        details: "Timeout via bouton d'alerte",
    });
}
async function executeKick(userId, guildId, interaction) {
    const guild = interaction.guild;
    if (!guild)
        return;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member) {
        await member.kick("Expulsion depuis alerte de mod\u00E9ration");
    }
    await (0, logs_1.createLog)({
        type: "KICK",
        action: "Expulsion depuis alerte",
        userId,
        moderator: interaction.user.id,
        details: "Kick via bouton d'alerte",
    });
}
async function executeBan(userId, guildId, interaction) {
    const guild = interaction.guild;
    if (!guild)
        return;
    await guild.members.ban(userId, {
        reason: "Bannissement depuis alerte de mod\u00E9ration",
        deleteMessageSeconds: 7 * 86400,
    });
    await (0, logs_1.createLog)({
        type: "BAN",
        action: "Bannissement depuis alerte",
        userId,
        moderator: interaction.user.id,
        details: "Ban via bouton d'alerte",
    });
}
//# sourceMappingURL=interactions.js.map