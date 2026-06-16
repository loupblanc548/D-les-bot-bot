"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleVerifButton = handleVerifButton;
const discord_js_1 = require("discord.js");
function handleVerifButton(interaction) {
    if (!interaction.customId.startsWith("verif_"))
        return false;
    const roleId = interaction.customId.split("_")[1];
    const role = interaction.guild?.roles.cache.get(roleId);
    if (!role) {
        interaction.reply({
            content: "❌ Rôle introuvable.",
            flags: [discord_js_1.MessageFlags.Ephemeral],
        });
        return true;
    }
    const member = interaction.member;
    if (!member) {
        interaction.reply({
            content: "❌ Impossible de vous identifier.",
            flags: [discord_js_1.MessageFlags.Ephemeral],
        });
        return true;
    }
    if (member.roles.cache.has(roleId)) {
        interaction.reply({
            content: "✅ Vous êtes déjà vérifié !",
            flags: [discord_js_1.MessageFlags.Ephemeral],
        });
        return true;
    }
    member.roles
        .add(role)
        .then(() => {
        interaction.reply({
            content: "✅ Vous avez reçu le rôle **" + role.name + "** !",
            flags: [discord_js_1.MessageFlags.Ephemeral],
        });
    })
        .catch(() => {
        interaction.reply({
            content: "❌ Erreur lors de l'attribution du rôle.",
            flags: [discord_js_1.MessageFlags.Ephemeral],
        });
    });
    return true;
}
//# sourceMappingURL=verifButton.js.map