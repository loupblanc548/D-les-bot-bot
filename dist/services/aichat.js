import logger from "../utils/logger.js";
import prisma from "../prisma.js";
import { getOpenAIClient } from "./ai.js";
import { config } from "../config.js";
// ── Configuration ────────────────────────────────────────────────
const MAX_HISTORY = 20; // Max messages chargés depuis la DB
const MAX_PERSIST_MS = 7 * 24 * 60 * 60 * 1000; // Rétention 7 jours
/** Récupère le prompt système spécifique à une guilde, ou le défaut global */
async function getSystemPrompt(guildId) {
    if (!guildId)
        return config.aiSystemPrompt;
    try {
        const gc = await prisma.guildConfig.findUnique({ where: { guildId } });
        return gc?.aiSystemPrompt || config.aiSystemPrompt;
    }
    catch {
        return config.aiSystemPrompt;
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
        const rows = await prisma.chatHistory.findMany({
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
        logger.error("[AIChat] Erreur chargement historique:", err);
        return [];
    }
}
/** Sauvegarde deux messages (user + assistant) dans la DB */
async function persistMessages(channelId, userMsg, assistantMsg) {
    try {
        await prisma.chatHistory.createMany({
            data: [
                { channelId, role: "user", content: userMsg },
                { channelId, role: "assistant", content: assistantMsg },
            ],
        });
    }
    catch (err) {
        logger.error("[AIChat] Erreur sauvegarde historique:", err);
    }
}
/** Purge les messages vieux de +7 jours */
async function pruneOldMessages(channelId) {
    try {
        const cutoff = new Date(Date.now() - MAX_PERSIST_MS);
        await prisma.chatHistory.deleteMany({
            where: {
                channelId,
                createdAt: { lt: cutoff },
            },
        });
    }
    catch (err) {
        logger.error("[AIChat] Erreur purge historique:", err);
    }
}
// ── API publique ─────────────────────────────────────────────────
export function enableAiChat(channelId) {
    aichatChannels.add(channelId);
    if (!channelBuffers.has(channelId)) {
        channelBuffers.set(channelId, []);
    }
}
export function disableAiChat(channelId) {
    aichatChannels.delete(channelId);
    channelBuffers.delete(channelId);
}
export function isAiChatEnabled(channelId) {
    return aichatChannels.has(channelId);
}
export function getConversationSize(channelId) {
    return channelBuffers.get(channelId)?.length || 0;
}
/** Efface l'historique d'un salon (RAM + DB) */
export async function clearHistory(channelId) {
    channelBuffers.delete(channelId);
    try {
        const result = await prisma.chatHistory.deleteMany({
            where: { channelId },
        });
        return result.count;
    }
    catch (err) {
        logger.error("[AIChat] Erreur suppression historique:", err);
        return 0;
    }
}
// ── Chat avec historique persistant ──────────────────────────────
export async function chatWithHistory(channelId, userMessage, username, guildId) {
    const client = getOpenAIClient();
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
                content: config.aiSystemPrompt +
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
            model: config.openRouterModel,
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
        logger.error("[AIChat] Erreur:", err);
        return "❌ L'IA est momentanement indisponible.";
    }
    finally {
        clearTimeout(timeout);
    }
}
// ── Génération de sondages ───────────────────────────────────────
export async function generatePollOptions(question) {
    const client = getOpenAIClient();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
        const completion = await client.chat.completions.create({
            model: config.openRouterModel,
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
        logger.error("[SmartPoll] Erreur generation:", err);
        return [];
    }
    finally {
        clearTimeout(timeout);
    }
}
//# sourceMappingURL=aichat.js.map