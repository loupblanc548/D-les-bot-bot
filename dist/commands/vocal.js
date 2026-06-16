"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.commands = void 0;
exports.handleCommand = handleCommand;
const discord_js_1 = require("discord.js");
const voice_1 = require("@discordjs/voice");
const logger_1 = __importDefault(require("../utils/logger"));
const permissions_1 = require("../services/permissions");
const FOOTER = { text: "Système Vocal • v1.0.0" };
// ─── Définition de la commande ───────────────────────────────────────────────
exports.commands = [
    new discord_js_1.SlashCommandBuilder()
        .setName("vocal")
        .setDescription("Gérer la connexion vocale du bot")
        .addStringOption((option) => option
        .setName("action")
        .setDescription("Action à effectuer")
        .setRequired(true)
        .addChoices({ name: "🔊 Rejoindre", value: "rejoindre" }, { name: "🔇 Quitter", value: "quitter" }))
        .toJSON(),
];
// ─── Handler principal ────────────────────────────────────────────────────────
async function handleCommand(interaction) {
    if (!(await (0, permissions_1.requireAdmin)(interaction)))
        return;
    const action = interaction.options.getString("action", true);
    try {
        if (action === "rejoindre") {
            await handleJoin(interaction);
        }
        else if (action === "quitter") {
            await handleLeave(interaction);
        }
    }
    catch (error) {
        logger_1.default.error("[Vocal] Erreur:", String(error));
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({
                    content: `❌ Erreur : ${String(error).slice(0, 150)}`,
                });
            }
            else {
                await interaction.reply({
                    content: `❌ Erreur : ${String(error).slice(0, 150)}`,
                    flags: [discord_js_1.MessageFlags.Ephemeral],
                });
            }
        }
        catch { }
    }
}
// ─── /vocal rejoindre ────────────────────────────────────────────────────────
async function handleJoin(interaction) {
    await interaction.deferReply({ flags: [discord_js_1.MessageFlags.Ephemeral] });
    const member = interaction.member;
    const voiceChannel = member.voice.channel;
    if (!voiceChannel) {
        await interaction.editReply({
            content: "❌ Vous devez être dans un salon vocal pour utiliser cette commande.",
        });
        return;
    }
    if (!voiceChannel.joinable) {
        await interaction.editReply({
            content: "❌ Je n'ai pas la permission de rejoindre ce salon vocal.",
        });
        return;
    }
    const existing = (0, voice_1.getVoiceConnection)(interaction.guildId);
    if (existing) {
        logger_1.default.info("[Vocal] Connexion précédente détruite pour rejoindre un autre salon");
        if (existing.joinConfig.channelId === voiceChannel.id) {
            await interaction.editReply({
                content: `⚠️ Je suis déjà dans **${voiceChannel.name}** !`,
            });
            return;
        }
        existing.destroy();
    }
    const connection = (0, voice_1.joinVoiceChannel)({
        channelId: voiceChannel.id,
        guildId: interaction.guildId,
        adapterCreator: interaction.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false,
    });
    connection.once(voice_1.VoiceConnectionStatus.Disconnected, () => {
        logger_1.default.info("[Vocal] Déconnecté du salon vocal");
    });
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle("🔊 Connexion vocale")
        .setColor(0x57f287)
        .setDescription(`J'ai rejoint le salon vocal **${voiceChannel.name}** !`)
        .setFooter(FOOTER)
        .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
    logger_1.default.info(`[Vocal] ▶ ${interaction.user.tag} → rejoint "${voiceChannel.name}"`);
}
// ─── /vocal quitter ──────────────────────────────────────────────────────────
async function handleLeave(interaction) {
    await interaction.deferReply({ flags: [discord_js_1.MessageFlags.Ephemeral] });
    const connection = (0, voice_1.getVoiceConnection)(interaction.guildId);
    if (!connection) {
        await interaction.editReply({
            content: "⚠️ Je ne suis actuellement dans aucun salon vocal.",
        });
        return;
    }
    const channelName = connection.joinConfig.channelId ?? "inconnu";
    connection.destroy();
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle("🔇 Déconnexion vocale")
        .setColor(0xed4245)
        .setDescription("Je me suis déconnecté du salon vocal.")
        .setFooter(FOOTER)
        .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
    logger_1.default.info(`[Vocal] ■ ${interaction.user.tag} → quitté (salon ${channelName})`);
}
//# sourceMappingURL=vocal.js.map