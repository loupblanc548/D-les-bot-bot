export declare function enableAiChat(channelId: string): void;
export declare function disableAiChat(channelId: string): void;
export declare function isAiChatEnabled(channelId: string): boolean;
export declare function getConversationSize(channelId: string): number;
/** Efface l'historique d'un salon (RAM + DB) */
export declare function clearHistory(channelId: string): Promise<number>;
export declare function chatWithHistory(channelId: string, userMessage: string, username?: string, guildId?: string): Promise<string>;
export declare function generatePollOptions(question: string): Promise<string[]>;
//# sourceMappingURL=aichat.d.ts.map