"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startMapCleanup = startMapCleanup;
exports.stopMapCleanup = stopMapCleanup;
exports.handleMessageEvents = handleMessageEvents;
const logger_1 = __importDefault(require("../utils/logger"));
const discord_js_1 = require("discord.js");
const logs_1 = require("../services/logs");
const risk_engine_1 = require("../services/risk-engine");
const security_1 = require("../commands/security");
const aichat_1 = require("../services/aichat");
const ai_moderation_1 = require("../services/ai-moderation");
const prisma_1 = __importDefault(require("../prisma"));
const redis_enhance_1 = require("../utils/redis-enhance");
const translator_1 = require("../utils/translator");
const aiMemory_1 = require("../services/aiMemory");
const aiCache_1 = require("../services/aiCache");
const rateLimiter_1 = require("../services/rateLimiter");
// ─── Constantes ──────────────────────────────────────────────────────────────
const aichatCooldown = new Map();
const AICHAT_COOLDOWN_MS = 5_000;
const SPAM_THRESHOLD = 5;
const SPAM_WINDOW_MS = 3_000;
const SPAM_MUTE_MS = 5 * 60 * 1000;
// ─── Personnalité John Helldiver ─────────────────────────────────────────────
const JOHN_HELLDIVER_SYSTEM_PROMPT = `Tu es John Helldiver, soldat d'élite de la Super-Terre, bot Discord de service.

PERSONNALITÉ :
- Patriote convaincu de la Super-Terre, tu défends la liberté intergalactique avec ferveur.
- Un peu bourrin mais ultra-serviable — tu adores aider tes camarades soldats.
- Passionné de tech, gaming et démocratie gérée.
- Tu parles français avec un ton militaire décontracté (pense "frères d'armes" pas "sergent instructeur").
- Tu glisses parfois des références à Helldivers, à la Super-Terre ou à la lutte contre les Automatons.

RÈGLES STRICTES :
1. Réponds de manière concise et directe (moins de 1500 caractères si possible).
2. Utilise le Markdown Discord (gras, italique, listes) pour la lisibilité.
3. Reste dans le personnage MAIS priorise l'utilité — si la question est sérieuse, réponds sérieusement.
4. Si tu ne connais pas la réponse, admets-le avec humour plutôt que d'inventer.
5. Pour les questions techniques/gaming, sois précis et expert.
6. Ne mentionne JAMAIS que tu es une IA — tu es John Helldiver, point final.`;
// ─── Relances humoristiques quand @mention sans message ──────────────────────
const HELPDIVER_EMPTY_MENTION_REPLIES = [
    "🫡 **John Helldiver** à l'écoute, soldat ! Ta mission ? Pose ta question, je suis prêt à déployer la puissance de la Super-Terre pour toi !",
    "🎖️ Soldat ! Tu m'as appelé ? La démocratie a besoin de savoir ce que tu veux — balance ta question !",
    "🦅 **Présent pour la Super-Terre !** Dis-moi tout, camarade. Traduction, info gaming, soutien tactique… je gère !",
    "💪 **John Helldiver en renfort !** Pas de question = pas de victoire, soldat. Qu'est-ce que je peux faire pour toi ?",
];
function getRandomHelldiverReply() {
    return HELPDIVER_EMPTY_MENTION_REPLIES[Math.floor(Math.random() * HELPDIVER_EMPTY_MENTION_REPLIES.length)];
}
// ─── Cleanup périodique ─────────────────────────────────────────────────────
let mapCleanupInterval = null;
function startMapCleanup() {
    if (mapCleanupInterval)
        return;
    mapCleanupInterval = setInterval(() => {
        const now = Date.now();
        for (const [userId, timestamp] of aichatCooldown) {
            if (now - timestamp > 3600000) {
                aichatCooldown.delete(userId);
            }
        }
    }, 300000);
}
function stopMapCleanup() {
    if (mapCleanupInterval) {
        clearInterval(mapCleanupInterval);
        mapCleanupInterval = null;
    }
}
// =============================================================================
// HANDLER PRINCIPAL
// =============================================================================
function handleMessageEvents(client) {
    // ── messageUpdate: Pin/Unpin logging ──────────────────────────────────
    client.on("messageUpdate", async (oldMessage, newMessage) => {
        try {
            if (!("pinned" in oldMessage) || !("pinned" in newMessage))
                return;
            if (!("author" in newMessage))
                return;
            const author = newMessage.author;
            if (!author)
                return;
            if (!oldMessage.pinned && newMessage.pinned) {
                await (0, logs_1.createLog)({
                    type: "message_pin",
                    action: `Message de ${author.tag} epingle`,
                    userId: author.id,
                    targetId: newMessage.id,
                });
            }
            else if (oldMessage.pinned && !newMessage.pinned) {
                await (0, logs_1.createLog)({
                    type: "message_unpin",
                    action: `Message de ${author.tag} desepingle`,
                    userId: author.id,
                    targetId: newMessage.id,
                });
            }
        }
        catch (error) {
            logger_1.default.error("[MessageEvents] Erreur messageUpdate:", error);
        }
    });
    // ── Anti-spam tracker ─────────────────────────────────────────────────
    const spamTracker = new Map();
    // ===========================================================================
    // messageCreate — INTERCEPTEUR INTELLIGENT
    // ===========================================================================
    client.on("messageCreate", async (message) => {
        try {
            if (!message.guild || message.author.bot)
                return;
            const isMentioningBot = message.mentions.has(client.user);
            // ═══════════════════════════════════════════════════════════════════
            // PROTECTION MUTUELLE : Un message NE PEUT PAS déclencher
            // le chat IA ET la traduction automatique simultanément.
            // ═══════════════════════════════════════════════════════════════════
            // ── BRANCHEMENT 1 : MODE CHAT IA (@mention du bot) ────────────────
            if (isMentioningBot) {
                await handleAiChatMention(message, client);
                return; // ← PROTECTION MUTUELLE : on sort immédiatement
            }
            // ── BRANCHEMENT 2 : MODE TRADUCTION AUTOMATIQUE (pas de @mention) ─
            await handleAutoTranslation(message);
            // ── Les modules suivants (AIChat contextuel, AI Mod, Anti-Phishing,
            //     Anti-Spam) continuent normalement APRÈS les deux branches ────
            await handleContextualAiChat(message, client);
            await handleSecurityModules(message, spamTracker);
        }
        catch (error) {
            logger_1.default.error("[MessageEvents] Erreur messageCreate:", error);
        }
    });
}
// =============================================================================
// BRANCHEMENT 1 : CHAT IA PAR @MENTION
// =============================================================================
async function handleAiChatMention(message, client) {
    try {
        // Nettoyer le message : retirer la mention du bot
        let cleanedContent = message.content
            .replace(new RegExp(`<@!?${client.user.id}>`, "g"), "")
            .trim();
        // Si le message est vide après nettoyage → relance humoristique John Helldiver
        if (!cleanedContent) {
            await message.reply({
                content: getRandomHelldiverReply(),
                allowedMentions: { repliedUser: false },
            });
            return;
        }
        // Déclencher l'indicateur de frappe
        await message.channel.sendTyping();
        // Ajouter le message de l'utilisateur à la mémoire
        (0, aiMemory_1.addMessageToConversation)(message.author.id, "user", cleanedContent, message.guildId || undefined);
        // Vérifier le rate limiting
        const rateLimitCheck = (0, rateLimiter_1.checkRateLimit)(message.author.id, "ai_chat", message.guildId || undefined);
        if (!rateLimitCheck.allowed) {
            const resetTime = new Date(rateLimitCheck.resetTime).toLocaleTimeString("fr-FR");
            await message.reply({
                allowedMentions: { repliedUser: false },
            });
            return;
        }
        const cachedResponse = (0, aiCache_1.getCachedResponse)(cleanedContent);
        if (cachedResponse) {
            await message.reply({ content: cachedResponse, allowedMentions: { repliedUser: false } });
            (0, aiMemory_1.addMessageToConversation)(message.author.id, "assistant", cachedResponse, message.guildId || undefined);
            logger_1.default.info(`[AIChat] Cache: ${message.author.tag}`);
            return;
        }
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            await message.reply({ content: "\u26a0\ufe0f Circuits non configur\u00e9s ! Configure OPENROUTER_API_KEY. \U0001f985", allowedMentions: { repliedUser: false } });
            return;
        }
        const conversationHistory = (0, aiMemory_1.getConversationHistory)(message.author.id, message.guildId || undefined);
        const messages = [
            { role: "system", content: JOHN_HELLDIVER_SYSTEM_PROMPT },
            ...conversationHistory,
            { role: "user", content: cleanedContent },
        ];
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://discord-bot.com", "X-Title": "John Helldiver - Discord Bot" },
            body: JSON.stringify({ model: "meta-llama/llama-3-8b-instruct:free", messages, max_tokens: 500, temperature: 0.7 }),
            signal: AbortSignal.timeout(15000),
        });
        if (!response.ok)
            throw new Error(`OpenRouter HTTP error: ${response.status}`);
        const data = await response.json();
        if (data.choices?.[0]?.message?.content) {
            let aiResponse = data.choices[0].message.content.trim();
            if (aiResponse.length > 2000)
                aiResponse = aiResponse.slice(0, 1997) + "...";
            await message.reply({ content: aiResponse, allowedMentions: { repliedUser: false } });
            (0, aiMemory_1.addMessageToConversation)(message.author.id, "assistant", aiResponse, message.guildId || undefined);
            (0, aiCache_1.cacheResponse)(cleanedContent, aiResponse);
            logger_1.default.info(`[AIChat] IA -> ${message.author.tag}`);
        }
        else {
            throw new Error("OpenRouter response invalid");
        }
    }
    catch (error) {
        logger_1.default.error(`[AIChat] Erreur: ${error instanceof Error ? error.message : String(error)}`);
        await message.reply({ content: "\U0001f985 *Static* - Communications brouill\u00e9es ! R\u00e9essaie.", allowedMentions: { repliedUser: false } });
    }
}
async function handleAutoTranslation(message) {
    try {
        const content = message.content.trim();
        const wordCount = content.split(/\s+/).filter((w) => w.length > 0).length;
        const hasOnlyEmojis = /^[\p{Emoji}\s]+$/u.test(content);
        const hasOnlyMentions = /^<@!?[\d]+>(\s*<@!?[\d]+>)*$/u.test(content);
        const hasOnlyUrls = /^https?:\/\/[^\s]+$/u.test(content);
        if (content.length < 15 || wordCount < 3 || hasOnlyEmojis || hasOnlyMentions || hasOnlyUrls)
            return;
        const translationResult = await (0, translator_1.translateAutoToFrench)(content);
        if (translationResult && translationResult.detectedLanguage !== "fr" && translationResult.translatedText !== content) {
            const translationEmbed = new discord_js_1.EmbedBuilder()
                .setColor(0x3498db)
                .setAuthor({ name: `Traduction automatique (${translationResult.detectedLanguage})`, iconURL: message.author.displayAvatarURL() })
                .setDescription(`> ${translationResult.translatedText.slice(0, 1900)}`)
                .setFooter({ text: `Message original de ${message.author.username}` })
                .setTimestamp();
            await message.reply({ embeds: [translationEmbed], allowedMentions: { repliedUser: false } });
            logger_1.default.debug(`[AutoTranslate] ${message.author.tag}: ${translationResult.detectedLanguage}`);
        }
    }
    catch (error) {
        logger_1.default.debug(`[AutoTranslate] Erreur: ${error instanceof Error ? error.message : String(error)}`);
    }
}
async function handleContextualAiChat(message, client) {
    try {
        if (!(0, aichat_1.isAiChatEnabled)(message.channel.id))
            return;
        if (!message.mentions.has(client.user))
            return;
        let cleanedContent = message.content.replace(new RegExp(`<@!?${client.user.id}>`, "g"), "");
        message.mentions.users.forEach((user) => {
            if (user.id !== client.user.id) {
                cleanedContent = cleanedContent.replace(new RegExp(`<@!?${user.id}>`, "g"), `@${user.username}`);
            }
        });
        cleanedContent = cleanedContent.trim();
        if (!cleanedContent)
            return;
        const lastUsed = aichatCooldown.get(message.author.id) || 0;
        if (Date.now() - lastUsed < AICHAT_COOLDOWN_MS) {
            await message.react("\u23f3").catch(() => { });
            return;
        }
        aichatCooldown.set(message.author.id, Date.now());
        await message.channel.sendTyping();
        const reply = await (0, aichat_1.chatWithHistory)(message.channelId, cleanedContent, message.author.username, message.guildId || undefined);
        await message.reply({ content: reply.slice(0, 2000), allowedMentions: { repliedUser: false } });
    }
    catch (err) {
        logger_1.default.error("[AIChat] Erreur contextuelle:", err);
    }
}
async function handleSecurityModules(message, spamTracker) {
    if (!("member" in message) || !message.member)
        return;
    const member = message.member;
    if (member.permissions.has("Administrator") || member.permissions.has("ModerateMembers"))
        return;
    if (message.content.length > 10 && message.content.length < 1500) {
        if (!message.guild)
            return;
        (0, redis_enhance_1.withCache)(`guild:${message.guild.id}:config`, 30, () => prisma_1.default.guildConfig.findUnique({ where: { guildId: message.guild.id } }))
            .then((gc) => {
            if (!gc?.aiModerationEnabled)
                return;
            (0, ai_moderation_1.analyzeToxicity)(message.content).then(async (result) => {
                if (result.isToxic && result.confidence > 0.8) {
                    try {
                        await message.delete();
                        const alert = await message.channel.send({ content: `\u26a0\ufe0f ${message.author} message supprim\u00e9 par IA: **${result.category}** (${Math.round(result.confidence * 100)}%)` });
                        setTimeout(() => alert.delete().catch(() => { }), 8000);
                        await (0, risk_engine_1.recordSecurityEvent)(message.author.id, message.guild.id, "AI_MODERATION").catch(() => { });
                        logger_1.default.info(`\U0001f916 [AI-Mod] ${message.author.tag}: ${result.category}`);
                    }
                    catch (err) {
                        logger_1.default.error("[AI-Mod] Erreur:", err);
                    }
                }
            }).catch(() => { });
        }).catch(() => { });
    }
    if (await (0, security_1.isAntiPhishingActive)(message.guild.id)) {
        const suspicious = (0, security_1.checkSuspiciousLinksDetailed)(message.content);
        if (suspicious.length > 0) {
            logger_1.default.info(`\U0001f6e1\ufe0f [Anti-Phishing] ${suspicious.length} lien(s) suspect(s) de ${message.author.tag}`);
            try {
                await message.delete();
                const alert = await message.channel.send({ content: `\u26a0\ufe0f ${message.author} message supprim\u00e9 (lien suspect).` });
                setTimeout(() => alert.delete().catch(() => { }), 10000);
                await (0, risk_engine_1.recordSecurityEvent)(message.author.id, message.guild.id, "ANTI_PHISHING").catch(() => { });
                await (0, logs_1.createLog)({ type: "antiphishing", action: `Lien suspect: ${suspicious[0]} de ${message.author.tag}`, userId: message.author.id, details: message.content.slice(0, 500) });
                return;
            }
            catch (err) {
                logger_1.default.error("[Anti-Phishing] Erreur:", err);
            }
        }
    }
    const now = Date.now();
    const key = `${message.guild.id}_${message.author.id}`;
    const entry = spamTracker.get(key);
    if (!entry || now - entry.firstSeen > SPAM_WINDOW_MS) {
        spamTracker.set(key, { count: 1, firstSeen: now, warned: false });
    }
    else {
        entry.count++;
        if (entry.count >= SPAM_THRESHOLD && !entry.warned) {
            entry.warned = true;
            try {
                logger_1.default.info(`\U0001f6ab [Anti-Spam] ${entry.count} msg de ${message.author.tag}`);
                await member.timeout(SPAM_MUTE_MS, "Anti-spam");
                const recentMessages = await message.channel.messages.fetch({ limit: 20 });
                const spamMessages = recentMessages.filter((m) => m.author.id === message.author.id);
                if (spamMessages.size > 0) {
                    try {
                        await message.channel.bulkDelete(spamMessages, true);
                    }
                    catch (_) { }
                }
                await (0, risk_engine_1.recordSecurityEvent)(message.author.id, message.guild.id, "ANTI_SPAM").catch(() => { });
            }
            catch (err) {
                logger_1.default.error("[Anti-Spam] Erreur:", err);
            }
        }
    }
    if (Math.random() < 0.01) {
        for (const [k, v] of spamTracker) {
            if (now - v.firstSeen > SPAM_WINDOW_MS * 2)
                spamTracker.delete(k);
        }
    }
}
//# sourceMappingURL=messages.js.map