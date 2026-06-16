"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.commands = void 0;
exports.handleAutocomplete = handleAutocomplete;
exports.handleCommand = handleCommand;
const discord_js_1 = require("discord.js");
const prisma_1 = __importDefault(require("../prisma"));
const config_1 = require("../config");
const logger_1 = __importDefault(require("../utils/logger"));
const steamNewsService_1 = require("../services/steamNewsService");
const FOOTER = { text: "Système de Surveillance • Steam News Tracker" };
// ─── Définitions des commandes Slash ─────────────────────────────────────────
exports.commands = [
    new discord_js_1.SlashCommandBuilder()
        .setName("track-game")
        .setDescription("Surveiller les actualités d'un jeu Steam")
        .addStringOption((option) => option
        .setName("jeu")
        .setDescription("Nom du jeu à suivre")
        .setRequired(true)
        .setMinLength(2)
        .setMaxLength(200))
        .toJSON(),
    new discord_js_1.SlashCommandBuilder()
        .setName("untrack-game")
        .setDescription("Retirer un jeu de la surveillance Steam")
        .addStringOption((option) => option
        .setName("jeu")
        .setDescription("Nom du jeu à retirer")
        .setRequired(true)
        .setAutocomplete(true))
        .toJSON(),
    new discord_js_1.SlashCommandBuilder()
        .setName("list-tracked")
        .setDescription("Lister tous les jeux surveillés")
        .toJSON(),
];
// ─── Autocomplete pour /untrack-game ─────────────────────────────────────────
async function handleAutocomplete(interaction) {
    if (interaction.commandName !== "untrack-game")
        return;
    const focused = interaction.options.getFocused(true);
    if (focused.name !== "jeu")
        return;
    const focusedValue = focused.value.toLowerCase();
    const games = await prisma_1.default.trackedGame.findMany({
        orderBy: { gameName: "asc" },
    });
    const filtered = focusedValue
        ? games
            .filter((g) => g.gameName.toLowerCase().includes(focusedValue))
            .slice(0, 25)
        : games.slice(0, 25);
    await interaction.respond(filtered.map((g) => ({ name: g.gameName.slice(0, 100), value: g.gameName })));
}
// ─── Handler principal ────────────────────────────────────────────────────────
async function handleCommand(interaction) {
    const { commandName } = interaction;
    switch (commandName) {
        case "track-game":
            await handleTrackGame(interaction);
            break;
        case "untrack-game":
            await handleUntrackGame(interaction);
            break;
        case "list-tracked":
            await handleListTracked(interaction);
            break;
    }
}
// ─── /track-game ─────────────────────────────────────────────────────────────
async function handleTrackGame(interaction) {
    const gameName = interaction.options.getString("jeu", true).trim();
    await interaction.deferReply({ flags: [discord_js_1.MessageFlags.Ephemeral] });
    try {
        const match = await (0, steamNewsService_1.findAppIdByName)(gameName);
        if (!match) {
            await interaction.editReply({
                content: `❌ Jeu **${gameName}** introuvable dans la base Steam.\nVérifie l'orthographe ou utilise le nom exact du jeu.`,
            });
            return;
        }
        const existing = await prisma_1.default.trackedGame.findFirst({
            where: { appId: match.appid },
        });
        if (existing) {
            await interaction.editReply({
                content: `⚠️ **${match.name}** (AppID ${match.appid}) est déjà surveillé !\nDernière news détectée le ${existing.lastNewsDate.toLocaleString()}.`,
            });
            return;
        }
        const latestNews = await (0, steamNewsService_1.getLatestNews)(match.appid);
        const lastNewsDate = latestNews?.date ?? new Date();
        const tracked = await prisma_1.default.trackedGame.create({
            data: { appId: match.appid, gameName: match.name, lastNewsDate },
        });
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle("🎮 Jeu ajouté à la surveillance")
            .setColor(0x2a475e)
            .setDescription(`Les actualités de **${match.name}** seront désormais surveillées automatiquement.`)
            .addFields({ name: "AppID", value: `${match.appid}`, inline: true }, { name: "Score de correspondance", value: `${match.score}/1000`, inline: true }, {
            name: "Dernière news",
            value: latestNews
                ? `[${latestNews.title}](${latestNews.url}) — ${latestNews.date.toLocaleDateString()}`
                : "Aucune news détectée",
            inline: false,
        }, { name: "Salon de publication", value: `<#${config_1.config.steamChannel || "non configuré"}>`, inline: true })
            .setFooter(FOOTER)
            .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
        logger_1.default.info(`[TrackGame] ${match.name} (${match.appid}) ajouté à la surveillance`);
    }
    catch (error) {
        logger_1.default.error("[TrackGame] Erreur:", String(error));
        try {
            await interaction.editReply({ content: "❌ Une erreur est survenue lors de l'ajout du jeu." });
        }
        catch { }
    }
}
// ─── /untrack-game ───────────────────────────────────────────────────────────
async function handleUntrackGame(interaction) {
    const gameName = interaction.options.getString("jeu", true).trim();
    await interaction.deferReply({ flags: [discord_js_1.MessageFlags.Ephemeral] });
    try {
        const tracked = await prisma_1.default.trackedGame.findFirst({
            where: { gameName },
        });
        if (!tracked) {
            await interaction.editReply({
                content: `❌ **${gameName}** n'est pas dans la liste des jeux surveillés.`,
            });
            return;
        }
        await prisma_1.default.trackedGame.delete({ where: { id: tracked.id } });
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle("🗑️ Jeu retiré de la surveillance")
            .setColor(0xff4444)
            .setDescription(`**${tracked.gameName}** (AppID ${tracked.appId}) ne sera plus surveillé.`)
            .addFields({
            name: "Supprimé le",
            value: new Date().toLocaleString(),
            inline: true,
        })
            .setFooter(FOOTER)
            .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
        logger_1.default.info(`[TrackGame] ${tracked.gameName} (${tracked.appId}) retiré de la surveillance`);
    }
    catch (error) {
        logger_1.default.error("[TrackGame] Erreur untrack:", String(error));
        try {
            await interaction.editReply({ content: "❌ Une erreur est survenue lors de la suppression." });
        }
        catch { }
    }
}
// ─── /list-tracked ───────────────────────────────────────────────────────────
async function handleListTracked(interaction) {
    await interaction.deferReply({ flags: [discord_js_1.MessageFlags.Ephemeral] });
    try {
        const games = await prisma_1.default.trackedGame.findMany({
            orderBy: { gameName: "asc" },
        });
        if (games.length === 0) {
            await interaction.editReply({
                content: "📭 Aucun jeu n'est actuellement surveillé.\nUtilise `/track-game [jeu]` pour commencer !",
            });
            return;
        }
        const description = games
            .map((g) => `• **${g.gameName}** (AppID ${g.appId}) — Dernière news : ${g.lastNewsDate.toLocaleDateString()}`)
            .join("\n");
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(`📋 Jeux surveillés (${games.length})`)
            .setColor(0x2a475e)
            .setDescription(description.length > 4096 ? description.slice(0, 4093) + "..." : description)
            .addFields({
            name: "Salon de publication",
            value: `<#${config_1.config.steamChannel || "non configuré"}>`,
            inline: false,
        })
            .setFooter(FOOTER)
            .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
    }
    catch (error) {
        logger_1.default.error("[TrackGame] Erreur list:", String(error));
        try {
            await interaction.editReply({ content: "❌ Une erreur est survenue lors du listage." });
        }
        catch { }
    }
}
//# sourceMappingURL=trackGame.js.map