import logger from "../utils/logger.js";
import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, } from "discord.js";
import prisma from "../prisma.js";
import { requireAdmin } from "../services/permissions.js";
import { createLog } from "../services/logs.js";
import { getRiskReport, getAllRiskyUsers, resetRiskProfile, } from "../services/risk-engine.js";
import { getPendingAlerts, getAlertHistory, getAlertsByUser, } from "../services/alert-service.js";
const FOOTER = { text: "Système de Surveillance • v1.0.0" };
function baseEmbed(title, color) {
    return new EmbedBuilder()
        .setTitle(title)
        .setColor(color)
        .setFooter(FOOTER)
        .setTimestamp();
}
// ============================================================
// Définitions des commandes
// ============================================================
export const commands = [
    // /alertcenter - Centre d'alertes global
    new SlashCommandBuilder()
        .setName("alertcenter")
        .setDescription("Centre d'alertes global - consulter et gérer les alertes")
        .addSubcommand((s) => s.setName("pending").setDescription("Voir les alertes en attente"))
        .addSubcommand((s) => s.setName("history").setDescription("Voir l'historique des alertes"))
        .addSubcommand((s) => s
        .setName("user")
        .setDescription("Voir les alertes d'un utilisateur")
        .addUserOption((o) => o.setName("cible").setDescription("L'utilisateur").setRequired(true)))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .toJSON(),
    // /riskscore - Voir le score de risque d'un utilisateur
    new SlashCommandBuilder()
        .setName("riskscore")
        .setDescription("Voir le score de risque d'un utilisateur")
        .addUserOption((o) => o.setName("cible").setDescription("L'utilisateur").setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .toJSON(),
    // /riskyusers - Liste des utilisateurs à risque
    new SlashCommandBuilder()
        .setName("riskyusers")
        .setDescription("Lister les utilisateurs à risque sur le serveur")
        .addStringOption((o) => o
        .setName("niveau")
        .setDescription("Niveau de risque minimum")
        .setRequired(false)
        .addChoices({ name: "Moyen", value: "MOYEN" }, { name: "Élevé", value: "ELEVE" }, { name: "Critique", value: "CRITIQUE" }))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .toJSON(),
    // /alertconfig - Configurer les alertes
    new SlashCommandBuilder()
        .setName("alertconfig")
        .setDescription("Configurer le système d'alertes")
        .addSubcommand((s) => s
        .setName("channel")
        .setDescription("Définir le salon des alertes")
        .addChannelOption((o) => o.setName("salon").setDescription("Salon de réception des alertes").setRequired(true)))
        .addSubcommand((s) => s
        .setName("threshold")
        .setDescription("Définir le seuil de score pour les alertes")
        .addIntegerOption((o) => o
        .setName("score")
        .setDescription("Score minimum (défaut: 30)")
        .setRequired(true)
        .setMinValue(10)
        .setMaxValue(200)))
        .addSubcommand((s) => s
        .setName("owner_notify")
        .setDescription("Activer/désactiver les notifications propriétaires")
        .addBooleanOption((o) => o
        .setName("actif")
        .setDescription("Activer ou désactiver")
        .setRequired(true)))
        .addSubcommand((s) => s.setName("reset").setDescription("Réinitialiser les alertes d'un utilisateur")
        .addUserOption((o) => o.setName("cible").setDescription("L'utilisateur").setRequired(true)))
        .addSubcommand((s) => s.setName("view").setDescription("Voir la configuration actuelle"))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .toJSON(),
];
// ============================================================
// Handler principal
// ============================================================
export async function handleCommand(interaction) {
    if (!(await requireAdmin(interaction)))
        return false;
    const { commandName } = interaction;
    switch (commandName) {
        case "alertcenter": {
            const sub = interaction.options.getSubcommand();
            if (sub === "pending")
                await handleAlertPending(interaction);
            else if (sub === "history")
                await handleAlertHistory(interaction);
            else if (sub === "user")
                await handleAlertUser(interaction);
            return true;
        }
        case "riskscore":
            await handleRiskScore(interaction);
            return true;
        case "riskyusers":
            await handleRiskyUsers(interaction);
            return true;
        case "alertconfig": {
            const sub = interaction.options.getSubcommand();
            if (sub === "channel")
                await handleAlertConfigChannel(interaction);
            else if (sub === "threshold")
                await handleAlertConfigThreshold(interaction);
            else if (sub === "owner_notify")
                await handleAlertConfigOwnerNotify(interaction);
            else if (sub === "reset")
                await handleAlertConfigReset(interaction);
            else if (sub === "view")
                await handleAlertConfigView(interaction);
            return true;
        }
    }
    return false;
}
// ============================================================
// Handlers /alertcenter
// ============================================================
async function handleAlertPending(interaction) {
    await interaction.deferReply();
    try {
        const alerts = await getPendingAlerts(interaction.guildId);
        if (alerts.length === 0) {
            await interaction.editReply({
                embeds: [baseEmbed("🚨 Centre d'Alertes", 0x53fc18).setDescription("Aucune alerte en attente. ✅")],
            });
            return;
        }
        const embed = baseEmbed("🚨 Alertes en Attente", 0xffaa00)
            .setDescription(`${alerts.length} alerte(s) en attente de révision :`)
            .addFields(alerts.slice(0, 10).map((a) => ({
            name: `<@${a.userId}> — ${a.riskLevel} (Score: ${a.riskScore})`,
            value: `${a.details || "Aucun détail"} • <t:${Math.floor(new Date(a.createdAt).getTime() / 1000)}:R>`,
        })));
        await interaction.editReply({ embeds: [embed] });
    }
    catch (error) {
        logger.error("[ALERTCENTER PENDING]:", error);
        await interaction.editReply({
            embeds: [baseEmbed("Erreur", 0xff3344).setDescription("Impossible de récupérer les alertes.")],
        });
    }
}
async function handleAlertHistory(interaction) {
    await interaction.deferReply();
    try {
        const alerts = await getAlertHistory(interaction.guildId, 25);
        if (alerts.length === 0) {
            await interaction.editReply({
                embeds: [baseEmbed("📜 Historique", 0x53fc18).setDescription("Aucune alerte dans l'historique.")],
            });
            return;
        }
        const resolved = alerts.filter((a) => a.status !== "PENDING").length;
        const pending = alerts.filter((a) => a.status === "PENDING").length;
        const embed = baseEmbed("📞 Historique des Alertes", 0x3498db)
            .setDescription(`**Total** : ${alerts.length} • **En attente** : ${pending} • **Résolues** : ${resolved}`)
            .addFields(alerts.slice(0, 10).map((a) => ({
            name: `<@${a.userId}> — ${a.riskLevel}`,
            value: `Statut: **${a.status}** | Action: ${a.action || "N/A"} • <t:${Math.floor(new Date(a.createdAt).getTime() / 1000)}:R>`,
        })));
        await interaction.editReply({ embeds: [embed] });
    }
    catch (error) {
        logger.error("[ALERTCENTER HISTORY]:", error);
        await interaction.editReply({
            embeds: [baseEmbed("Erreur", 0xff3344).setDescription("Impossible de récupérer l'historique.")],
        });
    }
}
async function handleAlertUser(interaction) {
    await interaction.deferReply();
    try {
        const user = interaction.options.getUser("cible", true);
        const alerts = await getAlertsByUser(user.id, interaction.guildId);
        if (alerts.length === 0) {
            await interaction.editReply({
                embeds: [baseEmbed("👤 Alertes Utilisateur", 0x53fc18)
                        .setDescription(`Aucune alerte pour ${user.tag}.`)],
            });
            return;
        }
        const embed = baseEmbed(`👤 Alertes de ${user.tag}`, 0x3498db)
            .setDescription(`**${alerts.length}** alerte(s) pour <@${user.id}>`)
            .addFields(alerts.slice(0, 10).map((a) => ({
            name: `${a.riskLevel} — Score: ${a.riskScore} — ${a.status}`,
            value: `${a.details || "N/A"} • <t:${Math.floor(new Date(a.createdAt).getTime() / 1000)}:R>`,
        })));
        await interaction.editReply({ embeds: [embed] });
    }
    catch (error) {
        logger.error("[ALERTCENTER USER]:", error);
        await interaction.editReply({
            embeds: [baseEmbed("Erreur", 0xff3344).setDescription("Impossible de récupérer les alertes.")],
        });
    }
}
// ============================================================
// Handler /riskscore
// ============================================================
async function handleRiskScore(interaction) {
    await interaction.deferReply();
    try {
        const user = interaction.options.getUser("cible", true);
        const { profile, recentSanctions } = await getRiskReport(user.id, interaction.guildId);
        const riskEmojis = {
            "FAIBLE": "ℹ",
            "MOYEN": "⚠",
            "ELEVE": "🚨",
            "CRITIQUE": "❌",
        };
        let sanctionsText = "Aucune sanction récente";
        if (recentSanctions.length > 0) {
            sanctionsText = recentSanctions
                .slice(0, 5)
                .map((s) => `• **${s.type}** — ${s.reason.substring(0, 50)} (<t:${Math.floor(new Date(s.createdAt).getTime() / 1000)}:R>)`)
                .join("\n");
        }
        const colorMap = {
            "FAIBLE": 0x53fc18,
            "MOYEN": 0xffaa00,
            "ELEVE": 0xff6600,
            "CRITIQUE": 0xff3344,
        };
        const embed = baseEmbed(`Score de Risque - ${user.tag}`, colorMap[profile.riskLevel] || 0x808080)
            .setDescription(`## ${riskEmojis[profile.riskLevel] || "⚠"} Niveau : **${profile.riskLevel}**\n` +
            `**Score** : \`${profile.riskScore}\`\n\n` +
            `### Statistiques\n` +
            `• **Warns** : ${profile.warnCount} | **Timeouts** : ${profile.timeoutCount}\n` +
            `• **Kicks** : ${profile.kickCount} | **Tempbans** : ${profile.tempbanCount}\n` +
            `• **Bans** : ${profile.banCount} | **Total sanctions** : ${profile.totalSanctions}\n` +
            `• **Sous surveillance** : ${profile.underWatch ? "✅ Oui" : "❌ Non"}\n\n` +
            `### Dernières Sanctions\n${sanctionsText}`);
        await interaction.editReply({ embeds: [embed] });
    }
    catch (error) {
        logger.error("[RISKSCORE]:", error);
        await interaction.editReply({
            embeds: [baseEmbed("Erreur", 0xff3344).setDescription("Impossible de calculer le score de risque.")],
        });
    }
}
// ============================================================
// Handler /riskyusers
// ============================================================
async function handleRiskyUsers(interaction) {
    await interaction.deferReply();
    try {
        const niveau = (interaction.options.getString("niveau") || "MOYEN");
        const users = await getAllRiskyUsers(interaction.guildId, niveau);
        if (users.length === 0) {
            await interaction.editReply({
                embeds: [baseEmbed("👥 Utilisateurs à Risque", 0x53fc18)
                        .setDescription(`Aucun utilisateur avec un risque ≥ **${niveau}**.`)],
            });
            return;
        }
        const riskEmojis = {
            "FAIBLE": "ℹ",
            "MOYEN": "⚠",
            "ELEVE": "🚨",
            "CRITIQUE": "❌",
        };
        const embed = baseEmbed("👥 Utilisateurs à Risque", 0xff6600)
            .setDescription(`${users.length} utilisateur(s) avec un risque ≥ **${niveau}**`)
            .addFields(users
            .slice(0, 15)
            .map((u) => ({
            name: `${riskEmojis[u.riskLevel] || "⚠"} <@${u.userId}>`,
            value: `Score: **${u.riskScore}** | Warns: ${u.warnCount} | Total: ${u.totalSanctions}`,
            inline: true,
        })));
        await interaction.editReply({ embeds: [embed] });
    }
    catch (error) {
        logger.error("[RISKYUSERS]:", error);
        await interaction.editReply({
            embeds: [baseEmbed("Erreur", 0xff3344).setDescription("Impossible de lister les utilisateurs.")],
        });
    }
}
// ============================================================
// Handlers /alertconfig
// ============================================================
async function handleAlertConfigChannel(interaction) {
    await interaction.deferReply();
    try {
        const channel = interaction.options.getChannel("salon", true);
        await prisma.guildConfig.upsert({
            where: { guildId: interaction.guildId },
            create: { guildId: interaction.guildId, logChannelId: channel.id },
            update: { logChannelId: channel.id },
        });
        await createLog({
            type: "CONFIG",
            action: `Salon d'alertes défini: #${channel.name}`,
            moderator: interaction.user.id,
            details: `Channel ID: ${channel.id}`,
        });
        await interaction.editReply({
            embeds: [baseEmbed("Configuration", 0x53fc18)
                    .setDescription(`✅ Salon d'alertes défini sur ${channel}.`)],
        });
    }
    catch (error) {
        logger.error("[ALERTCONFIG CHANNEL]:", error);
        await interaction.editReply({
            embeds: [baseEmbed("Erreur", 0xff3344).setDescription("Impossible de configurer le salon.")],
        });
    }
}
async function handleAlertConfigThreshold(interaction) {
    await interaction.deferReply();
    try {
        const score = interaction.options.getInteger("score", true);
        await createLog({
            type: "CONFIG",
            action: `Seuil d'alerte modifié: ${score}`,
            moderator: interaction.user.id,
        });
        await interaction.editReply({
            embeds: [baseEmbed("Configuration", 0x53fc18)
                    .setDescription(`✅ Seuil d'alerte défini à **${score}**.\n\nℹ Note: Cette valeur est indicative, les alertes sont basées sur le niveau de risque calculé.`)],
        });
    }
    catch (error) {
        logger.error("[ALERTCONFIG THRESHOLD]:", error);
        await interaction.editReply({
            embeds: [baseEmbed("Erreur", 0xff3344).setDescription("Impossible de configurer le seuil.")],
        });
    }
}
async function handleAlertConfigOwnerNotify(interaction) {
    await interaction.deferReply();
    try {
        const actif = interaction.options.getBoolean("actif", true);
        await createLog({
            type: "CONFIG",
            action: `Notifications propriétaires: ${actif ? "ON" : "OFF"}`,
            moderator: interaction.user.id,
        });
        await interaction.editReply({
            embeds: [baseEmbed("Configuration", 0x53fc18)
                    .setDescription(`✅ Notifications propriétaires **${actif ? "activées" : "désactivées"}**.`)],
        });
    }
    catch (error) {
        logger.error("[ALERTCONFIG OWNER_NOTIFY]:", error);
        await interaction.editReply({
            embeds: [baseEmbed("Erreur", 0xff3344).setDescription("Impossible de configurer les notifications.")],
        });
    }
}
async function handleAlertConfigReset(interaction) {
    await interaction.deferReply();
    try {
        const user = interaction.options.getUser("cible", true);
        await resetRiskProfile(user.id, interaction.guildId);
        await createLog({
            type: "CONFIG",
            action: `Profil de risque réinitialisé: ${user.tag}`,
            moderator: interaction.user.id,
            userId: user.id,
        });
        await interaction.editReply({
            embeds: [baseEmbed("Configuration", 0x53fc18)
                    .setDescription(`✅ Profil de risque de ${user.tag} réinitialisé.`)],
        });
    }
    catch (error) {
        logger.error("[ALERTCONFIG RESET]:", error);
        await interaction.editReply({
            embeds: [baseEmbed("Erreur", 0xff3344).setDescription("Impossible de réinitialiser le profil.")],
        });
    }
}
async function handleAlertConfigView(interaction) {
    await interaction.deferReply();
    try {
        const config = await prisma.guildConfig.findUnique({
            where: { guildId: interaction.guildId },
        });
        const pendingAlerts = await getPendingAlerts(interaction.guildId);
        const riskyCount = await prisma.riskProfile.count({
            where: {
                guildId: interaction.guildId,
                riskLevel: { in: ["ELEVE", "CRITIQUE"] },
            },
        });
        const embed = baseEmbed("⚙ Configuration des Alertes", 0x3498db)
            .addFields({ name: "Salon d'alertes", value: config?.logChannelId ? `<#${config.logChannelId}>` : "Non configuré", inline: true }, { name: "Alertes en attente", value: `${pendingAlerts.length}`, inline: true }, { name: "Utilisateurs à risque", value: `${riskyCount}`, inline: true }, { name: "Anti-raid", value: config?.antiRaidEnabled ? "✅ Activé" : "❌ Désactivé", inline: true }, { name: "Anti-phishing", value: config?.antiPhishing ? "✅ Activé" : "❌ Désactivé", inline: true });
        await interaction.editReply({ embeds: [embed] });
    }
    catch (error) {
        logger.error("[ALERTCONFIG VIEW]:", error);
        await interaction.editReply({
            embeds: [baseEmbed("Erreur", 0xff3344).setDescription("Impossible d'afficher la configuration.")],
        });
    }
}
//# sourceMappingURL=alertcenter.js.map