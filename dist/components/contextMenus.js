"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MODERATION_CONTEXT_MENUS = exports.MESSAGE_CONTEXT_MENUS = exports.USER_CONTEXT_MENUS = exports.contextMenuSystem = void 0;
exports.registerDefaultContextMenus = registerDefaultContextMenus;
exports.createCustomContextMenu = createCustomContextMenu;
exports.registerModerationContextMenus = registerModerationContextMenus;
const discord_js_1 = require("discord.js");
const logger_1 = __importDefault(require("../utils/logger"));
class ContextMenuSystem {
    menus = new Map();
    /**
     * Enregistre un menu contextuel
     */
    registerMenu(config) {
        this.menus.set(config.name, config);
        logger_1.default.info(`[ContextMenu] Menu enregistré: ${config.name} (${config.type})`);
    }
    /**
     * Obtient un menu contextuel par son nom
     */
    getMenu(name) {
        return this.menus.get(name);
    }
    /**
     * Obtient tous les menus contextuels
     */
    getAllMenus() {
        return Array.from(this.menus.values());
    }
    /**
     * Obtient les menus par type
     */
    getMenusByType(type) {
        return Array.from(this.menus.values()).filter(menu => menu.type === type);
    }
    /**
     * Génère les builders Discord pour l'enregistrement
     */
    generateBuilders() {
        const builders = [];
        for (const [name, config] of this.menus.entries()) {
            const builder = new discord_js_1.ContextMenuCommandBuilder()
                .setName(name);
            if (config.type === "USER") {
                builder.setType(discord_js_1.ApplicationCommandType.User);
            }
            else {
                builder.setType(discord_js_1.ApplicationCommandType.Message);
            }
            if (config.permissions && config.permissions.length > 0) {
                builder.setDefaultMemberPermissions(config.permissions[0]);
            }
            builders.push(builder);
        }
        return builders;
    }
    /**
     * Gère l'exécution d'un menu contextuel
     */
    async handleInteraction(interaction) {
        const menu = this.menus.get(interaction.commandName);
        if (!menu) {
            logger_1.default.error(`[ContextMenu] Menu non trouvé: ${interaction.commandName}`);
            await interaction.reply({
                content: "❌ Menu non trouvé",
                ephemeral: true
            });
            return;
        }
        try {
            await menu.handler(interaction);
        }
        catch (error) {
            logger_1.default.error(`[ContextMenu] Erreur exécution ${interaction.commandName}: ${error}`);
            await interaction.reply({
                content: "❌ Erreur lors de l'exécution du menu",
                ephemeral: true
            });
        }
    }
}
// Instance singleton
exports.contextMenuSystem = new ContextMenuSystem();
/**
 * Menus contextuels prédéfinis pour les utilisateurs
 */
