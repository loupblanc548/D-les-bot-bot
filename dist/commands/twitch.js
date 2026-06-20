import logger from "../utils/logger.js";
// Commandes Twitch — /twitch add|list|remove
import { MessageFlags, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, } from "discord.js";
import prisma from "../prisma.js";
const FOOTER = { text: "Surveillance System • Twitch" };
export const commands = [
    new SlashCommandBuilder()
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
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .toJSON(),
];
export async function handleCommand(interaction) {
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
        logger.error("[Twitch] Erreur:", err);
        const errorEmbed = new EmbedBuilder()
            .setColor(0xff3344)
            .setDescription("Une erreur est survenue.");
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            }
            else {
                await interaction.reply({ embeds: [errorEmbed], flags: [MessageFlags.Ephemeral] });
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
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    // Vérifier si déjà suivi
    const exists = await prisma.twitchFollow.findFirst({
        where: { guildId, streamerName: { equals: streamerName, mode: "insensitive" } },
    });
    if (exists) {
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xffaa00)
                    .setDescription(`**${streamerName}** est deja surveille.`),
            ],
        });
        return;
    }
    try {
        // Tenter de récupérer l'ID Twitch du streamer (nécessite le service Twitch)
        const { getStreamerByLogin } = await import("../services/twitch.js");
        const streamer = await getStreamerByLogin(streamerName);
        await prisma.twitchFollow.create({
            data: {
                guildId,
                channelId: channelId,
                streamerName: streamerName.toLowerCase(),
                streamerId: streamer?.id || streamerName.toLowerCase(),
                isLive: false,
                addedBy: interaction.user.id,
            },
        });
        const embed = new EmbedBuilder()
            .setColor(0x9146ff)
            .setTitle("Streamer ajoute")
            .setDescription(`**${streamerName}** est maintenant surveille.\n` +
            `Les notifications seront envoyees dans <#${channelId}>.`)
            .setFooter(FOOTER);
        await interaction.editReply({ embeds: [embed] });
    }
    catch {
        // Fallback sans vérification API
        await prisma.twitchFollow.create({
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
                new EmbedBuilder()
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
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const follows = await prisma.twitchFollow.findMany({
        where: { guildId },
        orderBy: { addedAt: "desc" },
    });
    if (follows.length === 0) {
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x2f3136)
                    .setDescription("Aucun streamer surveille. Ajoutez-en avec `/twitch add`."),
            ],
        });
        return;
    }
    const embed = new EmbedBuilder()
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
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const result = await prisma.twitchFollow.deleteMany({
        where: { guildId, streamerName: { equals: streamerName, mode: "insensitive" } },
    });
    if (result.count === 0) {
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xffaa00)
                    .setDescription(`**${streamerName}** n'est pas dans la liste de surveillance.`),
            ],
        });
        return;
    }
    await interaction.editReply({
        embeds: [
            new EmbedBuilder()
                .setColor(0x53fc18)
                .setDescription(`**${streamerName}** retire de la surveillance.`),
        ],
    });
}
//# sourceMappingURL=twitch.js.map