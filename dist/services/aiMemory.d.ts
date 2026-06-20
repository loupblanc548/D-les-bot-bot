/**
 * aiMemory.ts — Per-user AI memory for John Helldiver.
 *
 * Stores facts (key/value with weight decay), recent messages,
 * tone/locale metadata, and an LLM-generated summary per user.
 *
 * Design:
 *   - Facts are upserted on {userId, key}; weight increments on each
 *     remember() to encode frequency/relevance.
 *   - Recall() reads top-K facts by weight, filters out expired and
 *     below-minWeight, and bumps access counters (fire-and-forget).
 *   - decayStep() applies a multiplicative decay to facts that have
 *     been idle for N days and prunes anything that drops below the
 *     minWeight threshold; entries are logged to MemoryDecayLog.
 *   - purgeExpired() removes facts whose expiresAt is in the past.
 *
 * Concurrency: all writes are isolated per-userId; reads are parallelised
 * across (user, facts, messages) via Promise.all.
 */
export type Tone = "casual" | "formal" | "meme" | "helpful";
export interface RememberOptions {
    category?: "preference" | "personal" | "game" | "opinion" | "other";
    sourceMsg?: string;
    ttlDays?: number;
}
export interface RecallOptions {
    limit?: number;
    minWeight?: number;
    channelId?: string;
    includeMessages?: boolean;
    messageLimit?: number;
}
export interface UserMemorySnapshot {
    userId: string;
    guildId: string | null;
    tone: Tone;
    locale: string;
    summary: string | null;
    facts: Array<{
        key: string;
        value: string;
        weight: number;
        category?: string;
    }>;
    recentMessages: Array<{
        role: string;
        content: string;
        at: Date;
        channelId: string | null;
    }>;
    lastActiveAt: Date;
}
export interface DecayOptions {
    idleDays?: number;
    factor?: number;
    minWeight?: number;
}
export interface DecayResult {
    processed: number;
    pruned: number;
}
/** Create or strengthen a fact. Increments weight on duplicates. */
export declare function remember(userId: string, key: string, value: string, options?: RememberOptions): Promise<void>;
/** Read top-K facts and tail-N messages for a user (swap). */
export declare function recall(userId: string, opts?: RecallOptions): Promise<UserMemorySnapshot>;
/** Forget a single fact (by key) or all facts for a user. Returns row count. */
export declare function forget(userId: string, key?: string): Promise<number>;
/** Hard reset: remove facts, messages, and the user record entirely. */
export declare function forgetAll(userId: string): Promise<void>;
/** Append a conversation message and bump lastActiveAt in one transaction. */
export declare function appendMessage(userId: string, role: "user" | "assistant" | "system", content: string, channelId?: string): Promise<void>;
/** Set or update the conversational tone for a user. */
export declare function setTone(userId: string, tone: Tone): Promise<void>;
/** Set the LLM-generated rolling summary for a user. */
export declare function setSummary(userId: string, summary: string): Promise<void>;
/** Apply multiplicative decay to stale facts; prune anything below the floor. */
export declare function decayStep(opts?: DecayOptions): Promise<DecayResult>;
/** Hard delete all facts whose expiresAt is now in the past. Returns count. */
export declare function purgeExpired(): Promise<number>;
export declare const aiMemory: {
    remember: typeof remember;
    recall: typeof recall;
    forget: typeof forget;
    forgetAll: typeof forgetAll;
    appendMessage: typeof appendMessage;
    setTone: typeof setTone;
    setSummary: typeof setSummary;
    decayStep: typeof decayStep;
    purgeExpired: typeof purgeExpired;
};
export declare function addMessageToConversation(userId: string, role: "user" | "assistant" | "system", content: string, channelId?: string): Promise<void>;
export declare function getConversationHistory(userId: string, channelId?: string): Promise<UserMemorySnapshot["recentMessages"]>;
export declare function clearConversation(userId: string): Promise<number>;
//# sourceMappingURL=aiMemory.d.ts.map