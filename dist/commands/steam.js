"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.commands = void 0;
exports.handleCommand = handleCommand;
const logger_1 = __importDefault(require("../utils/logger"));
// Commandes Steam — /steam connect|nowplaying|wishlist
const discord_js_1 = require("discord.js");
const prisma_1 = __importDefault(require("../prisma"));
const steam_1 = require("../services/steam");
const config_1 = require("../config");
// Cache TTL pour handleNowPlaying (evite de fetch tous les membres a chaque appel)
const nowPlayingCache = new Map();
const CACHE_TTL_MS = 60_000; // 1 minute
const FOOTER = { text: "Surveillance System • Steam" };
exports.commands = [
    new discord_js_1.SlashCommandBuilder()
        .setName("steam")
        .setDescription("Gere la connexion Steam et affiche les statuts")
        .addSubcommand((sub) => sub
        .setName("connect")
        .setDescription("Lie ton compte Steam a ton profil Discord")
        .addStringOption((o) => o
        .setName("steam_id")
        .setDescription("Ton SteamID64 (17 chiffres) ou ton identifiant personnalise")
        .setRequired(true)))
        .addSubcommand((sub) => sub.setName("nowplaying").setDescription("Affiche a quoi jouent les membres du serveur"))
        .addSubcommand((sub) => sub
        .setName("wishlist")
        .setDescription("Affiche le lien vers la wishlist Steam d'un membre")
        .addUserOption((o) => o.setName("utilisateur").setDescription("Membre dont voir la wishlist").setRequired(false)))
        .addSubcommand((sub) => sub
        .setName("profile")
        .setDescription("Affiche le profil Steam d'un membre")
        .addUserOption((o) => o.setName("utilisateur").setDescription("Membre (defaut: toi)").setRequired(false)))
        .toJSON(),
];
async function handleCommand(interaction) {
    const sub = interaction.options.getSubcommand();
    // Verifier que la cle API Steam est configuree
    if (!config_1.config.steamApiKey) {
        await interaction.reply({
            embeds: [
                new discord_js_1.EmbedBuilder()
                    .setTitle(`Cle API Steam manquante`)
                    .setDescription(`La cle API Steam n'est pas configuree.
` +
                    `Ajoute **STEAM_API_KEY** dans ton fichier **.env**.
` +
                    `Obtenez-la sur : https://steamcommunity.com/dev/apikey`)
            ],
            flags: [discord_js_1.MessageFlags.Ephemeral],
        });
        return;
    }
    try {
        switch (sub) {
            case "connect":
                await handleConnect(interaction);
                break;
            case "nowplaying":
                await handleNowPlaying(interaction);
                break;
            case "wishlist":
                await handleWishlist(interaction);
                break;
            case "profile":
                await handleProfile(interaction);
                break;
        }
    }
    catch (err) {
        logger_1.default.error("[Steam] Erreur:", err);
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
async function handleConnect(interaction) {
    const input = interaction.options.getString("steam_id", true);
    const userId = interaction.user.id;
    await interaction.deferReply({ flags: [discord_js_1.MessageFlags.Ephemeral] });
    let steamId = null;
    // Vérifier si c'est un SteamID64 valide
    if ((0, steam_1.isValidSteamId)(input)) {
        steamId = input;
    }
    else {
        // Tenter de résoudre comme vanity URL
        steamId = await (0, steam_1.resolveVanityUrl)(input);
        if (!steamId) {
            await interaction.editReply({
                embeds: [
                    new discord_js_1.EmbedBuilder()
                        .setColor(0xffaa00)
                        .setDescription(`Impossible de resoudre **${input}**.\n` +
                        `Verifie que ton profil Steam est public et que l'identifiant est correct.\n` +
                        `Tu peux aussi utiliser ton SteamID64 (17 chiffres).`),
                ],
            });
            return;
        }
    }
    // Vérifier que le SteamID existe
    const players = await (0, steam_1.getPlayerSummaries)([steamId]);
    if (players.length === 0) {
        await interaction.editReply({
            embeds: [
                new discord_js_1.EmbedBuilder()
                    .setColor(0xff3344)
                    .setDescription(`Aucun profil Steam trouve pour l'ID **${steamId}**.`),
            ],
        });
        return;
    }
    const player = players[0];
    // Upsert le profil
    await prisma_1.default.steamProfile.upsert({
        where: { userId },
        update: { steamId, personaName: player.personaname, avatarUrl: player.avatarfull },
        create: {
            userId,
            steamId,
            personaName: player.personaname,
            avatarUrl: player.avatarfull,
        },
    });
    const embed = new discord_js_1.EmbedBuilder()
        .setColor(0x1b2838)
        .setTitle("Compte Steam lie !")
        .setURL(`https://steamcommunity.com/profiles/${steamId}`)
        .setDescription(`Ton compte Discord est maintenant lie a **${player.personaname}** sur Steam.\n` +
        `Tu peux utiliser /steam profile, /steam nowplaying et /steam wishlist.`)
        .setThumbnail(player.avatarfull || "")
        .addFields({ name: "Steam ID", value: steamId, inline: true }, { name: "Profil", value: player.personaname, inline: true })
        .setFooter(FOOTER);
    await interaction.editReply({ embeds: [embed] });
}
async function handleNowPlaying(interaction) {
    const guild = interaction.guild;
    await interaction.deferReply();
    // Recuperer les profils Steam (cache TTL 60s)
    const cacheNow = Date.now();
    const cacheKey = guild.id;
    const cached = nowPlayingCache.get(cacheKey);
    let members;
    let profiles;
    if (cached && cacheNow < cached.expiry) {
        members = cached.data.members;
        profiles = cached.data.profiles;
    }
    else {
        const fetchedMembers = await guild.members.fetch();
        const memberIds = [...fetchedMembers.keys()];
        const fetchedProfiles = await prisma_1.default.steamProfile.findMany({
            where: { userId: { in: memberIds } },
        });
        nowPlayingCache.set(cacheKey, { data: { members: fetchedMembers, profiles: fetchedProfiles }, expiry: cacheNow + CACHE_TTL_MS });
        members = fetchedMembers;
        profiles = fetchedProfiles;
    }
    if (profiles.length === 0) {
        await interaction.editReply({
            embeds: [
                new discord_js_1.EmbedBuilder()
                    .setColor(0x2f3136)
                    .setDescription("Aucun membre n'a lie son compte Steam. Utilise `/steam connect` !"),
            ],
        });
        return;
    }
    // Récupérer les statuts de jeu pour tous les profils liés
    const steamIds = profiles.map((p) => p.steamId);
    const players = await (0, steam_1.getPlayerSummaries)(steamIds);
    const playingNow = [];
    const idle = [];
    for (const player of players) {
        const profile = profiles.find((p) => p.steamId === player.steamid);
        const member = profile ? members.get(profile.userId) : null;
        const name = member?.displayName || profile?.personaName || player.personaname;
        if (player.gameextrainfo) {
            playingNow.push({
                member: name,
                game: player.gameextrainfo,
                steamId: player.steamid,
            });
        }
        else {
            idle.push(name);
        }
    }
    const embed = new discord_js_1.EmbedBuilder()
        .setColor(0x1b2838)
        .setTitle("En jeu sur Steam")
        .setTimestamp();
    if (playingNow.length > 0) {
        embed.setDescription(playingNow
            .map((p) => `**${p.member}** joue a **${p.game}**`)
            .join("\n"));
    }
    else {
        embed.setDescription("Personne n'est en jeu actuellement.");
    }
    if (idle.length > 0 && idle.length <= 15) {
        embed.addFields({
            name: "Hors-ligne / Inactif",
            value: idle.join(", "),
        });
    }
    else if (idle.length > 15) {
        embed.addFields({
            name: "Hors-ligne / Inactif",
            value: `${idle.length} membres`,
        });
    }
    embed.setFooter({ text: `${profiles.length} profils Steam lies • Surveillance System` });
    await interaction.editReply({ embeds: [embed] });
}
async function handleWishlist(interaction) {
    const user = interaction.options.getUser("utilisateur") || interaction.user;
    await interaction.deferReply();
    const profile = await prisma_1.default.steamProfile.findUnique({
        where: { userId: user.id },
    });
    if (!profile) {
        const isSelf = user.id === interaction.user.id;
        await interaction.editReply({
            embeds: [
                new discord_js_1.EmbedBuilder()
                    .setColor(0xffaa00)
                    .setDescription(isSelf
                    ? "Tu n'as pas lie ton compte Steam. Utilise `/steam connect` d'abord !"
                    : `**${user.tag}** n'a pas lie son compte Steam.`),
            ],
        });
        return;
    }
    const wishlistUrl = `https://store.steampowered.com/wishlist/profiles/${profile.steamId}`;
    const embed = new discord_js_1.EmbedBuilder()
        .setColor(0x1b2838)
        .setTitle(`Wishlist de ${profile.personaName || user.username}`)
        .setURL(wishlistUrl)
        .setDescription(`[Clique ici pour voir la wishlist Steam](${wishlistUrl})\n` +
        `⚠️ Le profil Steam doit etre **public** pour voir la wishlist.`)
        .setThumbnail(profile.avatarUrl || user.displayAvatarURL())
        .setFooter(FOOTER);
    await interaction.editReply({ embeds: [embed] });
}
async function handleProfile(interaction) {
    const user = interaction.options.getUser("utilisateur") || interaction.user;
    await interaction.deferReply();
    const profile = await prisma_1.default.steamProfile.findUnique({
        where: { userId: user.id },
    });
    if (!profile) {
        const isSelf = user.id === interaction.user.id;
        await interaction.editReply({
            embeds: [
                new discord_js_1.EmbedBuilder()
                    .setColor(0xffaa00)
                    .setDescription(isSelf
                    ? "Tu n'as pas lie ton compte Steam. Utilise `/steam connect` d'abord !"
                    : `**${user.tag}** n'a pas lie son compte Steam.`),
            ],
        });
        return;
    }
    const profileUrl = `https://steamcommunity.com/profiles/${profile.steamId}`;
    // Récupérer le statut actuel
    const players = await (0, steam_1.getPlayerSummaries)([profile.steamId]);
    const player = players[0];
    const embed = new discord_js_1.EmbedBuilder()
        .setColor(0x1b2838)
        .setTitle(`Profil Steam — ${profile.personaName || user.username}`)
        .setURL(profileUrl)
        .setThumbnail(player?.avatarfull || profile.avatarUrl || user.displayAvatarURL())
        .addFields({ name: "Steam ID", value: profile.steamId, inline: true }, {
        name: "Statut",
        value: player?.gameextrainfo
            ? `En jeu : **${player.gameextrainfo}**`
            : player?.personastate === 1
                ? "En ligne"
                : "Hors-ligne / Invisible",
        inline: true,
    }, { name: "Profil", value: `[Lien](${profileUrl})`, inline: true })
        .setFooter(FOOTER);
    await interaction.editReply({ embeds: [embed] });
}
//# sourceMappingURL=steam.js.map