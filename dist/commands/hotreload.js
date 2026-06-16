"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.data = void 0;
exports.execute = execute;
const discord_js_1 = require("discord.js");
const logger_1 = __importDefault(require("../utils/logger"));
const permissions_1 = require("../services/permissions");
const hot_reload_1 = require("../utils/hot-reload");
exports.data = new discord_js_1.SlashCommandBuilder()
    .setName("hotreload")
    .setDescription("Gestion du hot reload du bot (admin only)")
    .addSubcommand(subcommand => subcommand
    .setName("reload")
    .setDescription("Recharge les commandes et la configuration"))
    .addSubcommand(subcommand => subcommand
    .setName("maintenance")
    .setDescription("Active/désactive le mode maintenance")
    .addBooleanOption(option => option
    .setName("enable")
    .setDescription("Activer le mode maintenance")
    .setRequired(true)))
    .addSubcommand(subcommand => subcommand
    .setName("auto")
    .setDescription("Active/désactive le rechargement automatique")
    .addBooleanOption(option => option
    .setName("enable")
    .setDescription("Activer le rechargement automatique")
    .setRequired(true))
    .addIntegerOption(option => option
    .setName("interval")
    .setDescription("Intervalle en secondes (défaut: 300)")
    .setRequired(false)
    .setMinValue(60)
    .setMaxValue(3600)))
    .addSubcommand(subcommand => subcommand
    .setName("status")
    .setDescription("Affiche le statut du hot reload"));
async function execute(interaction, client) {
    await (0, permissions_1.requireAdmin)(interaction);
    const subcommand = interaction.options.getSubcommand();
    switch (subcommand) {
        case "reload":
            await handleReload(interaction, client);
            break;
        case "maintenance":
            await handleMaintenance(interaction, client);
            break;
        case "auto":
            await handleAuto(interaction, client);
            break;
        case "status":
            await handleStatus(interaction);
            break;
    }
}
async function handleReload(interaction, client) {
    await interaction.deferReply({ ephemeral: true });
    try {
        (0, hot_reload_1.reloadConfig)();
        await (0, hot_reload_1.reloadCommands)(client);
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle("🔄 Hot Reload")
            .setDescription("Commandes et configuration rechargées avec succès")
            .setColor(0x00ff00)
            .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
    }
    catch (error) {
        logger_1.default.error("[HotReload] Erreur lors du rechargement:", error);
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle("❌ Erreur")
            .setDescription(`Erreur lors du rechargement: ${String(error)}`)
            .setColor(0xff0000)
            .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
    }
}
async function handleMaintenance(interaction, client) {
    const enable = interaction.options.getBoolean("enable", true);
    await interaction.deferReply({ ephemeral: true });
    try {
        if (enable) {
            await (0, hot_reload_1.enableMaintenanceMode)(client);
            const embed = new discord_js_1.EmbedBuilder()
                .setTitle("🔧 Mode Maintenance")
                .setDescription("Mode maintenance activé. Les commandes sont désactivées.")
                .setColor(0xffaa00)
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });
        }
        else {
            await (0, hot_reload_1.disableMaintenanceMode)(client);
            const embed = new discord_js_1.EmbedBuilder()
                .setTitle("✅ Mode Normal")
                .setDescription("Mode maintenance désactivé. Les commandes sont réactivées.")
                .setColor(0x00ff00)
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });
        }
    }
    catch (error) {
        logger_1.default.error("[HotReload] Erreur lors du changement de mode:", error);
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle("❌ Erreur")
            .setDescription(`Erreur: ${String(error)}`)
            .setColor(0xff0000)
            .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
    }
}
async function handleAuto(interaction, client) {
    const enable = interaction.options.getBoolean("enable", true);
    const intervalSeconds = interaction.options.getInteger("interval") || 300;
    await interaction.deferReply({ ephemeral: true });
    try {
        if (enable) {
            (0, hot_reload_1.enableAutoReload)(client, intervalSeconds * 1000);
            const embed = new discord_js_1.EmbedBuilder()
                .setTitle("🔄 Auto-Reload Activé")
                .setDescription(`Rechargement automatique toutes les ${intervalSeconds} secondes`)
                .setColor(0x00ff00)
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });
        }
        else {
            (0, hot_reload_1.disableAutoReload)();
            const embed = new discord_js_1.EmbedBuilder()
                .setTitle("⏹️ Auto-Reload Désactivé")
                .setDescription("Rechargement automatique désactivé")
                .setColor(0xffaa00)
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });
        }
    }
    catch (error) {
        logger_1.default.error("[HotReload] Erreur lors du changement d'auto-reload:", error);
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle("❌ Erreur")
            .setDescription(`Erreur: ${String(error)}`)
            .setColor(0xff0000)
            .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
    }
}
async function handleStatus(interaction) {
    const status = (0, hot_reload_1.getHotReloadStatus)();
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle("📊 Statut Hot Reload")
        .addFields({
        name: "Rechargement en cours",
        value: status.isReloading ? "✅ Oui" : "❌ Non",
        inline: true,
    }, {
        name: "Auto-reload",
        value: status.autoReloadEnabled ? "✅ Activé" : "❌ Désactivé",
        inline: true,
    })
        .setColor(0x00ff00)
        .setTimestamp();
    await interaction.reply({ embeds: [embed], ephemeral: true });
}
//# sourceMappingURL=hotreload.js.map