import logger from "../utils/logger.js";
// Commandes Utilitaires UI & Affichage
// embed-builder (Modal), say, translate
import { MessageFlags, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ChannelType, } from "discord.js";
import { createLog } from "../services/logs.js";
import { translateAutoToFrench, translateText, translateFrenchToEnglish, SUPPORTED_LANGUAGES } from "../utils/translator.js";
import { addTranslationToHistory } from "../services/translationHistory.js";
// ===== Définition des commandes =====
export const commands = [
    new SlashCommandBuilder()
        .setName("embed-builder")
        .setDescription("Ouvre un formulaire pour créer un embed personnalisé")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .toJSON(),
    new SlashCommandBuilder()
        .setName("say")
        .setDescription("Fait parler le bot dans un salon spécifique")
        .addChannelOption((opt) => opt
        .setName("salon")
        .setDescription("Le salon où envoyer le message")
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
        .addStringOption((opt) => opt
        .setName("message")
        .setDescription("Le message à envoyer")
        .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .toJSON(),
    // /poll
    new SlashCommandBuilder()
        .setName("poll")
        .setDescription("Créer un sondage interactif")
        .addStringOption((o) => o.setName("question").setDescription("La question du sondage").setRequired(true))
        .addStringOption((o) => o.setName("options").setDescription("Options séparées par des virgules (max 10, ex: Oui,Non,Peut-être)").setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .toJSON(),
    // /translate
    new SlashCommandBuilder()
        .setName("translate")
        .setDescription("Traduit un texte dans une langue spécifique")
        .addStringOption((o) => o.setName("texte").setDescription("Le texte à traduire").setRequired(true))
        .addStringOption((o) => o.setName("langue")
        .setDescription("Langue cible (par défaut: français)")
        .setRequired(false))
        .addStringOption((o) => o.setName("source")
        .setDescription("Langue source (par défaut: auto-détection)")
        .setRequired(false))
        .addBooleanOption((o) => o.setName("reverse")
        .setDescription("Traduire du français vers l'anglais (équivalent à langue: en, source: fr)")
        .setRequired(false))
        .toJSON(),
    // /ask-gaming
    new SlashCommandBuilder()
        .setName("ask-gaming")
        .setDescription("Pose une question sur le gaming à l'IA")
        .addStringOption((o) => o.setName("question").setDescription("Ta question sur le gaming").setRequired(true))
        .toJSON(),
    // /ask-tech
    new SlashCommandBuilder()
        .setName("ask-tech")
        .setDescription("Pose une question technique à l'IA")
        .addStringOption((o) => o.setName("question").setDescription("Ta question technique").setRequired(true))
        .toJSON(),
];
// ===== Handler principal =====
export async function handleCommand(interaction, client) {
    try {
        switch (interaction.commandName) {
            case "embed-builder":
                await handleEmbedBuilder(interaction);
                break;
            case "poll":
                await handlePoll(interaction);
                break;
            case "say":
                await handleSay(interaction, client);
                break;
            case "translate":
                await handleTranslate(interaction);
                break;
            case "ask-gaming":
                await handleAskGaming(interaction);
                break;
            case "ask-tech":
                await handleAskTech(interaction);
                break;
        }
    }
    catch (err) {
        logger.error("[Utility] Erreur:", err);
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
        catch {
            // silencieux
        }
    }
}
// ===== Gestion des modals (exporté pour index.ts) =====
export async function handleModalSubmit(interaction, _client) {
    if (interaction.customId !== "embed_builder_modal")
        return;
    try {
        const title = interaction.fields.getTextInputValue("embed_title");
        const description = interaction.fields.getTextInputValue("embed_description");
        const colorHex = interaction.fields.getTextInputValue("embed_color") || "5865F2";
        const imageUrl = interaction.fields.getTextInputValue("embed_image") || "";
        // Valider la couleur hex
        const colorInt = parseInt(colorHex.replace("#", ""), 16);
        if (isNaN(colorInt)) {
            await interaction.reply({
                content: "Code couleur invalide. Utilise un hexadécimal comme `5865F2`.",
                flags: [MessageFlags.Ephemeral],
            });
            return;
        }
        const embed = new EmbedBuilder()
            .setColor(colorInt)
            .setTitle(title)
            .setDescription(description)
            .setFooter({ text: "Créé par " + interaction.user.tag })
            .setTimestamp();
        if (imageUrl) {
            embed.setImage(imageUrl);
        }
        await interaction.channel.send({ embeds: [embed] });
        await interaction.reply({
            content: "Embed envoyé !",
            flags: [MessageFlags.Ephemeral],
        });
        // Log
        await createLog({
            type: "member",
            action: "embed_builder_used",
            userId: interaction.user.id,
            details: 'Titre: "' + title + '"',
        });
    }
    catch (err) {
        logger.error("[Utility] Erreur modal embed-builder:", err);
        try {
            await interaction.reply({
                content: "Erreur lors de la création de l'embed.",
                flags: [MessageFlags.Ephemeral],
            });
        }
        catch {
            // silencieux
        }
    }
}
// ===== /embed-builder (affiche le Modal) =====
async function handleEmbedBuilder(interaction) {
    const modal = new ModalBuilder()
        .setCustomId("embed_builder_modal")
        .setTitle("Créer un embed");
    const titleInput = new TextInputBuilder()
        .setCustomId("embed_title")
        .setLabel("Titre de l'embed")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(256)
        .setPlaceholder("Annonce importante");
    const descriptionInput = new TextInputBuilder()
        .setCustomId("embed_description")
        .setLabel("Description")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(4000)
        .setPlaceholder("Contenu détaillé de l'embed...");
    const colorInput = new TextInputBuilder()
        .setCustomId("embed_color")
        .setLabel("Couleur (hex)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(7)
        .setPlaceholder("5865F2")
        .setValue("5865F2");
    const imageInput = new TextInputBuilder()
        .setCustomId("embed_image")
        .setLabel("URL de l'image (optionnel)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(500)
        .setPlaceholder("https://example.com/image.png");
    const row1 = new ActionRowBuilder().addComponents(titleInput);
    const row2 = new ActionRowBuilder().addComponents(descriptionInput);
    const row3 = new ActionRowBuilder().addComponents(colorInput);
    const row4 = new ActionRowBuilder().addComponents(imageInput);
    modal.addComponents(row1, row2, row3, row4);
    await interaction.showModal(modal);
}
// ===== /poll =====
async function handlePoll(interaction) {
    const question = interaction.options.getString("question", true);
    const optionsStr = interaction.options.getString("options", true);
    const optionsList = optionsStr.split(",").map((o) => o.trim()).filter((o) => o.length > 0);
    // Validations AVANT deferReply (utilisent reply)
    if (optionsList.length < 2) {
        await interaction.reply({
            embeds: [new EmbedBuilder().setTitle("Erreur").setColor(0xff3344).setDescription("Il faut au moins 2 options.")],
            flags: [MessageFlags.Ephemeral],
        });
        return;
    }
    if (optionsList.length > 10) {
        await interaction.reply({
            embeds: [new EmbedBuilder().setTitle("Erreur").setColor(0xff3344).setDescription("Maximum 10 options.")],
            flags: [MessageFlags.Ephemeral],
        });
        return;
    }
    await interaction.deferReply();
    try {
        const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
        const description = optionsList
            .map((opt, idx) => `${emojis[idx]} **${opt}**`)
            .join(`\n\n`);
        const embed = new EmbedBuilder()
            .setTitle(question)
            .setDescription(description)
            .setColor(0x3498db)
            .setFooter({
            text: `Sondage de ${interaction.user.tag}`,
            iconURL: interaction.user.displayAvatarURL(),
        })
            .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
        const message = await interaction.fetchReply();
        for (let idx = 0; idx < optionsList.length; idx++) {
            try {
                await message.react(emojis[idx]);
            }
            catch (_) {
                // Reaction impossible, on continue
            }
        }
    }
    catch (error) {
        logger.error("[CRASH COMMANDE POLL]:", error);
        try {
            await interaction.editReply({ content: "❌ Erreur lors de la création du sondage." });
        }
        catch {
            try {
                await interaction.followUp({ content: "❌ Erreur lors de la création du sondage.", ephemeral: true });
            }
            catch { }
        }
    }
}
// ===== /say =====
async function handleSay(interaction, client) {
    const channel = interaction.options.getChannel("salon", true);
    const message = interaction.options.getString("message", true);
    // Vérification AVANT deferReply (utilise reply)
    if (!channel
        .permissionsFor(client.user.id)
        ?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
        await interaction.reply({
            content: "Je n'ai pas la permission d'envoyer des messages dans ce salon.",
            flags: [MessageFlags.Ephemeral],
        });
        return;
    }
    await interaction.deferReply({ ephemeral: true });
    try {
        await channel.send(message);
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x53fc18)
                    .setDescription("Message envoyé dans " + channel.toString()),
            ],
        });
        // Log
        await createLog({
            type: "member",
            action: "say_command_used",
            userId: interaction.user.id,
            targetId: channel.id,
            details: '"' + message.slice(0, 200) + '"',
        });
    }
    catch (error) {
        logger.error("[CRASH COMMANDE SAY]:", error);
        try {
            await interaction.editReply({ content: "❌ Erreur lors de l'envoi du message." });
        }
        catch {
            try {
                await interaction.followUp({ content: "❌ Erreur lors de l'envoi du message.", ephemeral: true });
            }
            catch { }
        }
    }
}
// ===== /translate =====
async function handleTranslate(interaction) {
    const text = interaction.options.getString("texte", true);
    const targetLang = interaction.options.getString("langue");
    const sourceLang = interaction.options.getString("source");
    const reverse = interaction.options.getBoolean("reverse") || false;
    await interaction.deferReply();
    try {
        let result;
        // Si reverse est activé, traduire du français vers l'anglais
        if (reverse) {
            result = await translateFrenchToEnglish(text);
        }
        // Si une langue cible est spécifiée, utiliser translateText
        else if (targetLang) {
            result = await translateText(text, targetLang, sourceLang || "auto");
        }
        // Sinon, traduire automatiquement vers le français (comportement par défaut)
        else {
            result = await translateAutoToFrench(text);
        }
        if (!result) {
            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xff3344)
                        .setTitle("❌ Erreur de traduction")
                        .setDescription("Impossible de traduire le texte. Veuillez réessayer.")
                ]
            });
            return;
        }
        const targetLanguageName = targetLang ? SUPPORTED_LANGUAGES[targetLang] : (reverse ? "Anglais" : "Français");
        const sourceLanguageName = sourceLang === "auto" ? "Auto-détection" : (sourceLang ? SUPPORTED_LANGUAGES[sourceLang] : result.detectedLanguage);
        const embed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle("🌍 Traduction")
            .addFields({ name: "📝 Texte original", value: text.slice(0, 1024), inline: false }, { name: "🔄 Traduction", value: result.translatedText.slice(0, 1024), inline: false }, { name: "🔤 Langue source", value: sourceLanguageName, inline: true }, { name: "🎯 Langue cible", value: targetLanguageName, inline: true })
            .setFooter({
            text: `Demandé par ${interaction.user.tag}`,
            iconURL: interaction.user.displayAvatarURL()
        })
            .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
        // Ajouter à l'historique des traductions
        await addTranslationToHistory(interaction.user.id, text, result.translatedText, sourceLanguageName, targetLanguageName, interaction.guildId || undefined);
        // Log
        await createLog({
            type: "member",
            action: "translate_command_used",
            userId: interaction.user.id,
            details: `Source: ${sourceLanguageName} → Cible: ${targetLanguageName}`
        });
    }
    catch (error) {
        logger.error("[CRASH COMMANDE TRANSLATE]:", error);
        try {
            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xff3344)
                        .setTitle("❌ Erreur")
                        .setDescription("Une erreur est survenue lors de la traduction.")
                ]
            });
        }
        catch {
            try {
                await interaction.followUp({ content: "❌ Erreur lors de la traduction.", ephemeral: true });
            }
            catch { }
        }
    }
}
// ===== /ask-gaming =====
async function handleAskGaming(interaction) {
    const question = interaction.options.getString("question", true);
    await interaction.deferReply();
    try {
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xff3344)
                        .setTitle("❌ Erreur")
                        .setDescription("OPENROUTER_API_KEY non configurée.")
                ]
            });
            return;
        }
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://discord-bot.com',
                'X-Title': 'Discord Gaming AI'
            },
            body: JSON.stringify({
                model: 'meta-llama/llama-3-8b-instruct:free',
                messages: [
                    {
                        role: 'system',
                        content: 'Tu es un expert en jeux vidéo avec une passion pour le gaming. Réponds aux questions sur les jeux, les stratégies, les astuces, les lore, et l\'industrie du gaming. Sois précis, informatif et utilise un ton passionné. Utilise le formatage Discord (gras, listes) pour rendre tes réponses lisibles.'
                    },
                    {
                        role: 'user',
                        content: question
                    }
                ],
                max_tokens: 500,
                temperature: 0.7
            }),
            signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) {
            throw new Error(`OpenRouter HTTP error: ${response.status}`);
        }
        const data = await response.json();
        if (data.choices && data.choices[0]?.message?.content) {
            let aiResponse = data.choices[0].message.content.trim();
            if (aiResponse.length > 2000) {
                aiResponse = aiResponse.slice(0, 1997) + "...";
            }
            const embed = new EmbedBuilder()
                .setColor(0x9b59b6)
                .setTitle("🎮 Expert Gaming")
                .setDescription(aiResponse)
                .setFooter({
                text: `Demandé par ${interaction.user.tag}`,
                iconURL: interaction.user.displayAvatarURL()
            })
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });
        }
        else {
            throw new Error("OpenRouter response invalid");
        }
    }
    catch (error) {
        logger.error("[CRASH COMMANDE ASK-GAMING]:", error);
        try {
            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xff3344)
                        .setTitle("❌ Erreur")
                        .setDescription("Une erreur est survenue lors du traitement de votre question.")
                ]
            });
        }
        catch {
            try {
                await interaction.followUp({ content: "❌ Erreur lors du traitement.", ephemeral: true });
            }
            catch { }
        }
    }
}
// ===== /ask-tech =====
async function handleAskTech(interaction) {
    const question = interaction.options.getString("question", true);
    await interaction.deferReply();
    try {
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xff3344)
                        .setTitle("❌ Erreur")
                        .setDescription("OPENROUTER_API_KEY non configurée.")
                ]
            });
            return;
        }
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://discord-bot.com',
                'X-Title': 'Discord Tech AI'
            },
            body: JSON.stringify({
                model: 'meta-llama/llama-3-8b-instruct:free',
                messages: [
                    {
                        role: 'system',
                        content: 'Tu es un expert technique avec des connaissances approfondies en programmation, développement logiciel, DevOps, cloud computing, cybersécurité et technologies émergentes. Réponds aux questions techniques de manière précise et professionnelle. Utilise le formatage Discord (blocs de code, listes) pour rendre tes réponses lisibles.'
                    },
                    {
                        role: 'user',
                        content: question
                    }
                ],
                max_tokens: 500,
                temperature: 0.3
            }),
            signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) {
            throw new Error(`OpenRouter HTTP error: ${response.status}`);
        }
        const data = await response.json();
        if (data.choices && data.choices[0]?.message?.content) {
            let aiResponse = data.choices[0].message.content.trim();
            if (aiResponse.length > 2000) {
                aiResponse = aiResponse.slice(0, 1997) + "...";
            }
            const embed = new EmbedBuilder()
                .setColor(0x3498db)
                .setTitle("💻 Expert Technique")
                .setDescription(aiResponse)
                .setFooter({
                text: `Demandé par ${interaction.user.tag}`,
                iconURL: interaction.user.displayAvatarURL()
            })
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });
        }
        else {
            throw new Error("OpenRouter response invalid");
        }
    }
    catch (error) {
        logger.error("[CRASH COMMANDE ASK-TECH]:", error);
        try {
            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xff3344)
                        .setTitle("❌ Erreur")
                        .setDescription("Une erreur est survenue lors du traitement de votre question.")
                ]
            });
        }
        catch {
            try {
                await interaction.followUp({ content: "❌ Erreur lors du traitement.", ephemeral: true });
            }
            catch { }
        }
    }
}
/**
 * Autocomplete pour /translate - filtre les langues selon la saisie utilisateur
 */
export async function handleTranslateAutocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const filtered = Object.entries(SUPPORTED_LANGUAGES)
        .filter(([code, name]) => name.toLowerCase().includes(focused) || code.toLowerCase().includes(focused))
        .slice(0, 25)
        .map(([code, name]) => ({ name, value: code }));
    await interaction.respond(filtered);
}
//# sourceMappingURL=utility.js.map