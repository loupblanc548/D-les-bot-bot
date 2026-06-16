"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.commands = void 0;
exports.handleCommand = handleCommand;
const logger_1 = __importDefault(require("../utils/logger"));
const discord_js_1 = require("discord.js");
const permissions_1 = require("../services/permissions");
const dictation_1 = require("../services/dictation");
exports.commands = [
    new discord_js_1.SlashCommandBuilder()
        .setName("dictee")
        .setDescription("Dictée vocale : le bot écoute ta voix et écrit le texte à ta place")
        .addStringOption((option) => option
        .setName("action")
        .setDescription("Démarrer ou arrêter la dictée")
        .setRequired(true)
        .addChoices({ name: "▶️ Démarrer", value: "start" }, { name: "⏹️ Arrêter", value: "stop" }))
        .addChannelOption((option) => option
        .setName("salon")
        .setDescription("Salon où le texte sera envoyé (requis pour start)")
        .setRequired(true)
        .addChannelTypes(discord_js_1.ChannelType.GuildText))
        .toJSON(),
];
async function handleCommand(interaction, client) {
    if (!(await (0, permissions_1.requireAdmin)(interaction)))
        return;
    const action = interaction.options.getString("action", true);
    const userId = interaction.user.id;
    try {
        // ─── START ──────────────────────────────────────────
        if (action === "start") {
            const member = interaction.member;
            if (!member) {
                await interaction.reply({
                    content: "❌ Impossible de trouver ton membre sur ce serveur.",
                    flags: [discord_js_1.MessageFlags.Ephemeral],
                });
                return;
            }
            const voiceChannel = member.voice.channel;
            if (!voiceChannel) {
                await interaction.reply({
                    content: "❌ Tu dois être dans un salon vocal pour utiliser la dictée.",
                    flags: [discord_js_1.MessageFlags.Ephemeral],
                });
                return;
            }
            const targetChannel = interaction.options.getChannel("salon");
            if (!targetChannel || targetChannel.type !== discord_js_1.ChannelType.GuildText) {
                await interaction.reply({
                    content: "❌ Tu dois spécifier un salon textuel (option «salon») où le texte sera envoyé.",
                    flags: [discord_js_1.MessageFlags.Ephemeral],
                });
                return;
            }
            await interaction.deferReply({ flags: [discord_js_1.MessageFlags.Ephemeral] });
            try {
                await (0, dictation_1.startDictation)(voiceChannel.id, interaction.guildId, interaction.guild.voiceAdapterCreator, userId, interaction.user.displayName, targetChannel.id);
                await interaction.editReply({
                    content: "🎙️ **Dictée démarrée !** Je t'écoute... Parle dans le micro.\n" +
                        "Quand tu as fini, utilise `/dictee stop` pour envoyer le texte dans " +
                        `<#${targetChannel.id}>.`,
                });
            }
            catch (err) {
                await interaction.editReply({
                    content: "❌ " + (err.message || "Erreur de connexion vocale."),
                });
            }
            // ─── STOP ───────────────────────────────────────────
        }
        else if (action === "stop") {
            if (!(0, dictation_1.hasActiveSession)(userId)) {
                await interaction.reply({
                    content: "❌ Tu n'as pas de dictée en cours. Utilise `/dictee start` d'abord.",
                    flags: [discord_js_1.MessageFlags.Ephemeral],
                });
                return;
            }
            await interaction.deferReply({ flags: [discord_js_1.MessageFlags.Ephemeral] });
            const result = await (0, dictation_1.stopDictation)(userId);
            if (!result) {
                await interaction.editReply({
                    content: "❌ Aucune dictée trouvée.",
                });
                return;
            }
            // Envoyer le texte dans le salon cible
            try {
                const targetChan = await client.channels.fetch(result.targetChannelId);
                if (targetChan?.isTextBased()) {
                    await targetChan.send({
                        content: "🗣️ **Dictée vocale de " +
                            result.username +
                            " :**\n>>> " +
                            (result.text || "*(aucun texte détecté)*"),
                    });
                }
            }
            catch (chanErr) {
                logger_1.default.error("❌ [Dictation] Impossible d'envoyer dans le salon :", chanErr);
            }
            await interaction.editReply({
                content: "✅ **Dictée terminée !** Texte envoyé dans <#" +
                    result.targetChannelId +
                    ">.\n📊 **Transcription :** " +
                    (result.text
                        ? '"' +
                            result.text.substring(0, 300) +
                            (result.text.length > 300 ? "..." : "") +
                            '"'
                        : "*(aucun texte)*"),
            });
        }
    }
    catch (error) {
        logger_1.default.error("💥 [CRASH DICTEE] Erreur :", error);
        // Cleanup en cas d'erreur
        if (action === "start" || (0, dictation_1.hasActiveSession)(userId)) {
            (0, dictation_1.cancelDictation)(userId);
        }
        const msg = "❌ Une erreur est survenue pendant la dictée.";
        try {
            if (interaction.deferred) {
                await interaction.editReply({ content: msg });
            }
            else {
                await interaction.reply({ content: msg, flags: [discord_js_1.MessageFlags.Ephemeral] });
            }
        }
        catch {
            await interaction.followUp({ content: msg, flags: [discord_js_1.MessageFlags.Ephemeral] }).catch(() => { });
        }
    }
}
//# sourceMappingURL=dictee.js.map