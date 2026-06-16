"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.commands = void 0;
exports.handleCommand = handleCommand;
const discord_js_1 = require("discord.js");
const logger_1 = __importDefault(require("../../utils/logger"));
const handlers_1 = require("./handlers");
exports.commands = [
    new discord_js_1.SlashCommandBuilder()
        .setName("lockdown")
        .setDescription("Verrouille ou déverrouille tous les salons textuels du serveur")
        .addStringOption((opt) => opt
        .setName("action")
        .setDescription("Activer ou désactiver le lockdown")
        .setRequired(true)
        .addChoices({ name: "Verrouiller (Activer)", value: "on" }, { name: "Déverrouiller (Désactiver)", value: "off" }))
        .setDefaultMemberPermissions(discord_js_1.PermissionFlagsBits.ManageChannels)
        .toJSON(),
    new discord_js_1.SlashCommandBuilder()
        .setName("nuke")
        .setDescription("Clone le salon actuel et supprime l'ancien pour effacer le spam")
        .setDefaultMemberPermissions(discord_js_1.PermissionFlagsBits.ManageChannels)
        .toJSON(),
    new discord_js_1.SlashCommandBuilder()
        .setName("check-alt")
        .setDescription("Liste les comptes récemment créés ayant rejoint le serveur")
        .addIntegerOption((opt) => opt
        .setName("heures")
        .setDescription("Âge max du compte en heures (défaut: 24h)")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(720))
        .setDefaultMemberPermissions(discord_js_1.PermissionFlagsBits.ModerateMembers)
        .toJSON(),
    new discord_js_1.SlashCommandBuilder()
        .setName("blacklist")
        .setDescription("Ajoute ou retire un utilisateur/serveur de la liste noire (Owner)")
        .addStringOption((opt) => opt
        .setName("action")
        .setDescription("Ajouter ou retirer")
        .setRequired(true)
        .addChoices({ name: "Ajouter", value: "add" }, { name: "Retirer", value: "remove" }))
        .addStringOption((opt) => opt
        .setName("cible")
        .setDescription("Type de cible à blacklister")
        .setRequired(true)
        .addChoices({ name: "Utilisateur", value: "user" }, { name: "Serveur", value: "guild" }))
        .addStringOption((opt) => opt.setName("id").setDescription("ID Discord de la cible").setRequired(true))
        .toJSON(),
    new discord_js_1.SlashCommandBuilder()
        .setName("role-mass")
        .setDescription("Ajoute ou retire un rôle à tous les membres du serveur")
        .addStringOption((opt) => opt
        .setName("action")
        .setDescription("Ajouter ou retirer le rôle")
        .setRequired(true)
        .addChoices({ name: "Ajouter", value: "add" }, { name: "Retirer", value: "remove" }))
        .addRoleOption((opt) => opt.setName("rôle").setDescription("Le rôle cible").setRequired(true))
        .setDefaultMemberPermissions(discord_js_1.PermissionFlagsBits.Administrator)
        .toJSON(),
    // /antiraid
    new discord_js_1.SlashCommandBuilder()
        .setName("antiraid")
        .setDescription("Active/desactive le mode anti-raid")
        .addStringOption((o) => o.setName("action").setDescription("Action").setRequired(true)
        .addChoices({ name: "Activer", value: "on" }, { name: "Desactiver", value: "off" }, { name: "Statut", value: "status" }))
        .addIntegerOption((o) => o.setName("seuil_heures").setDescription("Age max du compte en heures (defaut: 24)").setRequired(false)
        .setMinValue(1).setMaxValue(168))
        .setDefaultMemberPermissions(discord_js_1.PermissionFlagsBits.Administrator)
        .toJSON(),
    // /verif
    new discord_js_1.SlashCommandBuilder()
        .setName("verif")
        .setDescription("Cree un panneau de verification par bouton")
        .addRoleOption((o) => o.setName("role").setDescription("Role a donner apres verification").setRequired(true))
        .setDefaultMemberPermissions(discord_js_1.PermissionFlagsBits.Administrator)
        .toJSON(),
    // /namehistory
    new discord_js_1.SlashCommandBuilder()
        .setName("namehistory")
        .setDescription("Affiche l'historique des changements de pseudo d'un utilisateur")
        .addUserOption((o) => o.setName("utilisateur").setDescription("Utilisateur cible").setRequired(true))
        .setDefaultMemberPermissions(discord_js_1.PermissionFlagsBits.ModerateMembers)
        .toJSON(),
    // /avatarhistory
    new discord_js_1.SlashCommandBuilder()
        .setName("avatarhistory")
        .setDescription("Affiche l'historique des changements d'avatar d'un utilisateur")
        .addUserOption((o) => o.setName("utilisateur").setDescription("Utilisateur cible").setRequired(true))
        .setDefaultMemberPermissions(discord_js_1.PermissionFlagsBits.ModerateMembers)
        .toJSON(),
    // /linkcheck
    new discord_js_1.SlashCommandBuilder()
        .setName("linkcheck")
        .setDescription("Verifie si un lien est suspect (phishing, malware, etc.)")
        .addStringOption((o) => o.setName("url").setDescription("URL a verifier").setRequired(true))
        .toJSON(),
    // /antiphishing
];
// ===== Handler principal =====
async function handleCommand(interaction, client) {
    try {
        switch (interaction.commandName) {
            case "lockdown":
                await (0, handlers_1.handleLockdown)(interaction);
                break;
            case "nuke":
                await (0, handlers_1.handleNuke)(interaction);
                break;
            case "check-alt":
                await (0, handlers_1.handleCheckAlt)(interaction);
                break;
            case "blacklist":
                await (0, handlers_1.handleBlacklist)(interaction, client);
                break;
            case "role-mass":
                await (0, handlers_1.handleRoleMass)(interaction);
                break;
            case "antiraid":
                await (0, handlers_1.handleAntiraid)(interaction);
                break;
            case "verif":
                await (0, handlers_1.handleVerif)(interaction);
                break;
            case "namehistory":
                await (0, handlers_1.handleNameHistory)(interaction);
                break;
            case "avatarhistory":
                await (0, handlers_1.handleAvatarHistory)(interaction);
                break;
            case "linkcheck":
                await (0, handlers_1.handleLinkCheck)(interaction);
                break;
            case "antiphishing":
                await (0, handlers_1.handleAntiphishing)(interaction);
                break;
        }
    }
    catch (err) {
        logger_1.default.error("[Security] Erreur:", err);
        const errorEmbed = new discord_js_1.EmbedBuilder()
            .setColor(0xff3344)
            .setDescription("Une erreur est survenue lors de l'exécution de la commande.");
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            }
            else {
                await interaction.reply({ embeds: [errorEmbed], flags: [discord_js_1.MessageFlags.Ephemeral] });
            }
        }
        catch {
            // silencieux
        }
    }
}
//# sourceMappingURL=core.js.map