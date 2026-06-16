/**
 * Ajoute un message à la conversation d'un utilisateur
 */
export declare function addMessageToConversation(userId: string, role: "user" | "assistant", content: string, guildId?: string): void;
/**
 * Récupère l'historique de conversation d'un utilisateur au format OpenRouter
 */
export declare function getConversationHistory(userId: string, guildId?: string): Array<{
    role: string;
    content: string;
}>;
/**
 * Efface la conversation d'un utilisateur
 */
export declare function clearConversation(userId: string, guildId?: string): void;
/**
 * Récupère les statistiques de mémoire
 */
export declare function getMemoryStats(): {
    totalConversations: number;
    totalMessages: number;
    oldestConversation: number | null;
};
/**
 * Réinitialise toute la mémoire (utile pour les tests)
 */
export declare function resetAllMemory(): void;
//# sourceMappingURL=aiMemory.d.ts.map