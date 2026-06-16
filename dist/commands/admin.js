"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.commands = void 0;
exports.handleCommand = handleCommand;
const logger_1 = __importDefault(require("../utils/logger"));
const discord_js_1 = require("discord.js");
const prisma_1 = __importDefault(require("../prisma"));
const permissions_1 = require("../services/permissions");
const logs_1 = require("../services/logs");
const confirm_1 = require("../utils/confirm");
exports.commands = [
    new discord_js_1.SlashCommandBuilder()
        .setName("broadcast")
        .setDescription("Envoie un message a tous les membres (admin)")
        .addStringOption((opt) => opt
        .setName("message")
        .setDescription("Le message a envoyer")
        .setRequired(true))
        .toJSON(),
    new discord_js_1.SlashCommandBuilder()
        .setName("dm")
        .setDescription("Envoie un DM sous l'identite du bot (admin)")
        .addUserOption((opt) => opt
        .setName("utilisateur")
        .setDescription("L'utilisateur a contacter")
        .setRequired(true))
        .addStringOption((opt) => opt
        .setName("message")
        .setDescription("Le message a envoyer")
        .setRequired(true))
        .toJSON(),
    new discord_js_1.SlashCommandBuilder()
        .setName("logs")
        .setDescription("Affiche le resume des logs")
        .addStringOption((opt) => opt
        .setName("type")
        .setDescription("Type de log a afficher")
        .setRequired(false)
        .addChoices({ name: "Membres", value: "member" }, { name: "Moderation", value: "moderation" }, { name: "Salons", value: "channel" }, { name: "Roles", value: "role" }, { name: "Emojis", value: "emoji" }, { name: "Messages", value: "message" }))
        .toJSON(),
    new discord_js_1.SlashCommandBuilder()
        .setName("deletehistory")
        .setDescription("Supprime les notifications enregistrees (confirmation requise)")
        .toJSON(),
    // /test-freegames : envoie un message de test dans FREE_GAMES_CHANNEL_ID
    new discord_js_1.SlashCommandBuilder()
        .setName("test-freegames")
        .setDescription("Envoie un message de test dans le salon FREE_GAMES_CHANNEL_ID pour valider la configuration")
        .setDefaultMemberPermissions(discord_js_1.PermissionFlagsBits.Administrator)
        .toJSON(),
];
async function handleCommand(interaction) {
    const { commandName } = interaction;
    switch (commandName) {
        case "broadcast":
            await handleBroadcast(interaction);
            break;
        case "dm":
            await handleDM(interaction);
            break;
        case "logs":
            await handleLogs(interaction);
            break;
        case "deletehistory":
            await handleDeleteHistory(interaction);
        case "test-freegames":
            await handleTestFreeGames(interaction);
            break;
            break;
    }
}
async function handleBroadcast(interaction) {
    // Permissions et confirmation AVANT deferReply (utilisent reply() en interne)
    if (!(await (0, permissions_1.requireAdmin)(interaction)))
        return;
    const message = interaction.options.get("message", true).value;
    const guild = interaction.guild;
    if (!guild) {
        await interaction.reply({ content: "Cette commande doit etre utilisee sur un serveur." });
        return;
    }
    const confirmed = await (0, confirm_1.requestConfirmation)(interaction, "Envoyer le message suivant a **tous les membres** ?\n\n> " + message);
    if (!confirmed)
        return;
    // requestConfirmation deja gere l'interaction → utiliser followUp
    try {
        let sentCount = 0;
        let failCount = 0;
        const members = await guild.members.fetch();
        for (const [, member] of members) {
            if (member.user.bot)
                continue;
            try {
                await member.send({ content: "**Message de l'administration**\n\n" + message });
                sentCount++;
                await new Promise((r) => setTimeout(r, 500));
            }
            catch {
                failCount++;
            }
        }
        await interaction.followUp({
            content: "Broadcast termine : **" + sentCount + "** envoyes, **" + failCount + "** echoues.",
            ephemeral: true,
        });
    }
    catch (error) {
        logger_1.default.error("[CRASH COMMANDE BROADCAST]:", error);
        try {
            await interaction.followUp({ content: "Impossible de terminer le broadcast.", ephemeral: true });
        }
        catch { }
    }
}
async function handleDM(interaction) {
    // Permissions AVANT deferReply
    if (!(await (0, permissions_1.requireAdmin)(interaction)))
        return;
    const user = interaction.options.getUser("utilisateur", true);
    if (!user) {
        await interaction.reply({ content: "Utilisateur introuvable.", ephemeral: true });
        return;
    }
    const message = interaction.options.get("message", true).value;
    await interaction.deferReply({ ephemeral: true });
    try {
        await user.send({ content: "**Message de l'administration**\n\n" + message });
        await interaction.editReply({ content: "DM envoye a **" + user.tag + "**." });
    }
    catch (error) {
        logger_1.default.error("[CRASH COMMANDE DM]:", error);
        try {
            await interaction.editReply({
                content: "Impossible d'envoyer un DM a " + user.tag + ". L'utilisateur a peut-etre desactive les DMs.",
            });
        }
        catch {
            try {
                await interaction.followUp({ content: "Impossible d'envoyer le DM.", ephemeral: true });
            }
            catch { }
        }
    }
}
async function handleLogs(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
        const typeFilter = interaction.options.get("type")?.value;
        let logs;
        if (typeFilter) {
            logs = await prisma_1.default.log.findMany({
                where: { type: { contains: typeFilter } },
                orderBy: { createdAt: "desc" },
                take: 25,
            });
        }
        else {
            logs = await (0, logs_1.getLogs)(25);
        }
        if (logs.length === 0) {
            await interaction.editReply({ content: "Aucun log trouve." });
            return;
        }
        const logLines = logs.map((l) => {
            const time = l.createdAt.toLocaleTimeString("fr-FR");
            return "[ " + time + " ] **" + l.type + "** - " + l.action;
        });
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle("Logs" + (typeFilter ? " - " + typeFilter : ""))
            .setColor(0x2f3136)
            .setDescription(logLines.join("\n").slice(0, 4000) || "Aucun log")
            .setFooter({ text: "Systeme de Surveillance - v1.0.0" })
            .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
    }
    catch (error) {
        logger_1.default.error("[CRASH COMMANDE LOGS]:", error);
        try {
            await interaction.editReply({ content: "Impossible d'afficher les logs." });
        }
        catch {
            try {
                await interaction.followUp({ content: "Impossible d'afficher les logs.", ephemeral: true });
            }
            catch { }
        }
    }
}
async function handleDeleteHistory(interaction) {
    // Permissions et confirmation AVANT deferReply
    if (!(await (0, permissions_1.requireAdmin)(interaction)))
        return;
    const notifCount = await prisma_1.default.notification.count();
    if (notifCount === 0) {
        await interaction.reply({ content: "Aucune notification a supprimer.", ephemeral: true });
        return;
    }
    const confirmed = await (0, confirm_1.requestConfirmation)(interaction, "Supprimer **" + notifCount + "** notifications enregistrees ? Cette action est irreversible.");
    if (!confirmed)
        return;
    // requestConfirmation deja gere l'interaction → utiliser followUp
    try {
        await prisma_1.default.notification.deleteMany({});
        await interaction.followUp({
            content: "**" + notifCount + "** notifications supprimees.",
            ephemeral: true,
        });
    }
    catch (error) {
        logger_1.default.error("[CRASH COMMANDE DELETEHISTORY]:", error);
        try {
            await interaction.followUp({ content: "Impossible de supprimer les notifications.", ephemeral: true });
        }
        catch { }
    }
}
// ===== /test-freegames =====
async function handleTestFreeGames(interaction) {
    await interaction.deferReply({ flags: [discord_js_1.MessageFlags.Ephemeral] });
    // 1. Vérifier que FREE_GAMES_CHANNEL_ID est configuré
    const channelId = process.env.FREE_GAMES_CHANNEL_ID;
    if (!channelId) {
        await interaction.editReply({
            embeds: [
                new discord_js_1.EmbedBuilder()
                    .setColor(0xff3344)
                    .setTitle("❌ Configuration manquante")
                    .setDescription("La variable d'environnement **FREE_GAMES_CHANNEL_ID** n'est pas définie.\n\n" +
                    "Ajoute-la dans ton fichier `.env` puis redémarre le bot.\n" +
                    "Voir `FREE_GAMES_SETUP.md` pour la procédure complète."),
            ],
        });
        return;
    }
    // 2. Récupérer le salon
    const channel = await interaction.client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
        await interaction.editReply({
            embeds: [
                new discord_js_1.EmbedBuilder()
                    .setColor(0xff3344)
                    .setTitle("❌ Salon introuvable")
                    .setDescription("Le salon avec l'ID `" + channelId + "` est introuvable ou n'est pas textuel.\n\n" +
                    "Vérifie que :\n" +
                    "1. L'ID est correct (Paramètres → Avancés → Mode développeur)\n" +
                    "2. Le salon existe toujours\n" +
                    "3. Le bot a accès au salon"),
            ],
        });
        return;
    }
    // 3. Envoyer un embed de test (simule une alerte Epic Games)
    const testEmbed = new discord_js_1.EmbedBuilder()
        .setColor(0x2a9d8f) // Vert Epic
        .setTitle("🎮 [Epic Games] ✅ Message de test")
        .setURL("https://store.epicgames.com/fr/free-games")
        .setAuthor({
        name: "Epic Games Store",
        iconURL: "https://store.epicgames.com/favicon.ico",
        url: "https://store.epicgames.com/fr/free-games",
    })
        .setDescription("Ceci est un **message de test** envoyé par la commande `/test-freegames`.\n\n" +
        "Si tu vois ce message dans le bon salon avec la bonne couleur (vert Epic) et le bon logo, " +
        "ta configuration est **correcte** ✅\n\n" +
        "Les prochaines alertes de jeux gratuits seront postées ici toutes les 30 minutes.")
        .addFields({ name: "📅 Date du test", value: "<t:" + Math.floor(Date.now() / 1000) + ":F>", inline: true }, { name: "👤 Demandé par", value: "<@" + interaction.user.id + ">", inline: true }, { name: "🛒 Plateforme simulée", value: "Epic Games Store", inline: true })
        .setFooter({ text: "Free Games Tracker • Test de configuration" })
        .setTimestamp();
    try {
        await channel.send({ embeds: [testEmbed] });
        await interaction.editReply({
            embeds: [
                new discord_js_1.EmbedBuilder()
                    .setColor(0x53fc18)
                    .setTitle("✅ Message de test envoyé")
                    .setDescription("Un embed de test a été posté dans <#" + channelId + ">.\n\n" +
                    "Vérifie visuellement que :\n" +
                    "✅ La couleur est bien **verte** (Epic)\n" +
                    "✅ Le logo **Epic Games Store** est visible\n" +
                    "✅ Le contenu est correctement formaté"),
            ],
        });
        logger_1.default.info("[TestFreeGames] Message de test envoyé dans " + channelId + " par " + interaction.user.tag);
    }
    catch (sendError) {
        const msg = sendError instanceof Error ? sendError.message : String(sendError);
        await interaction.editReply({
            embeds: [
                new discord_js_1.EmbedBuilder()
                    .setColor(0xff3344)
                    .setTitle("❌ Erreur d'envoi")
                    .setDescription("Le bot n'a pas pu envoyer le message dans <#" + channelId + ">.\n\n" +
                    "**Erreur :** `" + msg + "`\n\n" +
                    "Vérifie que le bot a bien les permissions `Envoyer des messages` et `Inclure dans les embeds` sur ce salon."),
            ],
        });
        logger_1.default.error("[TestFreeGames] Erreur envoi:", msg);
    }
}
//# sourceMappingURL=admin.js.map