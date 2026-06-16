"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.commands = void 0;
exports.handleCommand = handleCommand;
const logger_1 = __importDefault(require("../utils/logger"));
// Commandes Twitch — /twitch add|list|remove
const discord_js_1 = require("discord.js");
const prisma_1 = __importDefault(require("../prisma"));
const FOOTER = { text: "Surveillance System • Twitch" };
exports.commands = [
    new discord_js_1.SlashCommandBuilder()
        .setName("twitch")
        .setDescription("Gere les notifications de streamers Twitch")
        .addSubcommand((sub) => sub
        .setName("add")
        .setDescription("Ajoute un streamer a surveiller")
        .addStringOption((o) => o.setName("streamer").setDescription("Nom du streamer Twitch").setRequired(true))
        .addChannelOption((o) => o
        .setName("salon")
        .setDescription("Salon ou envoyer les notifications (defaut: salon Twitch configure)")
        .setRequired(false)))
        .addSubcommand((sub) => sub.setName("list").setDescription("Liste les streamers surveilles"))
        .addSubcommand((sub) => sub
        .setName("remove")
        .setDescription("Retire un streamer de la surveillance")
        .addStringOption((o) => o.setName("streamer").setDescription("Nom du streamer").setRequired(true)))
        .setDefaultMemberPermissions(discord_js_1.PermissionFlagsBits.ManageChannels)
        .toJSON(),
];
async function handleCommand(interaction) {
    const sub = interaction.options.getSubcommand();
    try {
        switch (sub) {
            case "add":
                await handleAdd(interaction);
                break;
            case "list":
                await handleList(interaction);
                break;
            case "remove":
                await handleRemove(interaction);
                break;
        }
    }
    catch (err) {
        logger_1.default.error("[Twitch] Erreur:", err);
        const errorEmbed = new discord_js_1.EmbedBuilder()
            .setColor(0xff3344)
            .setDescription("Une erreur est survenue.");
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            }
            else {
                await interaction.reply({ embeds: [errorEmbed], flags: [discord_js_1.MessageFlags.Ephemeral] });
            }
        }
        catch { /* ignore */ }
    }
}
async function handleAdd(interaction) {
    const streamerName = interaction.options.getString("streamer", true);
    const channel = interaction.options.getChannel("salon") || interaction.channel;
    const channelId = channel?.id || interaction.channelId;
    const guildId = interaction.guildId;
    await interaction.deferReply({ flags: [discord_js_1.MessageFlags.Ephemeral] });
    // Vérifier si déjà suivi
    const exists = await prisma_1.default.twitchFollow.findFirst({
        where: { guildId, streamerName: { equals: streamerName, mode: "insensitive" } },
    });
    if (exists) {
        await interaction.editReply({
            embeds: [
                new discord_js_1.EmbedBuilder()
                    .setColor(0xffaa00)
                    .setDescription(`**${streamerName}** est deja surveille.`),
            ],
        });
        return;
    }
    try {
        // Tenter de récupérer l'ID Twitch du streamer (nécessite le service Twitch)
        const { getStreamerByLogin } = await Promise.resolve().then(() => __importStar(require("../services/twitch")));
        const streamer = await getStreamerByLogin(streamerName);
        await prisma_1.default.twitchFollow.create({
            data: {
                guildId,
                channelId: channelId,
                streamerName: streamerName.toLowerCase(),
                streamerId: streamer?.id || streamerName.toLowerCase(),
                isLive: false,
                addedBy: interaction.user.id,
            },
        });
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(0x9146ff)
            .setTitle("Streamer ajoute")
            .setDescription(`**${streamerName}** est maintenant surveille.\n` +
            `Les notifications seront envoyees dans <#${channelId}>.`)
            .setFooter(FOOTER);
        await interaction.editReply({ embeds: [embed] });
    }
    catch {
        // Fallback sans vérification API
        await prisma_1.default.twitchFollow.create({
            data: {
                guildId,
                channelId: channelId,
                streamerName: streamerName.toLowerCase(),
                streamerId: streamerName.toLowerCase(),
                isLive: false,
                addedBy: interaction.user.id,
            },
        });
        await interaction.editReply({
            embeds: [
                new discord_js_1.EmbedBuilder()
                    .setColor(0x9146ff)
                    .setTitle("Streamer ajoute (mode degrade)")
                    .setDescription(`**${streamerName}** est maintenant surveille.\n` +
                    `⚠️ Verification Twitch API indisponible — le streamer sera surveille par nom.`)
                    .setFooter(FOOTER),
            ],
        });
    }
}
async function handleList(interaction) {
    const guildId = interaction.guildId;
    await interaction.deferReply({ flags: [discord_js_1.MessageFlags.Ephemeral] });
    const follows = await prisma_1.default.twitchFollow.findMany({
        where: { guildId },
        orderBy: { addedAt: "desc" },
    });
    if (follows.length === 0) {
        await interaction.editReply({
            embeds: [
                new discord_js_1.EmbedBuilder()
                    .setColor(0x2f3136)
                    .setDescription("Aucun streamer surveille. Ajoutez-en avec `/twitch add`."),
            ],
        });
        return;
    }
    const embed = new discord_js_1.EmbedBuilder()
        .setColor(0x9146ff)
        .setTitle("Streamers surveilles")
        .setDescription(follows
        .map((f) => `**${f.streamerName}** ${f.isLive ? "🔴 LIVE" : "⚫ Offline"}\n` +
        `> Salon : <#${f.channelId}> | Ajoute par <@${f.addedBy}>`)
        .join("\n\n"))
        .setFooter({ text: `${follows.length} streamer(s) surveille(s)` });
    await interaction.editReply({ embeds: [embed] });
}
async function handleRemove(interaction) {
    const streamerName = interaction.options.getString("streamer", true);
    const guildId = interaction.guildId;
    await interaction.deferReply({ flags: [discord_js_1.MessageFlags.Ephemeral] });
    const result = await prisma_1.default.twitchFollow.deleteMany({
        where: { guildId, streamerName: { equals: streamerName, mode: "insensitive" } },
    });
    if (result.count === 0) {
        await interaction.editReply({
            embeds: [
                new discord_js_1.EmbedBuilder()
                    .setColor(0xffaa00)
                    .setDescription(`**${streamerName}** n'est pas dans la liste de surveillance.`),
            ],
        });
        return;
    }
    await interaction.editReply({
        embeds: [
            new discord_js_1.EmbedBuilder()
                .setColor(0x53fc18)
                .setDescription(`**${streamerName}** retire de la surveillance.`),
        ],
    });
}
//# sourceMappingURL=twitch.js.map