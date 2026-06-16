"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PermissionLevel = void 0;
exports.getPermissionLevel = getPermissionLevel;
exports.requireAdmin = requireAdmin;
exports.requireMod = requireMod;
const discord_js_1 = require("discord.js");
const config_1 = require("../config");
const prisma_1 = __importDefault(require("../prisma"));
var PermissionLevel;
(function (PermissionLevel) {
    PermissionLevel[PermissionLevel["EVERYONE"] = 0] = "EVERYONE";
    PermissionLevel[PermissionLevel["MODERATOR"] = 1] = "MODERATOR";
    PermissionLevel[PermissionLevel["ADMIN"] = 2] = "ADMIN";
})(PermissionLevel || (exports.PermissionLevel = PermissionLevel = {}));
async function getPermissionLevel(member) {
    if (member.permissions.has(discord_js_1.PermissionFlagsBits.Administrator)) {
        return PermissionLevel.ADMIN;
    }
    const guildConfig = await prisma_1.default.guildConfig.findUnique({
        where: { guildId: member.guild.id },
    });
    if ((guildConfig?.adminRoleId && member.roles.cache.has(guildConfig.adminRoleId)) || config_1.config.adminRoles.some(r => member.roles.cache.has(r))) {
        return PermissionLevel.ADMIN;
    }
    if ((guildConfig?.modRoleId && member.roles.cache.has(guildConfig.modRoleId)) || config_1.config.modRoles.some(r => member.roles.cache.has(r))) {
        return PermissionLevel.MODERATOR;
    }
    return PermissionLevel.EVERYONE;
}
async function requireAdmin(interaction) {
    const member = interaction.member;
    if (!member) {
        await interaction.reply({
            content: "❌ Cette commande doit etre utilisee sur un serveur.",
            flags: [discord_js_1.MessageFlags.Ephemeral],
        });
        return false;
    }
    const level = await getPermissionLevel(member);
    if (level < PermissionLevel.ADMIN) {
        await interaction.reply({
            content: "❌ Cette commande est reservee aux administrateurs.",
            flags: [discord_js_1.MessageFlags.Ephemeral],
        });
        return false;
    }
    return true;
}
async function requireMod(interaction) {
    const member = interaction.member;
    if (!member) {
        await interaction.reply({
            content: "❌ Cette commande doit etre utilisee sur un serveur.",
            flags: [discord_js_1.MessageFlags.Ephemeral],
        });
        return false;
    }
    const level = await getPermissionLevel(member);
    if (level < PermissionLevel.MODERATOR) {
        await interaction.reply({
            content: "❌ Cette commande est reservee aux moderateurs et administrateurs.",
            flags: [discord_js_1.MessageFlags.Ephemeral],
        });
        return false;
    }
    return true;
}
//# sourceMappingURL=permissions.js.map