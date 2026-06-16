"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addMessageToConversation = addMessageToConversation;
exports.getConversationHistory = getConversationHistory;
exports.clearConversation = clearConversation;
exports.getMemoryStats = getMemoryStats;
exports.resetAllMemory = resetAllMemory;
const logger_1 = __importDefault(require("../utils/logger"));
// Stockage en mémoire (pourrait être remplacé par Redis pour la persistance)
const conversationMemory = new Map();
const MAX_MESSAGES_PER_CONVERSATION = 20; // Garder les 20 derniers messages
const CONVERSATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 heures de TTL
/**
 * Nettoie les conversations expirées
 */
function cleanupExpiredConversations() {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, conversation] of conversationMemory.entries()) {
        if (now - conversation.lastUpdated > CONVERSATION_TTL_MS) {
            conversationMemory.delete(key);
            cleaned++;
        }
    }
    if (cleaned > 0) {
        logger_1.default.debug(`[AIMemory] Nettoyage de ${cleaned} conversation(s) expirée(s)`);
    }
}
// Nettoyage automatique toutes les heures
setInterval(cleanupExpiredConversations, 60 * 60 * 1000);
/**
 * Génère une clé unique pour la conversation d'un utilisateur
 */
function getConversationKey(userId, guildId) {
    return guildId ? `${guildId}:${userId}` : `dm:${userId}`;
}
/**
 * Ajoute un message à la conversation d'un utilisateur
 */
function addMessageToConversation(userId, role, content, guildId) {
    const key = getConversationKey(userId, guildId);
    const now = Date.now();
    let conversation = conversationMemory.get(key);
    if (!conversation) {
        conversation = {
            userId,
            guildId,
            messages: [],
            lastUpdated: now
        };
        conversationMemory.set(key, conversation);
    }
    // Ajouter le nouveau message
    conversation.messages.push({
        role,
        content,
        timestamp: now
    });
    // Limiter le nombre de messages
    if (conversation.messages.length > MAX_MESSAGES_PER_CONVERSATION) {
        conversation.messages = conversation.messages.slice(-MAX_MESSAGES_PER_CONVERSATION);
    }
    conversation.lastUpdated = now;
    logger_1.default.debug(`[AIMemory] Message ajouté pour ${userId} (${role}): ${content.slice(0, 30)}...`);
}
/**
 * Récupère l'historique de conversation d'un utilisateur au format OpenRouter
 */
function getConversationHistory(userId, guildId) {
    const key = getConversationKey(userId, guildId);
    const conversation = conversationMemory.get(key);
    if (!conversation || conversation.messages.length === 0) {
        return [];
    }
    // Convertir au format OpenRouter (messages API)
    return conversation.messages.map(msg => ({
        role: msg.role,
        content: msg.content
    }));
}
/**
 * Efface la conversation d'un utilisateur
 */
function clearConversation(userId, guildId) {
    const key = getConversationKey(userId, guildId);
    conversationMemory.delete(key);
    logger_1.default.debug(`[AIMemory] Conversation effacée pour ${userId}`);
}
/**
 * Récupère les statistiques de mémoire
 */
function getMemoryStats() {
    let totalMessages = 0;
    let oldestTimestamp = null;
    for (const conversation of conversationMemory.values()) {
        totalMessages += conversation.messages.length;
        if (oldestTimestamp === null || conversation.lastUpdated < oldestTimestamp) {
            oldestTimestamp = conversation.lastUpdated;
        }
    }
    return {
        totalConversations: conversationMemory.size,
        totalMessages,
        oldestConversation: oldestTimestamp
    };
}
/**
 * Réinitialise toute la mémoire (utile pour les tests)
 */
function resetAllMemory() {
    conversationMemory.clear();
    logger_1.default.warn("[AIMemory] Toute la mémoire a été réinitialisée");
}
//# sourceMappingURL=aiMemory.js.map