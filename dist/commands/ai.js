"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.commands = void 0;
exports.handleCommand = handleCommand;
const logger_1 = __importDefault(require("../utils/logger"));
// Commandes IA etendues : /aichat + /smartpoll
const discord_js_1 = require("discord.js");
const permissions_1 = require("../services/permissions");
const ai_1 = require("../services/ai");
const aichat_1 = require("../services/aichat");
const FOOTER = { text: "Systeme de Surveillance • IA" };
exports.commands = [
    // /chat
    new discord_js_1.SlashCommandBuilder()
        .setName("chat")
        .setDescription("Pose une question a l'IA")
        .addStringOption((o) => o.setName("message").setDescription("Ton message").setRequired(true))
        .toJSON(),
    // /mention
    new discord_js_1.SlashCommandBuilder()
        .setName("mention")
        .setDescription("Mentionne un utilisateur avec l'IA")
        .addStringOption((o) => o
        .setName("message")
        .setDescription("Message au format @utilisateur ton message")
        .setRequired(true))
        .toJSON(),
    // /aichat
    new discord_js_1.SlashCommandBuilder()
        .setName("aichat")
        .setDescription("Active/desactive le chat IA contextuel dans ce salon")
        .addStringOption((o) => o
        .setName("action")
        .setDescription("Action")
        .setRequired(true)
        .addChoices({ name: "Activer", value: "on" }, { name: "Desactiver", value: "off" }, { name: "Statut", value: "status" }, { name: "Effacer l'historique", value: "clear" }))
        .toJSON(),
    // /smartpoll
    new discord_js_1.SlashCommandBuilder()
        .setName("smartpoll")
        .setDescription("Genere un sondage intelligent avec des options creees par l'IA")
        .addStringOption((o) => o
        .setName("question")
        .setDescription("Le sujet du sondage")
        .setRequired(true))
        .toJSON(),
];
async function handleCommand(interaction) {
    try {
        switch (interaction.commandName) {
            case "chat":
                await handleChat(interaction);
                break;
            case "mention":
                await handleMentionCommand(interaction);
                break;
            case "aichat":
                if (!(await (0, permissions_1.requireAdmin)(interaction)))
                    return;
                await handleAiChat(interaction);
                break;
            case "smartpoll":
                if (!(await (0, permissions_1.requireAdmin)(interaction)))
                    return;
                await handleSmartPoll(interaction);
                break;
        }
    }
    catch (err) {
        logger_1.default.error("[AI] Erreur:", err);
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
// ===== /chat =====
async function handleChat(interaction) {
    const message = interaction.options.getString("message", true);
    const username = interaction.user.username;
    await interaction.deferReply();
    const response = await (0, ai_1.chatWithAI)(message, username);
    const embed = new discord_js_1.EmbedBuilder()
        .setColor(0x2f3136)
        .setTitle("Chat avec l'IA")
        .setDescription(`**${username}:** ${message}\n\n${response}`)
        .setFooter(FOOTER)
        .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
}
// ===== /mention =====
async function handleMentionCommand(interaction) {
    const message = interaction.options.getString("message", true);
    await interaction.deferReply();
    const response = await (0, ai_1.handleMention)(message, interaction.user.username);
    const embed = new discord_js_1.EmbedBuilder()
        .setColor(0x2f3136)
        .setTitle("Mention IA")
        .setDescription(response)
        .setFooter(FOOTER)
        .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
}
// ===== /aichat =====
async function handleAiChat(interaction) {
    const action = interaction.options.getString("action", true);
    const channelId = interaction.channelId;
    if (action === "on") {
        (0, aichat_1.enableAiChat)(channelId);
        await interaction.reply({
            embeds: [
                new discord_js_1.EmbedBuilder()
                    .setColor(0x53fc18)
                    .setTitle("Chat IA Active")
                    .setDescription("Le bot repondra a **tous les messages** dans ce salon avec de l'IA.\n" +
                    "La memoire de conversation est conservee (20 derniers messages max).\n" +
                    "Utilise `/aichat off` pour desactiver.")
                    .setFooter(FOOTER),
            ],
        });
    }
    else if (action === "off") {
        (0, aichat_1.disableAiChat)(channelId);
        await interaction.reply({
            embeds: [
                new discord_js_1.EmbedBuilder()
                    .setColor(0xffaa00)
                    .setTitle("Chat IA Desactive")
                    .setDescription("Le bot ne repondra plus automatiquement dans ce salon.")
                    .setFooter(FOOTER),
            ],
        });
    }
    else if (action === "clear") {
        await interaction.deferReply();
        const deleted = await (0, aichat_1.clearHistory)(channelId);
        await interaction.editReply({
            embeds: [
                new discord_js_1.EmbedBuilder()
                    .setColor(0x53fc18)
                    .setTitle("Historique Efface")
                    .setDescription(deleted > 0
                    ? `✅ ${deleted} message(s) supprime(s). L'IA repart de zero dans ce salon.`
                    : "Aucun message a supprimer (historique deja vide).")
                    .setFooter(FOOTER),
            ],
        });
    }
    else {
        const enabled = (0, aichat_1.isAiChatEnabled)(channelId);
        const size = (0, aichat_1.getConversationSize)(channelId);
        await interaction.reply({
            embeds: [
                new discord_js_1.EmbedBuilder()
                    .setColor(enabled ? 0x53fc18 : 0x666666)
                    .setTitle("Statut Chat IA")
                    .setDescription(enabled
                    ? `**ACTIF** — ${size} messages en memoire`
                    : "**INACTIF**")
                    .setFooter(FOOTER),
            ],
        });
    }
}
// ===== /smartpoll =====
async function handleSmartPoll(interaction) {
    const question = interaction.options.getString("question", true);
    await interaction.deferReply();
    const results = await (0, aichat_1.generatePollOptions)(question);
    if (results.length < 2) {
        await interaction.editReply({
            embeds: [
                new discord_js_1.EmbedBuilder()
                    .setColor(0xff3344)
                    .setDescription("L'IA n'a pas pu generer d'options pour ce sondage. Reformule ta question.")
                    .setFooter(FOOTER),
            ],
        });
        return;
    }
    const reformulated = results[0];
    const options = results.slice(1);
    if (options.length < 2) {
        await interaction.editReply({
            embeds: [
                new discord_js_1.EmbedBuilder()
                    .setColor(0xff3344)
                    .setDescription("L'IA n'a pas genere assez d'options. Reessaye avec une question plus ouverte.")
                    .setFooter(FOOTER),
            ],
        });
        return;
    }
    // Creer un sondage natif Discord
    try {
        const poll = await interaction.editReply({
            content: `**Sondage:** ${reformulated}`,
            poll: {
                question: { text: reformulated },
                answers: options.map((o) => ({ text: o.slice(0, 55) })),
                duration: 24, // 24 heures
                allowMultiselect: false,
            },
        });
    }
    catch {
        // Fallback: embed avec reactions si le poll natif n'est pas supporte
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(0x9b59b6)
            .setTitle(reformulated)
            .setDescription(options.map((o, i) => `${["🇦", "🇧", "🇨", "🇩", "🇪"][i]} ${o}`).join("\n\n"))
            .setFooter({ text: "Sondage genere par IA • Votez avec les reactions !" })
            .setTimestamp();
        const msg = await interaction.editReply({ embeds: [embed] });
        const emojis = ["🇦", "🇧", "🇨", "🇩", "🇪"];
        for (let i = 0; i < Math.min(options.length, 5); i++) {
            try {
                await msg.react(emojis[i]);
            }
            catch { /* ignore */ }
        }
    }
}
//# sourceMappingURL=ai.js.map