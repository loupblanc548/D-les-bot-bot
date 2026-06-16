import logger from "../utils/logger";

/**
 * Service de mémoire contextuelle IA par utilisateur
 * Permet au bot de se souvenir des conversations précédentes pour des réponses plus contextuelles
 */

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface UserConversation {
  userId: string;
  guildId?: string;
  messages: ConversationMessage[];
  lastUpdated: number;
}

// Stockage en mémoire (pourrait être remplacé par Redis pour la persistance)
const conversationMemory = new Map<string, UserConversation>();

const MAX_MESSAGES_PER_CONVERSATION = 20; // Garder les 20 derniers messages
const CONVERSATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 heures de TTL

/**
 * Nettoie les conversations expirées
 */
function cleanupExpiredConversations(): void {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, conversation] of conversationMemory.entries()) {
    if (now - conversation.lastUpdated > CONVERSATION_TTL_MS) {
      conversationMemory.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.debug(`[AIMemory] Nettoyage de ${cleaned} conversation(s) expirée(s)`);
  }
}

// Nettoyage automatique toutes les heures
setInterval(cleanupExpiredConversations, 60 * 60 * 1000);

/**
 * Génère une clé unique pour la conversation d'un utilisateur
 */
function getConversationKey(userId: string, guildId?: string): string {
  return guildId ? `${guildId}:${userId}` : `dm:${userId}`;
}

/**
 * Ajoute un message à la conversation d'un utilisateur
 */
export function addMessageToConversation(
  userId: string,
  role: "user" | "assistant",
  content: string,
  guildId?: string
): void {
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

  logger.debug(`[AIMemory] Message ajouté pour ${userId} (${role}): ${content.slice(0, 30)}...`);
}

/**
 * Récupère l'historique de conversation d'un utilisateur au format OpenRouter
 */
export function getConversationHistory(
  userId: string,
  guildId?: string
): Array<{ role: string; content: string }> {
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
export function clearConversation(userId: string, guildId?: string): void {
  const key = getConversationKey(userId, guildId);
  conversationMemory.delete(key);
  logger.debug(`[AIMemory] Conversation effacée pour ${userId}`);
}

/**
 * Récupère les statistiques de mémoire
 */
export function getMemoryStats(): {
  totalConversations: number;
  totalMessages: number;
  oldestConversation: number | null;
} {
  let totalMessages = 0;
  let oldestTimestamp: number | null = null;

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
export function resetAllMemory(): void {
  conversationMemory.clear();
  logger.warn("[AIMemory] Toute la mémoire a été réinitialisée");
}
