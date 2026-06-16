"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.commands = void 0;
exports.handleAutocomplete = handleAutocomplete;
exports.handleCommand = handleCommand;
const discord_js_1 = require("discord.js");
const path_1 = require("path");
const voice_1 = require("@discordjs/voice");
const config_1 = require("../config");
const audioPlayer_1 = require("../services/audioPlayer");
const logger_1 = __importDefault(require("../utils/logger"));
const fs_1 = require("fs");
const FOOTER = { text: "Système Audio • Owner Only" };
// Slash Command
exports.commands = [
    new discord_js_1.SlashCommandBuilder()
        .setName("mp3")
        .setDescription("Joue un fichier MP3 local (Owner Only)")
        .addStringOption((option) => option
        .setName("nom_du_son")
        .setDescription("Nom du fichier MP3 à jouer")
        .setRequired(true)
        .setAutocomplete(true))
        .toJSON(),
];
// Autocomplete
async function handleAutocomplete(interaction) {
    if (interaction.commandName !== "mp3")
        return;
    const focused = interaction.options.getFocused(true);
    if (focused.name !== "nom_du_son")
        return;
    const focusedValue = focused.value.toLowerCase();
    const files = (0, audioPlayer_1.listSoundFiles)();
    const filtered = focusedValue
        ? files
            .filter((f) => f.displayName.toLowerCase().includes(focusedValue))
            .slice(0, audioPlayer_1.AUTOCOMPLETE_LIMIT)
        : files.slice(0, audioPlayer_1.AUTOCOMPLETE_LIMIT);
    await interaction.respond(filtered.map((f) => ({ name: f.displayName.slice(0, 100), value: f.name })));
}
// Command Handler
async function handleCommand(interaction) {
    // Sécurité : Owner Only
    if (!config_1.config.ownerId || interaction.user.id !== config_1.config.ownerId) {
        if (!config_1.config.ownerId) {
            logger_1.default.warn("[MP3] OWNER_ID non configuré dans .env");
        }
        await interaction.reply({
            content: "🔒 Cette commande est réservée au propriétaire du bot.",
            flags: [discord_js_1.MessageFlags.Ephemeral],
        });
        return;
    }
    const soundName = interaction.options.getString("nom_du_son", true).trim();
    await interaction.deferReply({ flags: [discord_js_1.MessageFlags.Ephemeral] });
    try {
        const sound = (0, audioPlayer_1.findSoundFile)(soundName);
        if (!sound) {
            await interaction.editReply({
                content: `❌ Fichier **${soundName}** introuvable dans \`assets/sounds/\`.`,
            });
            return;
        }
        const member = interaction.member;
        const voiceChannel = member.voice.channel;
        if (!voiceChannel || !voiceChannel.joinable) {
            await interaction.editReply({
                content: "❌ Vous devez être dans un salon vocal accessible pour utiliser cette commande.",
            });
            return;
        }
        const filePath = (0, path_1.join)(audioPlayer_1.SOUNDS_DIR, sound.name);
        if (!(0, fs_1.existsSync)(filePath)) {
            logger_1.default.error(`[MP3] Fichier introuvable après vérification : ${filePath}`);
            await interaction.editReply({
                content: `❌ Le fichier \`${sound.name}\` est introuvable ou corrompu.`,
            });
            return;
        }
        // Nettoyer toute connexion existante
        const guildId = interaction.guildId;
        if (audioPlayer_1.activeConnections.has(guildId)) {
            (0, audioPlayer_1.cleanupConnection)(guildId);
        }
        // Rejoindre le vocal
        const connection = (0, voice_1.joinVoiceChannel)({
            channelId: voiceChannel.id,
            guildId,
            adapterCreator: interaction.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false,
        });
        audioPlayer_1.activeConnections.set(guildId, connection);
        // Attendre que la connexion soit prête
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("Timeout de connexion au salon vocal"));
            }, 10000);
            connection.once(voice_1.VoiceConnectionStatus.Ready, () => {
                clearTimeout(timeout);
                resolve();
            });
            connection.once(voice_1.VoiceConnectionStatus.Disconnected, () => {
                clearTimeout(timeout);
                (0, audioPlayer_1.cleanupConnection)(guildId);
                reject(new Error("Déconnecté du salon vocal"));
            });
        });
        // Créer l'AudioPlayer et la ressource
        const player = (0, voice_1.createAudioPlayer)({
            behaviors: { noSubscriber: voice_1.NoSubscriberBehavior.Pause },
        });
        const resource = (0, voice_1.createAudioResource)(filePath);
        audioPlayer_1.activePlayers.set(guildId, player);
        connection.subscribe(player);
        player.play(resource);
        logger_1.default.info(`[MP3] ▶ ${interaction.user.tag} joue "${sound.displayName}" (${sound.name})`);
        // Gérer la fin de lecture
        player.once(voice_1.AudioPlayerStatus.Idle, () => {
            logger_1.default.info(`[MP3] ■ Lecture terminée : "${sound.displayName}"`);
            setTimeout(() => {
                if (audioPlayer_1.activePlayers.get(guildId) === player &&
                    player.state.status === voice_1.AudioPlayerStatus.Idle) {
                    (0, audioPlayer_1.cleanupConnection)(guildId);
                    logger_1.default.info(`[MP3] 🔌 Déconnexion après ${audioPlayer_1.DISCONNECT_DELAY_MS / 1000}s d'inactivité`);
                }
            }, audioPlayer_1.DISCONNECT_DELAY_MS);
        });
        // Gérer les erreurs de lecture
        player.once("error", (error) => {
            logger_1.default.error(`[MP3] Erreur lecture "${sound.name}":`, String(error));
            (0, audioPlayer_1.cleanupConnection)(guildId);
            interaction
                .followUp({
                content: `❌ Erreur de lecture pour **${sound.displayName}** : ${String(error).slice(0, 100)}`,
                flags: [discord_js_1.MessageFlags.Ephemeral],
            })
                .catch(() => { });
        });
        // Embed de confirmation
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle("🔊 MP3")
            .setColor(0x9146ff)
            .setDescription(`▶ Lecture de **${sound.displayName}** en cours...`)
            .addFields({ name: "Fichier", value: `\`${sound.name}\``, inline: true }, { name: "Salon", value: `${voiceChannel.name}`, inline: true })
            .setFooter(FOOTER)
            .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
    }
    catch (error) {
        logger_1.default.error("[MP3] Erreur:", String(error));
        try {
            await interaction.editReply({
                content: `❌ Erreur lors de la lecture : ${String(error).slice(0, 150)}`,
            });
        }
        catch { }
    }
}
//# sourceMappingURL=mp3.js.map