exports.USER_CONTEXT_MENUS = [
    {
        name: "Voir le profil",
        type: "USER",
        permissions: [discord_js_1.PermissionFlagsBits.SendMessages],
        handler: async (interaction) => {
            if (!interaction.isUserContextMenuCommand())
                return;
            const targetUser = interaction.targetUser;
            const member = await interaction.guild?.members.fetch(targetUser.id);
            const embed = new discord_js_1.EmbedBuilder()
                .setTitle(`👤 Profil de ${targetUser.username}`)
                .setColor(0x0099ff)
                .addFields({ name: "ID", value: targetUser.id, inline: true }, { name: "Créé le", value: targetUser.createdAt.toDateString(), inline: true }, { name: "Rejoint le", value: member?.joinedAt?.toDateString() || "N/A", inline: true }, { name: "Rôles", value: member?.roles.cache.map(r => r.name).join(", ") || "Aucun", inline: false })
                .setThumbnail(targetUser.displayAvatarURL())
                .setTimestamp();
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },
    {
        name: "Historique des commandes",
        type: "USER",
        permissions: [discord_js_1.PermissionFlagsBits.SendMessages],
        handler: async (interaction) => {
            if (!interaction.isUserContextMenuCommand())
                return;
            const targetUser = interaction.targetUser;
            await interaction.reply({
                content: `📊 Historique des commandes de ${targetUser.username}`,
                ephemeral: true
            });
        }
    },
    {
        name: "Signaler l'utilisateur",
        type: "USER",
        permissions: [discord_js_1.PermissionFlagsBits.ModerateMembers],
        handler: async (interaction) => {
            if (!interaction.isUserContextMenuCommand())
                return;
            const targetUser = interaction.targetUser;
            await interaction.reply({
                content: `🚨 Signalement de ${targetUser.username} envoyé aux modérateurs`,
                ephemeral: true
            });
        }
    }
];
/**
 * Menus contextuels prédéfinis pour les messages
 */
exports.MESSAGE_CONTEXT_MENUS = [
    {
        name: "Traduire le message",
        type: "MESSAGE",
        permissions: [discord_js_1.PermissionFlagsBits.SendMessages],
        handler: async (interaction) => {
            if (!interaction.isMessageContextMenuCommand())
                return;
            const targetMessage = interaction.targetMessage;
            await interaction.reply({
                content: `🌐 Traduction de: "${targetMessage.content.slice(0, 100)}..."`,
                ephemeral: true
            });
        }
    },
    {
        name: "Citer le message",
        type: "MESSAGE",
        permissions: [discord_js_1.PermissionFlagsBits.SendMessages],
        handler: async (interaction) => {
            if (!interaction.isMessageContextMenuCommand())
                return;
            const targetMessage = interaction.targetMessage;
            const author = targetMessage.author;
            await interaction.reply({
                content: `> ${author.username}: ${targetMessage.content}`,
                ephemeral: true
            });
        }
    },
    {
        name: "Signaler le message",
        type: "MESSAGE",
        permissions: [discord_js_1.PermissionFlagsBits.SendMessages],
        handler: async (interaction) => {
            if (!interaction.isMessageContextMenuCommand())
                return;
            const targetMessage = interaction.targetMessage;
            await interaction.reply({
                content: `🚨 Signalement du message envoyé aux modérateurs`,
                ephemeral: true
            });
        }
    },
    {
        name: "Analyser avec l'IA",
        type: "MESSAGE",
        permissions: [discord_js_1.PermissionFlagsBits.SendMessages],
        handler: async (interaction) => {
            if (!interaction.isMessageContextMenuCommand())
                return;
            const targetMessage = interaction.targetMessage;
            await interaction.reply({
                content: `🤖 Analyse IA du message en cours...`,
                ephemeral: true
            });
        }
    },
    {
        name: "Sauvegarder dans les notes",
        type: "MESSAGE",
        permissions: [discord_js_1.PermissionFlagsBits.SendMessages],
        handler: async (interaction) => {
            if (!interaction.isMessageContextMenuCommand())
                return;
            const targetMessage = interaction.targetMessage;
            await interaction.reply({
                content: `📝 Message sauvegardé dans vos notes`,
                ephemeral: true
            });
        }
    }
];
/**
 * Enregistre tous les menus contextuels prédéfinis
 */
function registerDefaultContextMenus() {
    for (const menu of exports.USER_CONTEXT_MENUS) {
        exports.contextMenuSystem.registerMenu(menu);
    }
    for (const menu of exports.MESSAGE_CONTEXT_MENUS) {
        exports.contextMenuSystem.registerMenu(menu);
    }
    logger_1.default.info(`[ContextMenu] ${exports.USER_CONTEXT_MENUS.length + exports.MESSAGE_CONTEXT_MENUS.length} menus par défaut enregistrés`);
}
/**
 * Crée un menu contextuel personnalisé
 */
function createCustomContextMenu(config) {
    exports.contextMenuSystem.registerMenu(config);
}
/**
 * Menus contextuels spécifiques pour la modération
 */
exports.MODERATION_CONTEXT_MENUS = [
    {
        name: "Bannir l'utilisateur",
        type: "USER",
        permissions: [discord_js_1.PermissionFlagsBits.BanMembers],
        handler: async (interaction) => {
            if (!interaction.isUserContextMenuCommand())
                return;
            const targetUser = interaction.targetUser;
            await interaction.reply({
                content: `⚠️ Action de bannissement pour ${targetUser.username} - Confirmation requise`,
                ephemeral: true
            });
        }
    },
    {
        name: "Muter l'utilisateur",
        type: "USER",
        permissions: [discord_js_1.PermissionFlagsBits.ModerateMembers],
        handler: async (interaction) => {
            if (!interaction.isUserContextMenuCommand())
                return;
            const targetUser = interaction.targetUser;
            await interaction.reply({
                content: `🔇 Action de mute pour ${targetUser.username} - Confirmation requise`,
                ephemeral: true
            });
        }
    },
    {
        name: "Kick l'utilisateur",
        type: "USER",
        permissions: [discord_js_1.PermissionFlagsBits.KickMembers],
        handler: async (interaction) => {
            if (!interaction.isUserContextMenuCommand())
                return;
            const targetUser = interaction.targetUser;
            await interaction.reply({
                content: `👢 Action de kick pour ${targetUser.username} - Confirmation requise`,
                ephemeral: true
            });
        }
    },
    {
        name: "Supprimer le message",
        type: "MESSAGE",
        permissions: [discord_js_1.PermissionFlagsBits.ManageMessages],
        handler: async (interaction) => {
            if (!interaction.isMessageContextMenuCommand())
                return;
            const targetMessage = interaction.targetMessage;
            await interaction.reply({
                content: `🗑️ Suppression du message - Confirmation requise`,
                ephemeral: true
            });
        }
    }
];
/**
 * Enregistre les menus contextuels de modération
 */
function registerModerationContextMenus() {
    for (const menu of exports.MODERATION_CONTEXT_MENUS) {
        exports.contextMenuSystem.registerMenu(menu);
    }
    logger_1.default.info(`[ContextMenu] ${exports.MODERATION_CONTEXT_MENUS.length} menus de modération enregistrés`);
}
//# sourceMappingURL=contextMenus.js.map