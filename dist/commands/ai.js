import logger from "../utils/logger.js";
// Commandes IA etendues : /aichat + /smartpoll
import { MessageFlags, SlashCommandBuilder, EmbedBuilder, } from "discord.js";
import { requireAdmin } from "../services/permissions.js";
import { chatWithAI, handleMention } from "../services/ai.js";
import { enableAiChat, disableAiChat, isAiChatEnabled, getConversationSize, clearHistory, generatePollOptions, } from "../services/aichat.js";
const FOOTER = { text: "Systeme de Surveillance • IA" };
export const commands = [
    // /chat
    new SlashCommandBuilder()
        .setName("chat")
        .setDescription("Pose une question a l'IA")
        .addStringOption((o) => o.setName("message").setDescription("Ton message").setRequired(true))
        .toJSON(),
    // /mention
    new SlashCommandBuilder()
        .setName("mention")
        .setDescription("Mentionne un utilisateur avec l'IA")
        .addStringOption((o) => o
        .setName("message")
        .setDescription("Message au format @utilisateur ton message")
        .setRequired(true))
        .toJSON(),
    // /aichat
    new SlashCommandBuilder()
        .setName("aichat")
        .setDescription("Active/desactive le chat IA contextuel dans ce salon")
        .addStringOption((o) => o
        .setName("action")
        .setDescription("Action")
        .setRequired(true)
        .addChoices({ name: "Activer", value: "on" }, { name: "Desactiver", value: "off" }, { name: "Statut", value: "status" }, { name: "Effacer l'historique", value: "clear" }))
        .toJSON(),
    // /smartpoll
    new SlashCommandBuilder()
        .setName("smartpoll")
        .setDescription("Genere un sondage intelligent avec des options creees par l'IA")
        .addStringOption((o) => o
        .setName("question")
        .setDescription("Le sujet du sondage")
        .setRequired(true))
        .toJSON(),
];
export async function handleCommand(interaction) {
    try {
        switch (interaction.commandName) {
            case "chat":
                await handleChat(interaction);
                break;
            case "mention":
                await handleMentionCommand(interaction);
                break;
            case "aichat":
                if (!(await requireAdmin(interaction)))
                    return;
                await handleAiChat(interaction);
                break;
            case "smartpoll":
                if (!(await requireAdmin(interaction)))
                    return;
                await handleSmartPoll(interaction);
                break;
        }
    }
    catch (err) {
        logger.error("[AI] Erreur:", err);
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
// ===== /chat =====
async function handleChat(interaction) {
    const message = interaction.options.getString("message", true);
    const username = interaction.user.username;
    await interaction.deferReply();
    const response = await chatWithAI(message, username);
    const embed = new EmbedBuilder()
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
    const response = await handleMention(message, interaction.user.username);
    const embed = new EmbedBuilder()
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
        enableAiChat(channelId);
        await interaction.reply({
            embeds: [
                new EmbedBuilder()
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
        disableAiChat(channelId);
        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xffaa00)
                    .setTitle("Chat IA Desactive")
                    .setDescription("Le bot ne repondra plus automatiquement dans ce salon.")
                    .setFooter(FOOTER),
            ],
        });
    }
    else if (action === "clear") {
        await interaction.deferReply();
        const deleted = await clearHistory(channelId);
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
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
        const enabled = isAiChatEnabled(channelId);
        const size = getConversationSize(channelId);
        await interaction.reply({
            embeds: [
                new EmbedBuilder()
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
    const results = await generatePollOptions(question);
    if (results.length < 2) {
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
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
                new EmbedBuilder()
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
        const embed = new EmbedBuilder()
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