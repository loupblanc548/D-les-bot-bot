"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestConfirmation = requestConfirmation;
const discord_js_1 = require("discord.js");
async function requestConfirmation(interaction, message, timeoutMs = 30000) {
    const confirmButton = new discord_js_1.ButtonBuilder()
        .setCustomId("confirm")
        .setLabel("✅ Confirmer")
        .setStyle(discord_js_1.ButtonStyle.Success);
    const cancelButton = new discord_js_1.ButtonBuilder()
        .setCustomId("cancel")
        .setLabel("❌ Annuler")
        .setStyle(discord_js_1.ButtonStyle.Danger);
    const row = new discord_js_1.ActionRowBuilder().addComponents(confirmButton, cancelButton);
    const response = await interaction.reply({
        content: `⚠️ **Confirmation requise**\n${message}`,
        components: [row],
        flags: [discord_js_1.MessageFlags.Ephemeral],
        fetchReply: true,
    });
    try {
        const collected = await response.awaitMessageComponent({
            filter: (i) => i.user.id === interaction.user.id,
            time: timeoutMs,
        });
        if (collected.customId === "confirm") {
            await collected.update({ content: "✅ Action confirmee.", components: [] }).catch(() => { });
            return true;
        }
        else {
            await collected.update({ content: "❌ Action annulee.", components: [] }).catch(() => { });
            return false;
        }
    }
    catch {
        await interaction.editReply({
            content: "⏰ Temps ecoule. Action annulee.",
            components: [],
        });
        return false;
    }
}
//# sourceMappingURL=confirm.js.map