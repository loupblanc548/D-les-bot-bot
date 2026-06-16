"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enableAiChat = enableAiChat;
exports.disableAiChat = disableAiChat;
exports.isAiChatEnabled = isAiChatEnabled;
exports.getConversationSize = getConversationSize;
exports.clearHistory = clearHistory;
exports.chatWithHistory = chatWithHistory;
exports.generatePollOptions = generatePollOptions;
const logger_1 = __importDefault(require("../utils/logger"));
const prisma_1 = __importDefault(require("../prisma"));
const ai_1 = require("./ai");
const config_1 = require("../config");
// ── Configuration ────────────────────────────────────────────────
const MAX_HISTORY = 20; // Max messages chargés depuis la DB
const MAX_PERSIST_MS = 7 * 24 * 60 * 60 * 1000; // Rétention 7 jours
/** Récupère le prompt système spécifique à une guilde, ou le défaut global */
async function getSystemPrompt(guildId) {
    if (!guildId)
        return config_1.config.aiSystemPrompt;
    try {
        const gc = await prisma_1.default.guildConfig.findUnique({ where: { guildId } });
        return gc?.aiSystemPrompt || config_1.config.aiSystemPrompt;
    }
    catch {
        return config_1.config.aiSystemPrompt;
    }
}
// Map tampon pour éviter de relire la DB à chaque message (optimisation)
const channelBuffers = new Map();
// Salons avec aichat activé
const aichatChannels = new Set();
// ── Persistance ──────────────────────────────────────────────────
/** Charge l'historique d'un salon depuis la DB */
async function loadHistory(channelId) {
    try {
        const rows = await prisma_1.default.chatHistory.findMany({
            where: { channelId },
            orderBy: { createdAt: "asc" },
            take: MAX_HISTORY,
        });
        return rows.map((r) => ({
            role: r.role,
            content: r.content,
        }));
    }
    catch (err) {
        logger_1.default.error("[AIChat] Erreur chargement historique:", err);
        return [];
    }
}
/** Sauvegarde deux messages (user + assistant) dans la DB */
async function persistMessages(channelId, userMsg, assistantMsg) {
    try {
        await prisma_1.default.chatHistory.createMany({
            data: [
                { channelId, role: "user", content: userMsg },
                { channelId, role: "assistant", content: assistantMsg },
            ],
        });
    }
    catch (err) {
        logger_1.default.error("[AIChat] Erreur sauvegarde historique:", err);
    }
}
/** Purge les messages vieux de +7 jours */
async function pruneOldMessages(channelId) {
    try {
        const cutoff = new Date(Date.now() - MAX_PERSIST_MS);
        await prisma_1.default.chatHistory.deleteMany({
            where: {
                channelId,
                createdAt: { lt: cutoff },
            },
        });
    }
    catch (err) {
        logger_1.default.error("[AIChat] Erreur purge historique:", err);
    }
}
// ── API publique ─────────────────────────────────────────────────
function enableAiChat(channelId) {
    aichatChannels.add(channelId);
    if (!channelBuffers.has(channelId)) {
        channelBuffers.set(channelId, []);
    }
}
function disableAiChat(channelId) {
    aichatChannels.delete(channelId);
    channelBuffers.delete(channelId);
}
function isAiChatEnabled(channelId) {
    return aichatChannels.has(channelId);
}
function getConversationSize(channelId) {
    return channelBuffers.get(channelId)?.length || 0;
}
/** Efface l'historique d'un salon (RAM + DB) */
async function clearHistory(channelId) {
    channelBuffers.delete(channelId);
    try {
        const result = await prisma_1.default.chatHistory.deleteMany({
            where: { channelId },
        });
        return result.count;
    }
    catch (err) {
        logger_1.default.error("[AIChat] Erreur suppression historique:", err);
        return 0;
    }
}
// ── Chat avec historique persistant ──────────────────────────────
async function chatWithHistory(channelId, userMessage, username, guildId) {
    const client = (0, ai_1.getOpenAIClient)();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
        // Charger depuis la DB si le buffer est vide (premier message après démarrage)
        let buffer = channelBuffers.get(channelId);
        if (!buffer || buffer.length === 0) {
            buffer = await loadHistory(channelId);
            channelBuffers.set(channelId, buffer);
        }
        const displayName = username || "Utilisateur";
        const messages = [
            {
                role: "system",
                content: config_1.config.aiSystemPrompt +
                    "\n\nTu es dans un chat de groupe sur un serveur Discord. " +
                    "Les utilisateurs te parlent directement. Sois concis, " +
                    "reponds en quelques phrases maximum. " +
                    "Reste naturel et conversationnel. " +
                    "Tu te souviens des messages precedents dans ce salon.",
            },
        ];
        // Ajouter l'historique récent
        const recentHistory = buffer.slice(-MAX_HISTORY);
        for (const msg of recentHistory) {
            messages.push(msg);
        }
        // Ajouter le nouveau message
        messages.push({
            role: "user",
            content: `${displayName}: ${userMessage}`,
        });
        const completion = await client.chat.completions.create({
            model: config_1.config.openRouterModel,
            messages,
            max_tokens: 500,
            temperature: 0.8,
        }, { signal: controller.signal });
        const reply = completion.choices[0]?.message?.content || "(pas de reponse)";
        // Sauvegarder dans le buffer
        buffer.push({ role: "user", content: userMessage });
        buffer.push({ role: "assistant", content: reply });
        while (buffer.length > MAX_HISTORY)
            buffer.shift();
        // Persister dans la DB (fire-and-forget, pas de await pour ne pas bloquer)
        persistMessages(channelId, userMessage, reply);
        pruneOldMessages(channelId);
        return reply;
    }
    catch (err) {
        if (err?.name === "AbortError" || err?.code === "ETIMEDOUT") {
            return "⏰ L'IA met trop de temps a repondre. Reessaye.";
        }
        logger_1.default.error("[AIChat] Erreur:", err);
        return "❌ L'IA est momentanement indisponible.";
    }
    finally {
        clearTimeout(timeout);
    }
}
// ── Génération de sondages ───────────────────────────────────────
async function generatePollOptions(question) {
    const client = (0, ai_1.getOpenAIClient)();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
        const completion = await client.chat.completions.create({
            model: config_1.config.openRouterModel,
            messages: [
                {
                    role: "system",
                    content: "Tu es un generateur de sondages. Recris la question de maniere neutre et claire, puis propose 3 a 5 options pertinentes. " +
                        'Reponds UNIQUEMENT au format JSON : {"question":"...","options":["Option 1","Option 2","Option 3"]}. ' +
                        "Les options doivent etre courtes (max 55 caracteres). Sois creatif et varie les perspectives.",
                },
                { role: "user", content: question },
            ],
            max_tokens: 400,
            temperature: 0.9,
            response_format: { type: "json_object" },
        }, { signal: controller.signal });
        const raw = completion.choices[0]?.message?.content || "{}";
        const parsed = JSON.parse(raw);
        const options = parsed.options || [];
        if (parsed.question) {
            return [parsed.question, ...options.slice(0, 5)];
        }
        return [question, ...options.slice(0, 5)];
    }
    catch (err) {
        if (err?.name === "AbortError")
            return [];
        logger_1.default.error("[SmartPoll] Erreur generation:", err);
        return [];
    }
    finally {
        clearTimeout(timeout);
    }
}
//# sourceMappingURL=aichat.js.map